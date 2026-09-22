---
title: CRUD 之外 - 数据库乐观锁，为什么要用，怎么用
authors: [cbtpro]
description: 从丢失更新说明版本检查，区分库存命令与表单编辑，并明确 MyBatis-Plus 回写、事务重试和幂等的边界。
tags:
  - crud
  - 数据库
  - 并发
  - 乐观锁
  - 工程实践
  - 鲁棒性
---

两次请求同时读到库存 10，各减 1，再分别把 9 写回数据库。两次更新都成功，库存却只少了 1。这就是丢失更新。

乐观锁让更新带上读取时的版本号：只有数据仍处于那个版本，写入才成立。冲突发生后，是重读重算还是让用户确认，要由业务决定。

{/* truncate */}

## 事务与冲突检测

事务负责一组操作的提交与回滚，并发冲突则结合数据库、隔离级别和 SQL 处理。对于应用层的读改写，常用做法是在读取时加锁，或在更新时比较版本。

以 MySQL InnoDB 为例，普通一致性读得到的快照，不会替应用层的“读旧值、计算新值、覆盖写回”检查业务冲突。可以用事务内的 `SELECT ... FOR UPDATE` 锁定记录，也可以在 UPDATE 中带上版本条件。

```sql
UPDATE goods
SET stock = 9, version = version + 1
WHERE id = 1 AND version = 5;
```

影响行数为 0 表示本次更新未命中。返回业务结果时，再按记录是否存在、版本是否变化和其他过滤条件区分原因。

库存扣减还有更直接的写法：

```sql
UPDATE goods
SET stock = stock - :quantity, version = version + 1
WHERE id = :id AND stock >= :quantity;
```

这里要求 `quantity` 为正数，并检查影响行数。条件判断和扣减在同一条语句中完成，适合不需要先读出库存做复杂计算的场景。实际 UPDATE 仍会使用数据库写锁；乐观锁省去的是读取阶段的预先锁定。

## MyBatis-Plus 的配置

下面只展示与乐观锁有关的声明，省略项目中的导入、Mapper 扫描和异常定义。

```java title="MybatisPlusConfig.java"
@Configuration
public class MybatisPlusConfig {
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        return interceptor;
    }
}
```

```java title="Goods.java"
@Data
@TableName("goods")
public class Goods {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Integer stock;
    @Version
    private Integer version;
}
```

表中需要一个非空版本列，例如 `version INT NOT NULL DEFAULT 0`。使用带版本值的实体调用 `updateById`，插件才有旧版本可比较。

```java
Goods goods = goodsMapper.selectById(goodsId);
if (goods == null) throw new BusinessException("商品不存在");
if (quantity == null || quantity <= 0) throw new BusinessException("数量必须大于零");
if (goods.getStock() < quantity) throw new BusinessException("库存不足");
goods.setStock(goods.getStock() - quantity);
if (goodsMapper.updateById(goods) != 1) {
    throw new BusinessException("数据已变化，请重试");
}
```

整数版本会递增，新版本也会回写到实体。重试时重新读取实体、重新计算业务值，并为 `update(entity, wrapper)` 创建新的 wrapper。纯 wrapper 更新则显式携带旧版本条件与新版本值。具体支持范围见 [MyBatis-Plus 乐观锁插件文档](https://baomidou.com/plugins/optimistic-locker/)。

## 每次尝试使用独立事务

单次扣库存可以在冲突后重试，但如果还要写订单，整个业务尝试必须在同一事务内完成。冲突要抛出异常，让本次尝试回滚；重试在事务结束之后进行，每轮重新读取。

```java title="重试编排示意"
// attemptService 是另一个 Spring Bean，确保经过事务代理。
public void placeOrder(OrderRequest request) {
    for (int attempt = 0; attempt < 3; attempt++) {
        try {
            attemptService.placeOnce(request);
            return;
        } catch (OptimisticConflictException error) {
            if (attempt == 2) throw error;
        }
    }
}

// 以下方法位于 attemptService 对应的 Bean 中。
@Transactional(rollbackFor = Exception.class)
public void placeOnce(OrderRequest request) {
    Goods goods = goodsMapper.selectById(request.goodsId());
    // 校验商品存在、数量为正、库存足够，省略业务异常定义。
    validate(goods, request.quantity());
    goods.setStock(goods.getStock() - request.quantity());
    if (goodsMapper.updateById(goods) != 1) {
        throw new OptimisticConflictException();
    }
    orderMapper.insert(toOrder(request));
}
```

外层编排方法保持无事务，每次通过独立 Bean 开启并结束一次尝试。这样下一轮能读取新的数据库状态，也能释放上一轮持有的锁。若调用链已有事务，先明确整笔业务的原子范围，再安排重试边界。

冲突导致事务回滚时，扣库存和订单写入一起撤销。客户端因网络超时重发整次请求，则通过业务幂等键和唯一约束识别已经成功的订单。事务内发出的邮件、消息和外部 HTTP 调用也不会随数据库一起回滚，应使用事务消息或 outbox 等方式协调。

重试次数和退避时间要依据冲突率设置。退避放在事务结束之后，避免睡眠期间持有锁和连接；线程被中断时，恢复中断标志并结束本次调用。

## 编辑表单需要回传读取时的版本

扣库存是基于当前库存执行命令，服务端在执行时读版本通常足够。编辑表单则不同：用户打开版本 5 的详情，过了几分钟才保存。这段时间别人可能已经保存了版本 6。

如果后端保存前重新读取版本 6，再用它写入用户基于版本 5 编辑的内容，就绕过了这段编辑期间的冲突检测。表单应回传原版本 5，或用 ETag / If-Match 表达同一含义；冲突后展示差异，让用户决定如何合并。

版本号用于判断内容是否过期，身份、记录权限和可修改字段由后端分别校验。版本冲突返回明确结果，前端保留草稿供用户比较。

## 手写 SQL 要核对实际条件

自定义 Mapper 按插件支持的参数约定传入实体，并在最终 SQL 中落实版本比较。集成测试可以让两个请求读到同一版本，再先后更新，验证最多一个成功。

每条写入口同时维护版本比较和版本递增：WHERE 拒绝过期写入，SET 标记新版本。版本递增由应用或数据库中的一处负责，保持规则一致。

热点行上冲突频繁时，可以考虑条件更新、悲观锁或排队。选择依据是冲突率、事务长度和副作用成本。资金等要求一致性的业务也可以使用乐观锁，前提是原子条件、事务边界、幂等和失败处理完整。
