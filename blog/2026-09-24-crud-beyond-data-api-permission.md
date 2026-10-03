---
title: CRUD 之外 - 数据接口权限的分层与切面
authors: [cbtpro]
description: 拆分认证、动作授权与数据范围，用注解元数据驱动 AOP 切面，结合 MyBatis 拦截器改写 SQL，并处理鉴权失败的统一返回与规则缓存。
tags:
  - crud
  - 后端
  - spring
  - 安全
---

列表上的"编辑"按钮被前端权限封装藏起来，并不意味着接口可以不鉴权。用户用 Postman 直接调 `/api/orders/123`，照样能改到别人的订单。前端权限只是减少误操作的服务体验，服务端必须自己挡住每一次请求。

数据接口的权限要分清三件事：这个请求是谁发的(认证)、能不能做这个动作(授权)、能看到或改动哪些数据(数据范围)。把它们混在一段拦截器里，会让规则散落、难以测试，也无法处理"只看本部门"这种需要改写 SQL 的需求。

{/* truncate */}

## 朴素实现:每个接口加注解

最直觉的做法是在 Controller 方法上贴注解：

```java title="OrderController.java 的朴素写法"
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @PreAuthorize("hasRole('ORDER_VIEW')")
    @GetMapping
    public List<Order> list() { /* ... */ }

    @PreAuthorize("hasRole('ORDER_EDIT') and @orderOwnerChecker.isOwner(#id)")
    @PutMapping("/{id}")
    public void update(@PathVariable Long id, @RequestBody OrderUpdate cmd) { /* ... */ }
}
```

第一周很顺手。一个月后列表加了导出，开发者在新接口上写了 `hasRole('ORDER_VIEW')`，但忘了把"只能看本部门"补上，越权数据就漏出去了。

这套写法有三个具体坑：

规则在多个接口重复声明。同一个订单资源，list、detail、update、export 都要写一遍"订单查看"或"订单编辑"，改规则得逐个找。`ORDER_VIEW` 一开始只控制列表，后来要求也能看详情，新接口忘了加就变成内部接口未授权可访问。

业务状态权限塞进 SpEL 后越来越长。`@orderOwnerChecker.isOwner(#id)` 是好的，等需求变成"创建人或同部门主管可编辑"，SpEL 就成了 `hasRole('ORDER_EDIT') and (@orderOwnerChecker.isOwner(#id) or @deptChecker.isManagerOf(#id))`。表达式越长越难单测，调试时只能从异常信息倒推哪一段失败。

数据范围权限注解表达不了。"只看本部门"需要在 SQL 里加 `WHERE dept_id = ?`。注解只能拿到方法参数，拿不到最终的 SQL，更拿不到结果集。最后只能在每个 Mapper 手写条件，漏一个就是越权。

## 把三件事拆开

权限的三件事来源不同、表达方式不同，硬塞在一层会彼此污染。把它们分开后，每一层只关心自己的输入：

```java title="三个策略接口"
// 认证:从请求上下文取出当前用户，由 Filter 或拦截器完成，不在切面内重复实现。
public interface CurrentUser {
    Long userId();
    Set<String> roles();
    Long deptId();
}

// 动作授权:判断"这个用户能否做这个动作"，输入是用户和动作码。
public interface ActionAuthorizer {
    boolean can(CurrentUser user, String action, Object ctx);
}

// 数据范围:返回该用户可见的数据约束，由 SQL 拦截器拼到 WHERE 子句。
public interface DataScopeResolver {
    DataScope resolve(CurrentUser user, String resource);
}
```

`DataScope` 是不可变值对象，表达 `dept_id IN (...)` 这类条件。三个接口互相不依赖，单测时各写各的用例。

## 注解只声明元数据

注解不写规则，只写"这个接口需要哪些动作码、属于哪个资源"。规则集中在策略实现里，注解只是元数据的载体：

```java title="Permission.java 注解定义"
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Permission {
    String resource();
    String action();
    // 数据范围类型，空字符串表示不施加行级过滤。
    String scope() default "";
}
```

Controller 上的写法回到只描述"这是什么"：

