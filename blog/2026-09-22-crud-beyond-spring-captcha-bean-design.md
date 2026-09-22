---
title: CRUD 之外 - Spring 验证码的三层 Bean 设计
authors: [cbtpro]
description: 拆分验证码生成、图片渲染和缓存职责，处理原子消费、过期、测试隔离，并说明浏览器标识的能力边界。
tags:
  - crud
  - 验证码
  - spring
  - java
  - 后端
  - 缓存
  - bean
  - 异地登录
  - 工程实践
  - 鲁棒性
---

登录验证码至少涉及三件事：生成答案、绘制挑战图片、保存并消费答案。拆开这些职责后，测试可以替换生成器，图片样式可以单独调整，缓存也能独立验证过期和并发行为。

文本验证码使用安全随机数生成答案，以独立挑战 ID 保存，并在校验时原子消费。生成器、渲染器和缓存分别测试，登录限流与会话校验接在认证入口。

{/* truncate */}

## 生成、渲染与存储

```java title="三个接口"
public interface CaptchaCodeGenerator {
    String generate();
}

public interface CaptchaImageRenderer {
    String render(String text);
}

public interface CaptchaCache {
    void save(String challengeId, String code, Duration ttl);
    // 原子取出并删除，每次尝试都消费挑战，包括输错答案。
    String consume(String challengeId);
}
```

服务端为每次生成分配独立挑战 ID，刷新和不同浏览器之间互不覆盖。挑战同时绑定服务端会话与用途，登录时按这份绑定取回对应答案。

```java title="随机生成器"
@Component
@ConditionalOnProperty(name = "captcha.code-mode", havingValue = "random", matchIfMissing = true)
public class RandomCodeGenerator implements CaptchaCodeGenerator {
    private static final SecureRandom RANDOM = new SecureRandom();

    @Override
    public String generate() {
        return String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000));
    }
}
```

`SecureRandom` 提供不可预测的随机来源。获取和校验入口分别限流，结合会话、账号与 IP 控制尝试频率，连续失败后要求重新获取挑战。

## 校验时原子消费

“先 GET、比较、再 DELETE”存在并发窗口：两个请求都可能在删除前读到相同答案，并同时通过。缓存接口把取出和删除合成一个原子操作。

```java title="RedisCaptchaCache.java"
@Component
@ConditionalOnProperty(name = "captcha.cache-mode", havingValue = "redis", matchIfMissing = true)
public class RedisCaptchaCache implements CaptchaCache {
    private final StringRedisTemplate redis;

    public RedisCaptchaCache(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public void save(String challengeId, String code, Duration ttl) {
        redis.opsForValue().set("captcha:" + challengeId, code, ttl);
    }

    @Override
    public String consume(String challengeId) {
        return redis.opsForValue().getAndDelete("captcha:" + challengeId);
    }
}
```

`getAndDelete` 需要相应版本的 Spring Data Redis 和 Redis 6.2+ 的 [GETDEL](https://redis.io/docs/latest/commands/getdel/)。旧环境使用 Lua 完成一次原子取出与删除。缓存故障时返回可重试错误，待恢复后重新获取挑战。

```java title="CaptchaService.java"
@Service
public class CaptchaService {
    private final CaptchaCodeGenerator generator;
    private final CaptchaImageRenderer renderer;
    private final CaptchaCache cache;

    public CaptchaService(CaptchaCodeGenerator generator,
                          CaptchaImageRenderer renderer,
                          CaptchaCache cache) {
        this.generator = generator;
        this.renderer = renderer;
        this.cache = cache;
    }

    public record Challenge(String id, String image) {}

    public Challenge generate() {
        String id = UUID.randomUUID().toString();
        String code = generator.generate();
        String image = renderer.render(code);
        cache.save(id, code, Duration.ofMinutes(2));
        return new Challenge(id, image);
    }

    public boolean verify(String id, String input) {
        if (id == null || input == null) return false;
        String expected = cache.consume(id);
        return expected != null && expected.equals(input);
    }
}
```

控制器获取挑战后，把 ID 写入服务端会话；登录时先检查会话和用途，再调用 verify 并清理挑战引用。客户端只收到挑战 ID 和图片，答案仅保存在服务端缓存。若允许多次尝试，在同一段 Lua 中比较答案、减少次数并按结果删除挑战。

## 图片实现的边界

图片渲染器用 try/finally 释放 Graphics。下面展示绘图与编码的资源管理；线上图片的抗识别效果由选定的验证码实现负责，并结合限流评估。

```java title="图片编码片段"
BufferedImage image = new BufferedImage(140, 40, BufferedImage.TYPE_INT_RGB);
Graphics2D graphics = image.createGraphics();
try {
    graphics.setColor(Color.WHITE);
    graphics.fillRect(0, 0, 140, 40);
    graphics.setColor(Color.BLACK);
    graphics.setFont(new Font("SansSerif", Font.BOLD, 24));
    graphics.drawString(code, 12, 28);
} finally {
    graphics.dispose();
}
try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
    ImageIO.write(image, "png", out);
    return "data:image/png;base64," + Base64.getEncoder().encodeToString(out.toByteArray());
} catch (IOException error) {
    throw new IllegalStateException("验证码图片生成失败", error);
}
```

算术题将展示文本与答案分开生成。`ChallengeSpec("12 + 34 = ?", "46")` 中，渲染器绘制 displayText，缓存保存 answer，校验流程继续消费缓存中的答案。

滑动拼图使用结构化挑战：生成器返回两部分数据，公开部分包含挑战 ID、背景图和滑块图，服务端部分保存目标坐标、容差与过期时间。

```java
record SliderChallenge(String id, String background, String piece) {}
record SliderAnswer(int targetX, int tolerance) {}
```

客户端提交挑战 ID 与拖动结果，验证器在对应会话内原子消费挑战，按目标坐标和容差判断，再把结果交给登录流程。生成和校验由同一策略配对，后续更换挑战形式时也有明确的扩展位置。

## 固定验证码仅用于隔离测试

固定生成器放在测试源码或独立测试模块，通过测试配置注入。压测环境使用隔离网络与独立构建产物，生产包只包含随机生成器，环境切换由发布配置管理。

`matchIfMissing = true` 让未配置模式时使用随机生成器。未知模式保持启动失败，部署检查能及时发现配置问题。

本地缓存也要模拟过期和一次性消费。可以用有容量限制、写入后过期的 Caffeine，并用 `cache.asMap().remove(id)` 原子取走答案。普通 ConcurrentHashMap 没有 TTL，不适合据此验证验证码过期。Redis 集群或哨兵通常由连接配置处理，不需要仅为拓扑变化新建一个缓存接口实现。

## 将浏览器标识用于风险评估

localStorage 中的 UUID 作为可重置的浏览器标识，与 IP、地理位置变化、登录历史等信号共同参与风险评估。设备信任由服务端管理，并设置有效期与撤销机制。

异常登录由认证系统结合服务端会话和风险信号判定。需要二次认证时，先签发仅能完成验证的临时状态，验证通过后再建立完整登录会话。验证码模块为这个流程提供挑战与校验结果。

测试覆盖生成与渲染、并发消费、过期和失败后的再次校验。部署测试再确认生产配置只加载预期的随机生成器与缓存实现。
