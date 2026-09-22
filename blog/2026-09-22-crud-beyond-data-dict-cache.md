---
title: CRUD 之外 - 数据字典的多层缓存与刷新策略
authors: [cbtpro]
description: 按类型缓存字典快照，区分空结果与未命中，说明本地缓存、Redis 和提交后失效的边界。
tags:
  - crud
  - 数据字典
  - 缓存
  - spring
  - java
  - 后端
  - bean
  - 工程实践
  - 鲁棒性
---

列表里多个字段都要把 code 转成名称。如果逐行调用翻译接口，一页 50 行、每行 5 个字典字段，就可能产生 250 次查询。按类型批量加载后，同一页的字段可以共用一份字典快照。

查询多、修改少的字典适合按 type 缓存整批快照。本地缓存、Redis 和数据库通过提交后失效与过期刷新协作。下面的设计示例中，Mapper 负责数据库查询，Redis 实现按项目的序列化约定接入。

{/* truncate */}

## 缓存整批快照

同一类型的字典通常不大，可以保存为 `code -> item` 的 Map。单条翻译通过 Map 查找，列表也取同一份快照，不需要另建一套单条缓存。

缓存接口要区分“没有缓存”和“已查过但结果为空”：

```java title="DictCache.java"
public interface DictCache {
    // empty 表示未命中；Optional.of(emptyMap()) 表示已缓存空结果。
    Optional<Map<String, DictItem>> getType(String type);
    void putType(String type, Map<String, DictItem> items, Duration ttl);
    void evictType(String type);
}
```

`DictItem` 使用不可变对象，调用方共享只读快照：

```java
public record DictItem(String code, String label, int sort) {}
```

下面的服务只依赖一份按类型缓存。示例要求字典表对 `(type, code)` 建唯一约束；多租户系统还要把租户 ID 加入查询条件和缓存键。

```java title="DictService.java"
@Service
public class DictService {
    private final DictCache cache;
    private final DictMapper mapper;

    public DictService(DictCache cache, DictMapper mapper) {
        this.cache = cache;
        this.mapper = mapper;
    }

    public Map<String, DictItem> byType(String type) {
        return cache.getType(type).orElseGet(() -> {
            Map<String, DictItem> snapshot = mapper.findAllByType(type).stream()
                .collect(Collectors.toUnmodifiableMap(DictItem::code, item -> item));
            Duration ttl = snapshot.isEmpty() ? Duration.ofMinutes(1) : Duration.ofMinutes(10);
            cache.putType(type, snapshot, ttl);
            return snapshot;
        });
    }

    public String byCode(String type, String code) {
        DictItem item = byType(type).get(code);
        return item == null ? code : item.label();
    }
}
```

整批快照中没有某个 code，就直接返回原值，不会再为同一个无效 code 查询数据库。空 type 也能缓存，但 type 来自外部输入时仍需校验范围和限制容量，避免大量随机类型耗尽缓存。

下拉列表按 `sort` 排序，单条翻译按 code 查找，两种读取方式共用快照。字典规模较大时，可以按使用范围拆分缓存。

## 单实例先用本地缓存

```java title="CaffeineDictCache.java"
@Component
@ConditionalOnProperty(name = "dict.cache-mode", havingValue = "local")
public class CaffeineDictCache implements DictCache {
    private record Snapshot(Map<String, DictItem> items, long ttlNanos) {}

    private final Cache<String, Snapshot> cache = Caffeine.newBuilder()
        .maximumSize(1_000)
        .expireAfter(new Expiry<String, Snapshot>() {
            public long expireAfterCreate(String key, Snapshot value, long now) {
                return value.ttlNanos();
            }
            public long expireAfterUpdate(String key, Snapshot value, long now, long remaining) {
                return value.ttlNanos();
            }
            public long expireAfterRead(String key, Snapshot value, long now, long remaining) {
                return remaining;
            }
        })
        .build();

    @Override
    public Optional<Map<String, DictItem>> getType(String type) {
        return Optional.ofNullable(cache.getIfPresent(type)).map(Snapshot::items);
    }

    @Override
    public void putType(String type, Map<String, DictItem> items, Duration ttl) {
        cache.put(type, new Snapshot(Map.copyOf(items), ttl.toNanos()));
    }

    @Override
    public void evictType(String type) {
        cache.invalidate(type);
    }
}
```

`Expiry` 按快照保存 TTL，读取保持剩余过期时间。热点 type 可以配合按 key 合并加载，减少同时失效时的数据库查询。查询读副本或长事务时，还需把副本延迟与快照可见性纳入数据更新时间的评估。

## 多实例时再加入 Redis

一种两层方案是：先查本地 L1，再查 Redis L2，最后查库。L2 命中时回填 L1，保留 L2 原有过期时间；数据库加载完成后写入新的 L2 快照。L1 的 TTL 应短于 L2。

Redis 可以用一个字符串键保存整个 type 的 JSON 快照，`SET key payload EX ttl` 同时完成替换和过期设置。JSON 中的空 Map 是有效命中；key 不存在才代表未命中。跨进程缓存用显式字段或空集合表达空结果，序列化前后的含义保持一致。

若改用 Hash，要明确空字典如何表示、旧 code 如何删除，以及更新和 TTL 如何原子完成。单独 `putAll` 只覆盖已有字段，不会移除这次快照中已经删除的项；空 Hash 也无法自然区分未命中和空结果。

## 事务提交后失效

字典更新按顺序提交数据库事务、删除对应 L2、通知各实例删除 L1。订阅者负责清理本地层，消息由更新入口统一发布。

Spring 的普通应用事件只在当前进程内传播。可以用 `@TransactionalEventListener(phase = AFTER_COMMIT)` 安排提交后处理，再通过 Redis Pub/Sub 或消息系统通知其他实例。进程在提交后、发消息前退出仍会丢失通知，需要可靠投递时应使用 outbox 等方案。见 [Spring 事务事件文档](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)。

Pub/Sub 和普通 Redisson RTopic 适合在线实例的即时通知；离线期间的失效通知通过持久消息补偿，或由过期刷新收敛。TTL 和定时刷新可以缩短遗漏通知造成的陈旧时间，形成最终一致的刷新路径。

还有一个读写竞态：读者先读出旧数据库值，写者提交并删除缓存，读者随后又把旧值写回缓存。允许短暂陈旧的字典依靠 TTL 收敛；严格一致的场景通过版本化快照和有条件发布，或统一的读写协调协议处理回填顺序。

## 预热与刷新

启动时预热常用类型，保留共享 Redis 中的有效快照。定时任务按类型加载新快照，加载完成后替换可见值，分散回源压力。允许短时陈旧的业务可在数据库故障时继续提供旧快照，并记录快照时间。

本地缓存侧重进程内读取，Redis 提供跨实例共享。验证覆盖空类型、删除 code、并发刷新、事务回滚和消息丢失，分别检查返回值与旧快照的存续时间。