```java title="OrderController.java 的注解写法"
@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @Permission(resource = "order", action = "view", scope = "dept")
    @GetMapping
    public List<Order> list() { /* ... */ }

    @Permission(resource = "order", action = "edit")
    @PutMapping("/{id}")
    public void update(@PathVariable Long id, @RequestBody OrderUpdate cmd) { /* ... */ }
}
```

`update` 不写 `scope`，因为行级过滤对单条更新没有意义，单条更新要靠 `ActionAuthorizer` 校验业务状态。`list` 写 `scope = "dept"`，列表查询走 SQL 改写。

## 权限颗粒度的取舍

权限的颗粒度从粗到细大致四档：角色、动作、资源、数据范围。粗的省事，细的灵活，但维护成本也按比例上升。

只按角色判断(`admin`、`operator`)最省事，但只要职责一变就要改代码。"运营可以看订单但不能改"这种需求，用角色组合表达不出来，最后还是拆成动作。动作粒度(`order:view`、`order:edit`)能覆盖大多数功能开关，是中后台最常用的颗粒度。资源粒度把动作绑到具体资源(`order:edit` 和 `user:edit` 是两件事)，避免"有任意 edit 角色就能编辑所有资源"。数据范围是行级粒度，决定 `order:view` 这个动作能看到哪些行。

颗粒度不是越细越好。把"订单编辑"再细分成"订单基本信息编辑""订单金额编辑""订单状态编辑"，三个动作码分别授权，会让角色配置膨胀，运营也搞不清该勾哪个。常见做法是停在"动作 + 资源"，少数敏感字段(如金额)走字段级权限，由 `ActionAuthorizer` 在策略里单独判断，不再加新动作码。

下面几节用到的动作码统一按 `资源:动作` 命名，例如 `order:view`、`order:export`、`order:import`，文件类动作用 `order:upload`、`order:download`。命名一致，前端、配置表、切面之间不会因为大小写或分隔符差一行对不上。

## AOP 切面拼装鉴权流程

切面只负责把元数据取出来交给策略，自己不写规则。这样规则变了，切面不动；切面要加日志或缓存，规则不动。

```java title="PermissionAspect.java"
@Aspect
@Component
public class PermissionAspect {
    private final CurrentUser currentUser;
    private final ActionAuthorizer authorizer;

    public PermissionAspect(CurrentUser currentUser, ActionAuthorizer authorizer) {
        this.currentUser = currentUser;
        this.authorizer = authorizer;
    }

    @Around("@annotation(permission)")
    public Object around(ProceedingJoinPoint pjp, Permission permission) throws Throwable {
        CurrentUser user = currentUser;
        if (!authorizer.can(user, permission.action(), contextOf(pjp))) {
            throw new AccessDeniedException(permission.action());
        }
        // 资源和范围放进 ThreadLocal，供 SQL 拦截器在下一跳读取。
        DataScopeContext.set(permission.resource(), permission.scope(), user);
        try {
            return pjp.proceed();
        } finally {
            DataScopeContext.clear();
        }
    }

    private Object contextOf(ProceedingJoinPoint pjp) {
        // 简化示例:把方法参数作为业务上下文交给策略，策略按需取 id 或状态。
        return Arrays.asList(pjp.getArgs());
    }
}
```

`DataScopeContext` 是包级别的 ThreadLocal，由切面写入、SQL 拦截器读取、`finally` 清理。`AccessDeniedException` 由全局异常处理统一转成 403 响应，前端不再需要在每个 `fetch` 里手写错误分支。

## 动作授权按需查业务状态

策略实现里把"是否本部门主管"这类业务判断集中起来。`@orderOwnerChecker.isOwner(#id)` 那种 SpEL 拆出来就是普通方法，可以直接单测：

```java title="OrderAuthorizer.java"
@Component
public class OrderAuthorizer implements ActionAuthorizer {
    private final OrderQueryService query;

    public OrderAuthorizer(OrderQueryService query) {
        this.query = query;
    }

    @Override
    public boolean can(CurrentUser user, String action, Object ctx) {
        if (user.roles().contains("admin")) {
            return true;
        }
        return switch (action) {
            case "view" -> user.roles().contains("order:view");
            case "edit" -> canEdit(user, ctx);
            default -> false;
        };
    }

    private boolean canEdit(CurrentUser user, Object ctx) {
        Long orderId = firstLongOf(ctx);
        Order order = query.findById(orderId);
        if (order == null) return false;
        if (order.creatorId().equals(user.userId())) return true;
        return query.isManagerOf(user.userId(), order.deptId());
    }
}
```

`Order` 用 record 作为不可变值对象，避免在策略里意外修改字段。`findById` 的查询本身也需要被 `view` 权限保护，避免"鉴权用的读取"绕过数据范围。实际项目可以让鉴权读取走单独的内部通道，不经过 SQL 拦截器的范围改写。

## 导出、导入与文件接口的鉴权

CRUD 之外还有四类动作需要单独的动作码：导出、导入、上传、下载。它们的鉴权点和增删改查不一样，不能复用同一份策略。

导出是查询，但要落到 SQL 拦截器。给一个用户授予 `order:export` 但没授予"全量可见"的数据范围，导出 SQL 就要走 `DataScopeInterceptor`，否则会把他人订单也导出去。导出文件名也要避免按导出范围命名引发歧义，列表叫"我的订单.xlsx"，全量叫"全公司订单.xlsx"，让用户一眼看出这次导出的边界。

导入相当于批量创建，鉴权要看"对方有没有 `order:create`"而不是新增一个 `order:import` 动作。给 `order:import` 单独的权限码会让运营误以为导入是一种新权限，绕过了创建的限制。导入还要校验文件大小、行数上限、字段格式，这些属于业务校验，不放进权限层：

```java title="ImportAuthorizer.java 片段"
@Override
public boolean can(CurrentUser user, String action, Object ctx) {
    // 导入复用 create 的权限，避免运营误以为导入是新权限。
    return delegate.can(user, "create", ctx);
}
```

上传和下载要绑定资源归属。订单附件上传要记录 `orderId` 与上传人，下载时按 `order:download` 校验，同时检查这个附件归属的订单是否在当前用户的数据范围内。和详情接口的二次校验一样，文件下载不能只看动作码，要回查关联实体的可见性。

文件类动作还要叠加配额和频率限制。同一个用户一天导出几次、一次最多多少行、上传单文件多大，这些由独立的限流模块处理，鉴权只判断"能不能做"，不做"今天还能做多少"。

```java title="OrderController.java 的文件类接口"
@Permission(resource = "order", action = "export", scope = "dept")
@GetMapping("/export")
public void export(HttpServletResponse response) { /* ... */ }

@Permission(resource = "order", action = "create")
@PostMapping("/import")
public void importOrders(@RequestParam MultipartFile file) { /* ... */ }

@Permission(resource = "order", action = "upload")
@PostMapping("/{id}/attachments")
public void upload(@PathVariable Long id, @RequestParam MultipartFile file) { /* ... */ }

@Permission(resource = "order", action = "download")
@GetMapping("/attachments/{attachmentId}")
public void download(@PathVariable Long attachmentId, HttpServletResponse response) { /* ... */ }
```

导入这里写的是 `action = "create"` 而不是 `action = "import"`，把"导入是批量创建"这件事在注解上就表达清楚。`upload` 和 `download` 是独立动作码，因为它们涉及文件存储和归属，不是单纯的数据增删。

## SQL 拦截器做数据范围

行级过滤必须落到 SQL，否则"只看本部门"只是把列表筛了一下，详情接口依然能越权拿到他人数据。MyBatis 拦截器在执行前改写 BoundSql：

```java title="DataScopeInterceptor.java"
@Intercepts({@Signature(type = Executor.class, method = "query",
        args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class})})
public class DataScopeInterceptor implements Interceptor {
    private final DataScopeResolver resolver;

    public DataScopeInterceptor(DataScopeResolver resolver) {
        this.resolver = resolver;
    }

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        DataScopeContext.Scope scope = DataScopeContext.current();
        if (scope == null || scope.scopeType().isBlank()) {
            return invocation.proceed();
        }
        Object[] args = invocation.getArgs();
        MappedStatement ms = (MappedStatement) args[0];
        BoundSql bound = ms.getBoundSql(args[1]);
        DataScope data = resolver.resolve(scope.user(), scope.resource());
        appendWhere(ms, bound, data);
        return invocation.proceed();
    }

    // 追加带占位符的条件，参数走 ParameterMapping 绑定，不再拼值进 SQL。
    private void appendWhere(MappedStatement ms, BoundSql bound, DataScope data) throws ReflectiveOperationException {
        String clause = data.clause();
        String original = bound.getSql();
        String withWhere = original.toLowerCase().contains(" where ")
            ? original + " AND " + clause
            : original + " WHERE " + clause;

        Field sqlField = BoundSql.class.getDeclaredField("sql");
        sqlField.setAccessible(true);
        sqlField.set(bound, withWhere);

        // 追加 ParameterMapping，引用 additionalParameter 中的值。
        List<ParameterMapping> mappings = new ArrayList<>(bound.getParameterMappings());
        Configuration config = ms.getConfiguration();
        List<Object> params = data.parameters();
        for (int i = 0; i < params.size(); i++) {
            String name = "__dataScope_" + i;
            mappings.add(new ParameterMapping.Builder(config, name, Object.class).build());
            bound.setAdditionalParameter(name, params.get(i));
        }

        Field mappingsField = BoundSql.class.getDeclaredField("parameterMappings");
        mappingsField.setAccessible(true);
        mappingsField.set(bound, mappings);
    }
}
```

`DataScope.clause()` 返回 `dept_id = ?` 或 `dept_id IN (?, ?)`，值通过 `parameters()` 单独给出。拦截器把它们注册成 MyBatis 的 `ParameterMapping`，绑定到 `BoundSql` 的 `additionalParameters` 上。整条 SQL 里看不到任何具体的部门 ID 字面量，SQL 注入面被关掉。

拦截器只在切面设置了 `DataScopeContext` 时介入，不影响其他模块。事务管理、连接池、缓存等仍由 MyBatis 原有流程负责。注册到全局配置时只挂一次，多实例通过 Spring 配置类装配。

## 数据范围的几种类型

```java title="DataScope.java 的策略值对象"
public sealed interface DataScope permits DataScope.All, DataScope.Dept, DataScope.None {

    String clause();
    List<Object> parameters();

    record All() implements DataScope {
        public String clause() { return "1 = 1"; }
        public List<Object> parameters() { return List.of(); }
    }

    record Dept(Long deptId, List<Long> subDeptIds) implements DataScope {
        public String clause() {
            // 占位符数量与参数对齐，值永远走绑定，不拼进 SQL。
            String placeholders = Collections.nCopies(ids().size(), "?")
                .stream().collect(Collectors.joining(","));
            return "dept_id IN (" + placeholders + ")";
        }
        public List<Object> parameters() {
            return ids().stream().map(Long.class::cast).toList();
        }
        private List<Long> ids() {
            List<Long> all = new ArrayList<>(subDeptIds);
            all.add(deptId);
            return List.copyOf(all);
        }
    }

    record None() implements DataScope {
        public String clause() { return "1 = 0"; }
        public List<Object> parameters() { return List.of(); }
    }
}
```

`All` 给管理员，`Dept` 给部门用户，`None` 给被冻结的账号。`None` 直接返回 `1 = 0`，比抛异常更能兼容"列表为空"的 UI 状态。`Dept` 的部门树由组织架构服务预计算并缓存，避免每次查询都递归。

部门 ID 来自服务端缓存的 Long，但实现仍然只产出占位符，不把值拼进 SQL。参数化带来的不是性能开销，是关闭了"未来某天值变成字符串、变成外部输入"的注入面——把约束写死在类型上，比写在注释里更可靠。

## 详情接口的二次校验

列表走 SQL 改写后，用户在页面上能看到的订单都是他有权访问的。但详情接口 `GET /api/orders/{id}` 一旦按 ID 直查，用户可以拿别人的 ID 试。SQL 拦截器对单条查询同样生效，但仍要处理两种边界。

第一种是 `selectById` 这种通用 Mapper 方法。它在不同 Controller 里被复用，可能出现在不需要数据范围的内部读取里。无差别改写会破坏鉴权专用通道。常见做法是给单条查询也准备一条带数据范围的 Mapper，详情接口走这条，内部读取走原方法：

```java title="OrderMapper.java"
public interface OrderMapper {

    // 通用查询，不带数据范围，供内部服务调用。
    Order selectById(Long id);

    // 带数据范围的详情查询，由 DataScopeInterceptor 追加 WHERE 条件。
    Order selectVisibleById(Long id);

    // 列表查询，同样由拦截器处理。
    List<Order> selectPage(OrderQuery query);
}
```

```xml title="OrderMapper.xml 的详情查询"
<select id="selectVisibleById" resultType="Order">
    SELECT * FROM orders
    WHERE id = #{id}
    <!-- 数据范围由拦截器在执行时追加 -->
</select>
```

`DataScopeInterceptor` 看到 `DataScopeContext` 已设置就追加 `AND dept_id IN (...)`，没查到记录时返回 404 而不是 403。这样既不泄露"这条订单存在但你看不到"，又能复用列表已建立的过滤规则。

第二种是关联实体的二次校验。订单详情里挂了附件、操作日志、客户信息，这些来自不同表，不能都在一条 SQL 上加 `dept_id`。校验入口仍然在订单本体上：先把订单按上面的方式取出来，附件和日志按 `orderId` 关联查询，鉴权只校验"主订单可见"一次。关联表本身不重复鉴权，避免一次详情调用触发 N 次数据范围解析。

详情接口的二次校验同样适用于文件下载。下载附件先按 `attachmentId` 查到附件，再按附件里的 `orderId` 走订单的可见性校验。文件下载的鉴权链路比动作码多一跳，但不要为了短路径就把附件 ID 直接暴露在 URL 上不做归属校验。

## 鉴权失败的统一返回

切面抛 `AccessDeniedException`，全局异常处理统一翻译成响应。前端只需要在拦截器里识别 `code` 字段决定跳转或提示，不再为每个接口写错误分支：

```java title="GlobalExceptionHandler.java 片段"
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> onDenied(AccessDeniedException error) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ApiError("PERMISSION_DENIED", "无权限完成此操作"));
    }

    public record ApiError(String code, String message) {}
}
```

数据范围触发的"结果为空"不抛异常，前端按正常空列表处理。动作授权失败才抛 403，前端在弹窗或 toast 里给出提示。两类反馈分开，避免"看不到数据"和"做不了动作"被前端混为一谈。

## 规则缓存与失效

动作授权里 `OrderQueryService.findById` 每次鉴权都会调一次。订单状态变更频率远低于请求频率时，可以把鉴权上下文按 `orderId` 短时缓存：

```java title="OrderQueryService.java 片段"
private final Cache<Long, Optional<Order>> cache = Caffeine.newBuilder()
    .expireAfterWrite(Duration.ofSeconds(5))
    .maximumSize(10_000)
    .build();

public Order findById(Long id) {
    return cache.get(id, key -> Optional.ofNullable(mapper.selectById(id)))
        .orElse(null);
}
```

短 TTL 让订单状态更新后能在数秒内对鉴权可见，长 TTL 会放大状态变更延迟，导致刚改完仍按旧状态鉴权。要求强一致的场景在订单状态变更入口显式 `cache.invalidate(id)`，保证下一步鉴权看到新状态。

角色权限码与数据范围规则由更稳定的缓存承载，变更频率低，可以放 Redis 共享。规则更新走消息通知各实例失效，或直接由定时刷新收敛，逻辑与字典缓存的失效流程一致。

## 权限配置:注解还是数据表

`@Permission` 注解声明的是"这个接口存在什么动作"，是代码契约，不应该是运营配置的入口。把注解里的动作码搬到数据表，看上去灵活，实际上让接口和配置脱钩：运营改了配置，但代码里的接口没变，结果动作码对不上，鉴权要么全过要么全拒。

两份信息分开放。注解描述接口侧的事实：`/api/orders` 的 list 是 `order:view`，这个关系写在代码里，跟随版本发布。数据表描述运营侧的决策：哪个角色拥有 `order:view`、哪些数据范围类型对哪些资源生效。两份信息不互相替代，互相引用：

```java title="注解约束 + 数据表配置的组合"
// 接口侧:声明这个接口存在什么动作，编译期固定。
@Permission(resource = "order", action = "view", scope = "dept")
@GetMapping
public List<Order> list() { /* ... */ }

// 运营侧:角色拥有哪些动作码，运行时可调。
// role_permission 表:(role_code, action)
// role_data_scope 表:(role_code, resource, scope_type)
```

接口上线时，动作码已经在注解里写好，运营配置的角色只能引用已存在的动作码。配置一个不存在的动作码不会有效果，等于编译期就拒绝了越权尝试。数据范围的类型集合也由代码定义(枚举或常量)，运营只能选择已有类型，不能新增"按客户隔离"这种类型，除非先在 `DataScopeResolver` 里实现它。

`@Permission` 缺失时怎么处理，是这套配置的关键决策。允许缺失意味着新接口默认可访问，一旦开发者忘加注解就是越权漏洞。强烈建议在测试基线里加一条规则：所有 `@RequestMapping` 的 public 方法必须有 `@Permission` 或显式的 `@PermitAll`。CI 跑一遍反射扫描，漏一个就构建失败。这种"默认拒绝"的策略和"导入复用 create 动作"那节思路一致，都是把"该有的限制"放在最显眼的位置，而不是事后补救。

## 角色与权限组

角色是动作码的集合。如果角色直接挂单个动作码，运营要给"订单管理员"勾选 `order:view`、`order:create`、`order:edit`、`order:export`、`order:download` 五六个码，每个资源都重复一遍。权限组把同一资源的常用动作打包：

```sql title="权限组与角色关联"
-- permission_group 表:把动作打包成组
-- (group_code, action)
INSERT INTO permission_group(group_code, action) VALUES
  ('order.manage', 'order:view'),
  ('order.manage', 'order:create'),
  ('order.manage', 'order:edit'),
  ('order.manage', 'order:export'),
  ('order.manage', 'order:download'),
  ('order.readonly', 'order:view'),
  ('order.readonly', 'order:download');

-- role_group 表:角色绑定权限组
-- (role_code, group_code)
INSERT INTO role_group(role_code, group_code) VALUES
  ('order_manager', 'order.manage'),
  ('order_viewer',  'order.readonly');
```

`ActionAuthorizer` 不再按动作码逐个比对，而是先解析当前用户的角色，查到所有权限组，再展开成动作码集合：

```java title="RoleBasedAuthorizer.java 片段"
@Override
public boolean can(CurrentUser user, String action, Object ctx) {
    // 把角色展开成动作码集合，缓存由 RolePermissionCache 提供。
    Set<String> actions = rolePermissionCache.actionsOf(user.roles());
    return actions.contains(action);
}
```

`RolePermissionCache` 启动时加载 `role -> group -> action` 的展开结果，放 Redis 共享，角色调整时按角色失效。展开算法只跑一次，鉴权路径上只是个 `Set.contains`，不会因角色多而变慢。

权限组不是越细越好。"订单基本信息编辑"和"订单金额编辑"如果拆成两个权限组，运营配置会爆炸。把动作按业务职责打包，"订单管理""订单只读""订单财务"这种粗粒度组比"订单字段级编辑"这种细粒度组更好维护。字段级权限留在 `ActionAuthorizer` 内部判断，不出现在角色配置里。

`admin` 角色可以走单独的短路分支，直接 `return true`。但要有审计：管理员执行敏感动作时单独记日志，避免"管理员权限太大没人敢动"的盲区。

## 前端权限的边界

前端权限只做一件事：减少误操作和减少无意义请求。按钮显隐、菜单可见、字段禁用，目的是让用户看不到自己点不动的入口。真正的拦截永远在服务端。

前端拿到的权限码集合来自服务端登录后下发，不应该是前端硬编码的规则。规则放前端意味着改规则要发版，而且无法防 Postman 直调。前端只读不写：

```ts title="前端权限的只读集合"
// 登录后从后端获取，存入全局状态。
type Permission = { actions: string[]; scopes: Record<string, string> }

const can = (action: string) => permissions.actions.includes(action)

// 显隐按钮:只用后端下发的动作码，不在前端补判断规则。
{can('order:edit') && <Button onClick={handleEdit}>编辑</Button>}
```

前端不重复实现"创建人才能编辑"这种业务状态判断。这类规则在后端的 `ActionAuthorizer` 里，前端要么按数据状态显示禁用按钮(体验)，要么干脆不显示(更保守)。数据状态在前端只能拿到列表/详情接口返回的字段，规则可能随时变化，前端照搬规则会和后端脱节。把数据状态判断留给后端，前端只用"用户有没有这个动作码"决定显隐。

按钮级权限的具体封装方式(禁用、隐藏、确认弹窗)在另一篇 [CRUD 之外 - 按钮级权限的统一封装](/blog/2026/09/20/crud-beyond-permission-wrapper/) 里有详细讨论。这里的重点是：前端封装要服务于体验，不要试图在前端复刻后端的规则。前端显隐错了，用户可能看到一个点不动的按钮；后端鉴权漏了，用户能改到别人的订单。两者后果不在一个量级，所以前端的精度可以低，后端的覆盖必须全。

## 做成 Spring Boot Starter

把前面这套分层打成 starter，使用方加一个依赖、提供 `CurrentUser` 实现、在 Controller 上贴注解就能跑起来。starter 自己负责切面、SQL 拦截器、规则缓存的装配，业务方只替换策略实现。

关键设计不是"哪些放进去"，是"哪些放出去"。`CurrentUser` 必须由使用者实现，它绑定具体业务的用户模型，订单系统的用户字段、用户中心下发的角色码格式都不一样。`ActionAuthorizer`、`DataScopeResolver` 提供默认实现，但用 `@ConditionalOnMissingBean` 留替换口，使用者可以整份换。切面、SQL 拦截器、注解扫描不开放替换，是 starter 的内部实现，换它们等于换 starter。

自动配置按条件装配，没接入的部分自动降级：

```java title="PermissionAutoConfiguration.java"
@AutoConfiguration
@ConditionalOnProperty(name = "permission.enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(PermissionProperties.class)
public class PermissionAutoConfiguration {

    // 业务方没提供就给一个空实现，启动不报错，但任何动作都会被拒绝。
    @Bean
    @ConditionalOnMissingBean
    public CurrentUser currentUser() {
        return new CurrentUser() {
            public Long userId() { return null; }
            public Set<String> roles() { return Set.of(); }
            public Long deptId() { return null; }
        };
    }

    @Bean
    @ConditionalOnMissingBean
    public ActionAuthorizer actionAuthorizer(RolePermissionCache cache) {
        return new RoleBasedAuthorizer(cache);
    }

    // 默认实现一律返回 None，没接入数据范围的资源看不到任何行，而不是看到全部。
    @Bean
    @ConditionalOnMissingBean
    public DataScopeResolver dataScopeResolver() {
        return (user, resource) -> DataScope.none();
    }

    @Bean
    @ConditionalOnMissingBean
    public PermissionAspect permissionAspect(CurrentUser user, ActionAuthorizer auth) {
        return new PermissionAspect(user, auth);
    }
}
```

`matchIfMissing = true` 让默认开启，使用方想关掉整段权限走灰度时改 yaml 即可，不用动代码。默认 `DataScopeResolver` 返回 `None` 而不是 `All`，是 starter 安全姿态的体现：没配置就看不到，比没配置就全看到更稳。等使用者主动声明 `@Permission(scope = "dept")` 并提供 `DataScopeResolver` 后，才放行对应资源。

MyBatis 拦截器单独拆一份配置类，使用者没引 MyBatis 时这份类不被加载，不会触发 `NoClassDefFoundError`：

```java title="PermissionMybatisAutoConfiguration.java"
@AutoConfiguration
@ConditionalOnClass(name = "org.apache.ibatis.plugin.Interceptor")
@ConditionalOnProperty(name = "permission.data-scope.enabled", havingValue = "true", matchIfMissing = true)
public class PermissionMybatisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public DataScopeInterceptor dataScopeInterceptor(DataScopeResolver resolver) {
        return new DataScopeInterceptor(resolver);
    }

    // 通过 ConfigurationCustomizer 注册，避免和 MyBatis 自动配置的时序冲突。
    @Bean
    public ConfigurationCustomizer permissionInterceptorCustomizer(DataScopeInterceptor interceptor) {
        return configuration -> configuration.addInterceptor(interceptor);
    }
}
```

`@ConditionalOnClass` 必须配独立的配置类。把 `DataScopeInterceptor` 放进主配置类，使用方没引 MyBatis 时主配置类一旦加载，import 语句就会触发 `NoClassDefFoundError`。拆出来后，Spring Boot 在 `@ConditionalOnClass` 失败时根本不会加载这份配置类，`DataScopeInterceptor` 类的引用链不会被执行。

两份配置类都注册到 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`：

```text title="META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports"
com.example.permission.PermissionAutoConfiguration
com.example.permission.PermissionMybatisAutoConfiguration
```

Spring Boot 3 走这份清单，Spring Boot 2 那条 `spring.factories` 的 autoconfigure 入口已弃用，新 starter 不必再维护。

使用方接入只剩三件事：

```text title="使用方接入步骤"
1. 加依赖:
   implementation 'com.example:permission-spring-boot-starter:1.0.0'

2. 提供 CurrentUser 实现:从 ThreadLocal 或 SecurityContextHolder 取当前用户。
3. 在 Controller 上加 @Permission 注解。
```

```java title="使用方接入代码"
@Component
public class HttpCurrentUser implements CurrentUser {
    private final UserContextHolder holder;

    public HttpCurrentUser(UserContextHolder holder) {
        this.holder = holder;
    }

    @Override public Long userId() { return holder.get().userId(); }
    @Override public Set<String> roles() { return holder.get().roles(); }
    @Override public Long deptId() { return holder.get().deptId(); }
}

@Permission(resource = "order", action = "view", scope = "dept")
@GetMapping
public List<Order> list() { /* ... */ }
```

starter 内部不依赖订单、用户这些业务实体。它只认动作码、资源、数据范围类型，三类抽象可以表达任意业务的权限需求。动作码编进注解，范围类型注册到 `DataScopeResolver`，starter 把它们挂到运行链路。新增一个"按客户隔离"的范围类型，使用方在自己的 `DataScopeResolver` 里加一个分支，starter 内部一行不改。

starter 的边界也很清楚：它不做认证。认证由 spring-security、Sa-Token、自研网关完成，starter 只读 `CurrentUser`。把认证塞进 starter 会和现有方案打架，使用者反而接不进来。这一段取舍和"导入复用 create 动作"那节的逻辑一致——把"不该 starter 做的事"明确剥离，比把功能堆得越多越通用更好维护。

## 把分层合到一起

整个鉴权链路按职责分布到不同模块，切面只做编排：

```text
请求进入
  -> 认证 Filter 写入 CurrentUser
  -> Controller 方法上的 @Permission 注解被 AOP 拦截
  -> ActionAuthorizer 校验动作权限，失败抛 AccessDeniedException
  -> 通过则写入 DataScopeContext
  -> Service 调用 Mapper
  -> MyBatis 拦截器读到 DataScopeContext，按 DataScopeResolver 改写 SQL
  -> 返回结果
  -> finally 清理 ThreadLocal
```

每一跳只做自己的事。认证坏了不会影响动作授权单测，数据范围规则换实现不影响切面。新加一个"按客户隔离"的范围类型，只需要实现 `DataScope` 接口并在 `DataScopeResolver` 中按资源分发，切面和注解都不动。

这套分层也覆盖不了所有边界。跨服务调用时，`DataScopeContext` 是本地 ThreadLocal，不会随 RPC 传递，下游服务要么自带鉴权，要么信任上游签发的内部令牌。导出大批量数据时，短 TTL 缓存可能挡不住一次扫描的鉴权读取，需要为批量入口换用按主键批量查询。这些取舍放在文档里比塞进代码注释更好查。
