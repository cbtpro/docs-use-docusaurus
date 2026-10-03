---
title: CRUD 之外 - 登录链路的验证码、双 Token 与设备绑定
authors: [cbtpro]
description: 把验证码、凭据校验、浏览器指纹、真实 IP 与双 Token 串成一条登录链路,让令牌与设备上下文绑定,Token 被盗后在异设备无法继续使用,Refresh 轮换再加重放检测。
tags:
  - crud
  - 全栈
  - 安全
---

登录接口的返回值,经常只是一个 JWT。验证码做完了、密码比对过了、权限码也下发了,剩下的都交给 Token 自己扛。但 Token 一旦被日志记录、被中间代理缓存、被 XSS 抓走,持有者就拥有了这个用户的所有能力,直到过期。过期时间设短,用户每隔十几分钟就要重登;设长,被盗的窗口也跟着拉长。

把登录拆开看,真正要做的事情是三件:证明这次请求是某个用户发的(认证)、把这次会话和一个不可转移的设备上下文绑起来(设备绑定)、在 Token 失效后能继续持有这个绑定关系而不让用户重输密码(刷新)。把它们糊在一个签发函数里,会让每一个安全决策都改不动,也补不齐。

{/* truncate */}

## 朴素实现:密码对了就签 Token

最直觉的写法是 Controller 拿账号密码、查库比对、签 JWT、返回前端:

```java title="LoginController.java 的朴素写法"
@RestController
@RequestMapping("/api/auth")
public class LoginController {

    @PostMapping("/login")
    public Map<String, String> login(@RequestBody LoginCmd cmd) {
        User user = userService.verify(cmd.username(), cmd.password());
        if (user == null) {
            throw new BadCredentialsException();
        }
        String token = jwt.sign(Map.of("uid", user.id(), "roles", user.roles()));
        return Map.of("token", token);
    }
}
```

第一周也跑得挺好。等线上出现一次安全事件,这套写法的几个坑就显出来了。

Token 里装着用户身份,后端不记任何会话状态。Token 被截走,后端无法主动让它失效,只能等过期。把过期设到八小时,等于给攻击者开了八小时的窗口;设到十五分钟,用户每十五分钟就要被踢一次。

签名密钥是固定的,签出来的 Token 长一个样。攻击者拿到一个用户的 Token,看不出它来自哪台设备、哪个 IP 段。后端即便想做"异地登录触发二次验证",也没有任何信号可以判断。验证码这一层虽然挡住了脚本撞库,但对 Token 已经在手的攻击者毫无意义,他们根本不需要再过一次登录。

## 改进一:加 IP 校验

给 Token 加一个 `ip` 字段,签发时记下客户端 IP,后续请求时比对。

```java title="带 IP 校验的签发"
String ip = request.getRemoteAddr();
String token = jwt.sign(Map.of("uid", user.id(), "ip", ip));
```

这套马上撞到两个具体问题。移动网络切换基站、Wi-Fi 与 5G 互切、用户从公司网络走到家里,IP 都会变。如果校验严到"必须一致",这些正常的切换都会被踢回登录页,用户第一反应是系统坏了。

更隐蔽的问题是 `getRemoteAddr` 拿到的 IP 不可信。后端前面挂了 Nginx、CDN、WAF 时,`getRemoteAddr` 拿到的是最后一跳的代理地址,所有用户都长一样。要拿真实 IP,得解析 `X-Forwarded-For`,但这条头是客户端可以伪造的,不分辨信任深度就等于自己写一个越权漏洞。

## 改进二:加浏览器指纹

让前端生成一个设备 ID,存到 localStorage,登录时一起发过来,后端把它写进 Token。这样 Token 被盗后,在另一台设备上 localStorage 里没有这个 ID,看似可以挡住。

但 localStorage 的 ID 是可以被清理和复制的。攻击者拿到 Token 的同时,经常也能拿到同源的 storage 内容,把这个 ID 一起带走不难。靠一个客户端可控的字符串作为设备绑定,绑不住。真正要稳的是综合多个信号:UA、屏幕分辨率、时区、语言、Canvas 渲染特征、WebGL 渲染器、AudioContext 输出。这些信号单独看不唯一,组合起来的稳定性远高于一个随机 UUID。把它们哈希成一个指纹,再配合服务端签发的设备 ID 一起绑定,客户端想伪造一个能通过的指纹,要同时伪造的信号维度会拉高。这些信号也不进 localStorage 当唯一标识,只在登录时采集一次,后续请求传哈希值。

## 拆成几个职责清晰的接口

把登录链路按职责拆开,每一块都可以单独替换、单独测试,新接入一种验证码挑战形式或换一种 Refresh Token 存储都不需要动其他模块:

```java title="登录链路的策略接口"
// 凭据校验:只判断账号密码对不对,不关心 Token 怎么签。
public interface CredentialAuthorizer {
    AuthResult verify(CredentialInput input);
}

// 密码哈希:把明文密码转成可存储的哈希值,校验时识别算法并支持自动升级。
public interface PasswordHasher {
    String hash(String plainPassword);
    boolean matches(String plainPassword, String storedHash);
    boolean needsUpgrade(String storedHash);
}

// 设备指纹哈希:把前端送来的多维信号哈希成稳定的设备标识。
public interface DeviceFingerprintHasher {
    String hash(DeviceSignals signals);
}

// 设备注册与查询:设备 ID 与用户、指纹、风险状态的绑定。
public interface DeviceRegistry {
    Device registerOrTouch(Long userId, String fingerprint, String ip);
    Device findById(String deviceId);
}

// Token 签发:产出 access + refresh,绑定设备上下文。
public interface TokenIssuer {
    TokenPair issue(Authentication auth, DeviceContext device);
    TokenPair refresh(String refreshToken, DeviceContext device);
}

// Refresh Token 存储:支持撤销、轮换、重放检测。
public interface RefreshTokenStore {
    void store(String tokenId, Long userId, String deviceHash, Instant expiresAt);
    RefreshRecord consume(String tokenId);
    void revokeByUser(Long userId);
}
```

策略之间互相不依赖。`TokenIssuer` 只认 `DeviceContext`,不关心指纹怎么算出来的;`CredentialAuthorizer` 只产出 `AuthResult`,不关心后面要签什么 Token。换成 Sa-Token、自研 JWT、OAuth2 client,只需要替换 `TokenIssuer` 的实现,其他策略不动。这就是这套拆分想要的开闭性质。

## 验证码接到登录入口

验证码的生成、渲染、原子消费在 [CRUD 之外 - Spring 验证码的三层 Bean 设计](/blog/2026/09/22/crud-beyond-spring-captcha-bean-design/) 里单独讨论过。这里只关注它如何接入登录链路。

登录入口先校验挑战,再校验凭据,两步失败返回不同错误码,前端据此决定是刷新验证码还是提示密码错:

```java title="LoginController.java 的拼装"
@RestController
@RequestMapping("/api/auth")
public class LoginController {

    private final CaptchaService captcha;
    private final CredentialAuthorizer authorizer;
    private final DeviceFingerprintHasher hasher;
    private final DeviceRegistry devices;
    private final TokenIssuer issuer;
    private final RequestContextResolver contextResolver;

    @PostMapping("/login")
    public LoginResponse login(@RequestBody LoginCmd cmd, HttpServletRequest request) {
        if (!captcha.verify(cmd.challengeId(), cmd.captcha())) {
            throw new CaptchaFailedException();
        }
        AuthResult auth = authorizer.verify(new CredentialInput(cmd.username(), cmd.password()));
        if (!auth.success()) {
            throw new BadCredentialsException();
        }

        DeviceContext context = contextResolver.resolve(request, cmd.signals());
        String fingerprint = hasher.hash(cmd.signals());
        Device device = devices.registerOrTouch(auth.userId(), fingerprint, context.clientIp());
        TokenPair pair = issuer.issue(auth.toAuthentication(), device);

        // refresh Token 走 httpOnly Cookie,不放在响应体里。
        ResponseCookie refreshCookie = ResponseCookie.from("refreshToken", pair.refreshToken())
            .httpOnly(true)
            .secure(true)
            .sameSite("Lax")
            .path("/api/auth/refresh")
            .maxAge(pair.refreshTtl())
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, refreshCookie.toString());

        return new LoginResponse(pair.accessToken(), device.deviceId());
    }
}
```

验证码校验失败抛 `CaptchaFailedException`,凭据校验失败抛 `BadCredentialsException`,全局异常处理器分别翻译成不同响应码,前端据此区分提示。两类错误都要求刷新验证码,因为挑战已经被原子消费,旧挑战 ID 不能再试。

`RequestContextResolver` 把请求里能拿到的真实 IP、UA 等信号解析出来,交给设备注册和 Token 签发使用。它的实现单独写一份,因为这个细节最容易写错。

## 密码加密与算法可替换

`CredentialAuthorizer` 内部依赖 `PasswordHasher` 做密码校验。哈希算法本身要可替换,不是因为它经常换,是因为换的时候不能牵动业务代码。bcrypt 现在够用,但 Argon2 已被 OWASP 列为推荐,今天写死 bcrypt,明天要换 Argon2 就要改 `CredentialAuthorizer` 的实现。把哈希算法抽成接口,实现换了,凭据校验一行不动。

```java title="Argon2PasswordHasher.java"
@Component
@ConditionalOnProperty(name = "auth.hasher", havingValue = "argon2", matchIfMissing = true)
public class Argon2PasswordHasher implements PasswordHasher {

    private final Argon2Parameters parameters;

    public Argon2PasswordHasher(AuthProperties properties) {
        this.parameters = properties.hasher().argon2();
    }

    @Override
    public String hash(String plainPassword) {
        Argon2Advanced argon2 = Argon2Factory.createAdvanced(parameters);
        return argon2.hash(
            parameters.iterations(),
            parameters.memoryKiB(),
            parameters.parallelism(),
            plainPassword
        );
    }

    @Override
    public boolean matches(String plainPassword, String storedHash) {
        Argon2Advanced argon2 = Argon2Factory.createAdvanced(parameters);
        return argon2.verify(storedHash, plainPassword.toCharArray());
    }

    @Override
    public boolean needsUpgrade(String storedHash) {
        // 只把已知弱算法或参数过低的哈希标记为需要升级。
        // bcrypt($2a$)目前仍是安全算法,只是不如 Argon2,不强制升级。
        if (storedHash.startsWith("$md5") || storedHash.startsWith("$sha1")) {
            return true;
        }
        if (storedHash.startsWith("$argon2")) {
            return isWeakParameters(storedHash);
        }
        return false;
    }
}
```

哈希值自带算法标识前缀(`$argon2$`、`$2a$`),`matches` 能据此分派到对应实现,新旧算法可以在同一份表里共存。这给了算法迁移的余地:存量用户哈希是 bcrypt,新注册是 Argon2,校验时按前缀选实现。

不能在前端哈希一下再发给后端。前端哈希等于把哈希值当密码用,后端拿到的是固定字符串,哈希的意义就没了。前端只送明文密码,通过 HTTPS 传输,服务端哈希后再存。客户端永远不接触哈希值,哈希算法的迭代次数、强度因子是服务端的工程取舍。

`needsUpgrade` 的作用是识别存量密码是否需要重新哈希。用户登录成功时,如果 `needsUpgrade(storedHash)` 返回 true,用新算法重新哈希一次明文密码,写回用户表。这是把算法迁移分摊到登录流量上的做法,不必跑一次全量批处理。批处理要求每个用户重新输密码,落地时只能找运维开临时通道,工程上很别扭。

```java title="CredentialAuthorizer 内部的哈希升级"
@Override
public AuthResult verify(CredentialInput input) {
    User user = userRepository.findByUsername(input.username());
    if (user == null) {
        return AuthResult.failure();
    }
    if (!passwordHasher.matches(input.password(), user.passwordHash())) {
        return AuthResult.failure();
    }

    // 校验通过后判断是否需要升级到新算法,是则重写哈希。
    if (passwordHasher.needsUpgrade(user.passwordHash())) {
        String rehashed = passwordHasher.hash(input.password());
        userRepository.updatePasswordHash(user.id(), rehashed);
    }

    return AuthResult.success(user.id(), user.roles());
}
```

升级放在校验通过后做,而不是在校验前。校验前还没有明文密码,要重新哈希得要求用户改密码。校验通过后明文就在手上,顺手哈希一遍写回,用户无感。这一步要放在事务里,避免哈希写了一半失败,用户表里出现既不是 bcrypt 也不是 Argon2 的中间状态。

慢哈希的性能取舍要按业务调。Argon2 的内存参数设到 64 MiB 能挡住 GPU 暴力破解,但单次校验耗时拉到几百毫秒,登录峰值会卡。把内存降到 16 MiB、迭代次数从 3 降到 1,耗时回到几十毫秒,抗暴力破解能力下降但仍远高于 MD5。这些参数走配置,不要写死在代码里,灰度时改 yaml 就能调,不必发版。

登录失败次数也要叠加限流。单账号连续失败 N 次锁一段时间,单 IP 失败次数超阈值要求验证码或滑块。哈希算法再强,撞库和暴力破解的防线在限流,不在哈希强度。哈希防的是"数据库泄露后离线破解",和在线撞库是两个面,不要混为一谈。

明文密码在校验完写回哈希之后,引用要尽快离开作用域。`CredentialInput` 用完即丢,不要把它放进 ThreadLocal 或缓存里,避免明文密码在内存里长期停留被堆 dump 抓走。

## 拿到前端的真实 IP

`X-Forwarded-For` 是一条逗号分隔的链路:`客户端, 代理1, 代理2, ...`。客户端可以伪造这条头里的任何内容,直接取第一个值等于信任客户端自报的 IP。正确做法是从右往左跳过可信代理,第一个不在可信网段的就是真实客户端。

可信代理网段在配置里显式声明,不在代码里写死。新加一台 Nginx 或 WAF,改 yaml,不改代码:

```java title="TrustedForwardedIpResolver.java"
@Component
public class TrustedForwardedIpResolver implements RequestContextResolver {

    private final List<IpAddressMatcher> trustedProxies;

    public TrustedForwardedIpResolver(AuthProperties properties) {
        this.trustedProxies = properties.trustedProxies().stream()
            .map(cidr -> new IpAddressMatcher(cidr))
            .toList();
    }

    @Override
    public DeviceContext resolve(HttpServletRequest request, DeviceSignals signals) {
        String ip = clientIpFrom(request);
        String ua = request.getHeader("User-Agent");
        return new DeviceContext(ip, ua, signals);
    }

    private String clientIpFrom(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        // 最后一跳不可信,说明请求没经过已知代理,直接返回 remote。
        if (!isTrusted(remote)) {
            return remote;
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded == null || forwarded.isBlank()) {
            return remote;
        }
        // 从右往左跳过可信代理,第一个不在可信网段的就是真实客户端。
        String[] chain = forwarded.split(",");
        for (int i = chain.length - 1; i >= 0; i--) {
            String ip = chain[i].trim();
            if (!isTrusted(ip)) {
                return ip;
            }
        }
        return remote;
    }

    private boolean isTrusted(String ip) {
        return trustedProxies.stream().anyMatch(matcher -> matcher.matches(ip));
    }
}
```

`X-Forwarded-For` 头被 Spring Security 的 `ForwardedHeaderFilter` 处理时,默认会全部信任。要么关掉这个过滤器自己写,要么和运维约定上游代理必须剥掉客户端伪造的同名头再补回。生产环境强烈建议让运维在第一跳可信代理上把 `X-Forwarded-For` 重写为它自己看到的客户端 IP,下游再解析这条链路就稳了。

这套 IP 解析不只用在登录。接口权限那篇文章里 `CurrentUser` 的来源如果走的是 Filter,Filter 里也要用同一个 `RequestContextResolver` 拿真实 IP,否则登录时记的 IP 和请求时校验的 IP 不在一个口径上,绑定校验会乱。

## 前端采的浏览器信号

React 端在登录页或全局初始化时采集一次信号,不重复采集。信号源包括 UA、屏幕、时区、语言、Canvas、AudioContext 等,采集完哈希后随登录请求一起发,不进 localStorage 当唯一设备标识:

```ts title="collectDeviceSignals.ts 的信号采集"
function collectCanvasFingerprint(): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.textBaseline = 'top';
  ctx.font = "14px 'Arial'";
  ctx.fillStyle = '#f60';
  ctx.fillRect(0, 0, 100, 30);
  ctx.fillStyle = '#069';
  ctx.fillText('device-fingerprint', 2, 2);
  return canvas.toDataURL();
}

function collectAudioFingerprint(): Promise<string> {
  const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioCtx) return Promise.resolve('');
  const ctx = new AudioCtx(1, 44100);
  const oscillator = ctx.createOscillator();
  oscillator.type = 'triangle';
  oscillator.frequency.value = 10000;
  const compressor = ctx.createDynamicsCompressor();
  oscillator.connect(compressor);
  compressor.connect(ctx.destination);
  oscillator.start(0);
  return ctx.startRendering().then(rendered => {
    const data = rendered.getChannelData(0);
    return Array.from(data.slice(4500, 5000)).join(',');
  });
}

export interface DeviceSignals {
  userAgent: string;
  screen: { width: number; height: number; depth: number };
  timezone: string;
  languages: string[];
  canvas: string;
  audio: string;
}

export async function collectDeviceSignals(): Promise<DeviceSignals> {
  return {
    userAgent: navigator.userAgent,
    screen: { width: screen.width, height: screen.height, depth: screen.colorDepth },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    languages: navigator.languages,
    canvas: collectCanvasFingerprint(),
    audio: await collectAudioFingerprint(),
  };
}

export function hashSignals(signals: DeviceSignals): string {
  const normalized = [
    signals.userAgent,
    `${signals.screen.width}x${signals.screen.height}x${signals.screen.depth}`,
    signals.timezone,
    signals.languages.join(','),
    signals.canvas,
    signals.audio,
  ].join('|');
  // 实际项目用 crypto.subtle.digest('SHA-256', ...) 或现成库,这里示意拼接后哈希。
  return sha256(normalized);
}
```

Canvas 和 AudioContext 的采集放在 Suspense 包装的懒加载组件里,SSR 阶段 `document` 不存在,直接调会报错。Docusaurus 这类基于服务端渲染的站点,登录页用 `@docusaurus/BrowserOnly` 包一层再触发采集。

信号采集本身不保密。客户端能拿到的东西,攻击者也能拿到。这套采集的意义在于把"想伪造一个能通过的指纹"的成本拉到比"直接盗一个用户密码"更高,而不是不可伪造。所以服务端哈希时不要只对单一信号算 hash,要把多维信号按固定顺序拼接后哈希,任何一个信号改动,哈希值都会显著不同。

## 服务端把指纹哈希成稳定标识

服务端拿到信号集合后,按固定字段顺序拼成稳定字符串,再哈希成设备指纹:

```java title="StableDeviceFingerprintHasher.java"
@Component
public class StableDeviceFingerprintHasher implements DeviceFingerprintHasher {

    @Override
    public String hash(DeviceSignals signals) {
        String normalized = String.join("|",
            signals.userAgent(),
            signals.screen().width() + "x" + signals.screen().height() + "x" + signals.screen().depth(),
            signals.timezone(),
            String.join(",", signals.languages()),
            signals.canvas(),
            signals.audio()
        );
        return sha256(normalized);
    }

    private String sha256(String input) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }
}
```

指纹哈希只是设备绑定的辅助信号,不作为唯一来源。服务端在 `DeviceRegistry` 里给每个用户维护一个 `(userId, fingerprint, deviceId, firstSeenIp, risk)` 的列表,同一个指纹第一次出现就发一个新的 `deviceId`,之后这个 deviceId 与用户绑定。Token 里同时装 `deviceId` 和 `fingerprintHash`,后续校验时两个都要比对。

`Device` 用 record 表达,避免被业务代码意外修改:

```java title="Device.java 的值对象"
public record Device(
    String deviceId,
    Long userId,
    String fingerprint,
    String firstSeenIp,
    Instant firstSeenAt,
    RiskLevel risk
) {}

public enum RiskLevel {
    TRUSTED,    // 用户主动标记为可信设备
    NORMAL,     // 常规登录设备
    RISKY,      // 异地或新设备,触发二次验证
    REVOKED     // 用户主动撤销或被风控系统吊销
}
```

新设备首次登录 `risk = RISKY`,走二次验证流程。验证通过后升级为 `NORMAL`,长期使用且无异常的可以由用户在设置页标记为 `TRUSTED`,延长其 Refresh Token 有效期。

## 双 Token 与存储位置

签发 Token 时同时产出 access 和 refresh,职责完全不同。access 短期,放前端内存或同源 storage,用于业务接口鉴权。refresh 长期,放 httpOnly Cookie,前端 JS 读不到,用于在 access 失效后换取新的 access 和 refresh:

```java title="JwtTokenIssuer.java 的签发实现"
@Component
public class JwtTokenIssuer implements TokenIssuer {

    private final JwtSigner signer;
    private final RefreshTokenStore refreshStore;
    private final Duration accessTtl = Duration.ofMinutes(15);
    private final Duration refreshTtl = Duration.ofDays(7);

    @Override
    public TokenPair issue(Authentication auth, DeviceContext device) {
        String access = signer.sign(JwtClaims.builder()
            .subject(auth.userId().toString())
            .claim("roles", auth.roles())
            .claim("deviceId", device.deviceId())
            .claim("fp", device.fingerprintHash())
            .expiresIn(accessTtl)
            .build());

        String tokenId = UUID.randomUUID().toString();
        String refresh = signer.sign(JwtClaims.builder()
            .subject(auth.userId().toString())
            .claim("tokenId", tokenId)
            .expiresIn(refreshTtl)
            .build());
        refreshStore.store(tokenId, auth.userId(), device.fingerprintHash(),
            Instant.now().plus(refreshTtl));

        return new TokenPair(access, refresh, accessTtl, refreshTtl);
    }
}
```

access Token 装着设备 ID 和指纹哈希,后续请求校验时比对这两个字段。签发时的 IP 不进 Token,只作为风险信号记录在 `DeviceRegistry` 里,校验时按配置的容忍度做弱比对。refresh Token 是带签名的 JWT,内嵌 `tokenId` 和 `userId`,真实状态存在服务端 `RefreshTokenStore`,可以主动撤销,可以追踪重放。客户端无法伪造一个"任选 userId"的 refresh,因为签名校验过不了。

存储位置是这套方案的关键决策。access Token 暴露在前端 JS 可读的位置,XSS 抓得到,但因为有效期短,被盗窗口小。refresh Token 放 httpOnly Cookie,XSS 读不到,只能通过 CSRF 利用,而 CSRF 又可以靠 SameSite 属性和 Origin 头挡住。两者职责分开后,任何一种攻击单独成功都拿不到完整的刷新能力。

## Token 校验时绑定设备

后续业务请求进入时,Filter 链上有一个 `DeviceBindingFilter`,把 access Token 解出来,与当前请求的设备信号比对。比对失败抛 `DeviceMismatchException`,前端跳回登录或要求二次验证。

```java title="DeviceBindingFilter.java"
@Component
public class DeviceBindingFilter extends OncePerRequestFilter {

    private final JwtVerifier verifier;
    private final DeviceRegistry devices;
    private final DeviceFingerprintHasher hasher;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            chain.doFilter(request, response);
            return;
        }

        JwtClaims claims = verifier.verify(header.substring(7));
        String deviceId = claims.claim("deviceId");
        String expectedFp = claims.claim("fp");

        // 前端在登录时算好指纹哈希,后续请求通过 X-Device-Fp 头直接传哈希值,
        // 服务端只做字符串比对,不再重新采集信号计算。
        String actualFp = request.getHeader("X-Device-Fp");

        if (!expectedFp.equals(actualFp)) {
            throw new DeviceMismatchException();
        }

        Device device = devices.findById(deviceId);
        if (device == null || device.risk() == RiskLevel.REVOKED) {
            throw new DeviceRevokedException();
        }

        CurrentUserHolder.set(new AuthenticatedUser(
            Long.valueOf(claims.subject()),
            claims.claim("roles"),
            device
        ));

        try {
            chain.doFilter(request, response);
        } finally {
            CurrentUserHolder.clear();
        }
    }
}
```

`X-Device-Fp` 头里传的是登录时已经算好的指纹哈希值,不是原始信号。服务端收到后直接和 Token 里的 `fp` 字段做字符串比对,不再重新采集信号计算。这样常规查询请求不必每次都跑 Canvas 采集,只对敏感操作要求重新校验完整信号集合。

校验失败的反馈要分开。指纹不匹配是高危,直接吊销这个 Token 关联的所有 Refresh Token,要求重新登录;IP 跨段是中风险,触发二次验证而非直接拒绝;设备撤销是用户主动操作,要求重新登录。三类反馈分开,避免"任何风险信号一变就踢登录"的糟糕体验。

## Refresh 轮换与重放检测

access Token 过期后,前端用 refresh Token 换新的 Token 对。这一步要轮换:旧 refresh Token 用一次就失效,签发新的 refresh。这样即便 refresh Token 被盗,只要用户正常用过一次,盗者手中的旧 refresh 就废了。

refresh Token 本身也用 JWT 签发,内嵌 `tokenId` 和 `userId`,服务端验签后才能拿到这两个字段。store 里只存 `tokenId` 对应的状态记录,验签通过再走 store:

```java title="RefreshClaims.java"
public record RefreshClaims(String tokenId, Long userId) {}
```

```java title="JwtTokenIssuer.java 的 refresh 实现"
@Override
public TokenPair refresh(String refreshToken, DeviceContext device) {
    RefreshClaims claims = signer.parseRefresh(refreshToken);
    RefreshRecord record = refreshStore.consume(claims.tokenId());
    if (record == null) {
        // consume 是原子操作,返回 null 意味着这个 refresh 已经被用过一次以上。
        // 重放检测:有人正在用同一个 refresh,把这个用户的所有 refresh 全部吊销。
        refreshStore.revokeByUser(claims.userId());
        throw new RefreshTokenReplayException();
    }

    if (record.expiresAt().isBefore(Instant.now())) {
        throw new RefreshTokenExpiredException();
    }
    if (!record.deviceHash().equals(device.fingerprintHash())) {
        refreshStore.revokeByUser(claims.userId());
        throw new DeviceMismatchException();
    }

    return issue(Authentication.of(claims.userId()), device);
}
```

`consume` 是原子操作,取出的同时删除。Redis 用 `GETDEL` 或 Lua 脚本实现,本地缓存用 `Cache.asMap().remove`。两次并发 refresh 同时命中同一个 Token,只有一个能拿到 record,另一个拿到 null,触发重放检测分支,把这个用户的所有 refresh 全部吊销,要求重新登录。

refresh Token 内嵌 `userId` 但有签名,客户端无法伪造一个"任选 userId"的 refresh。验签失败时直接 401,不进 store,避免被人用伪造 Token 把某个用户的 refresh 全部吊销。

重放检测的代价是用户被踢回登录页,代价高于"踢错一次"。但只要 refresh Token 被盗且盗者尝试刷新,这个机制就能识别出来,代价远低于"盗者长期持有刷新能力"。

## 前端的 Token 存储与自动刷新

React 端用一个 axios 拦截器自动加 access Token,401 时触发 refresh,refresh 失败再跳登录页。access Token 不放 localStorage,放内存中的 `tokenStore`,减少 XSS 拿到的内容。refresh Token 放 httpOnly Cookie,axios 自动带,前端 JS 不接触:

```ts title="authClient.ts 的请求与刷新编排"
import axios from 'axios';
import { collectDeviceSignals } from './collectDeviceSignals';

class TokenStore {
  private accessToken: string | null = null;
  set(token: string) { this.accessToken = token; }
  get() { return this.accessToken; }
  clear() { this.accessToken = null; }
}

const tokenStore = new TokenStore();
let refreshing: Promise<boolean> | null = null;
let cachedSignals: DeviceSignals | null = null;
let cachedFingerprint: string | null = null;

export const authClient = axios.create({ withCredentials: true });

// 登录时调用一次,采集信号并算好指纹哈希缓存起来,后续请求复用。
export async function cacheDeviceSignals(): Promise<DeviceSignals> {
  if (!cachedSignals) {
    cachedSignals = await collectDeviceSignals();
    cachedFingerprint = hashSignals(cachedSignals);
  }
  return cachedSignals;
}

authClient.interceptors.request.use(async (config) => {
  // X-Device-Fp 直接传登录时算好的指纹哈希,服务端只做字符串比对。
  if (cachedFingerprint) {
    config.headers['X-Device-Fp'] = cachedFingerprint;
  }
  if (tokenStore.get()) {
    config.headers.Authorization = `Bearer ${tokenStore.get()}`;
  }
  return config;
});

authClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status !== 401) throw error;
    if (refreshing) {
      // 并发的 401 共享同一个 refresh Promise,避免重复刷新。
      await refreshing;
      return authClient.request(error.config);
    }
    refreshing = doRefresh().finally(() => { refreshing = null; });
    if (await refreshing) {
      return authClient.request(error.config);
    }
    tokenStore.clear();
    window.location.href = '/login';
    throw error;
  }
);

async function doRefresh(): Promise<boolean> {
  try {
    const resp = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
    tokenStore.set(resp.data.accessToken);
    return true;
  } catch {
    return false;
  }
}
```

并发的 401 共享同一个 `refreshing` Promise,避免五个请求同时 401 触发五次刷新把对方的 refresh 顶掉。refresh 接口的 URL 不带 access Token,带 httpOnly Cookie 里的 refresh Token,服务端走 `JwtTokenIssuer.refresh` 完成轮换。

## 接续权限校验

`DeviceBindingFilter` 把 `CurrentUser` 写进 `CurrentUserHolder` 后,后续的权限校验就走 [CRUD 之外 - 数据接口权限的分层与切面](/blog/2026/09/24/crud-beyond-data-api-permission/) 那套分层:`@Permission` 注解 → `PermissionAspect` → `ActionAuthorizer` → `DataScopeResolver`。登录链路只负责"是谁、来自哪个设备",权限链路负责"能做什么、能看到哪些数据"。两层职责不重叠。

`CurrentUser` 接口在前一篇文章中已经定义,这里加一个 `device()` 方法,让权限层在需要时可以读到设备上下文:

```java title="CurrentUser 加上设备来源"
public interface CurrentUser {
    Long userId();
    Set<String> roles();
    Long deptId();
    Device device();   // 让权限层或审计层能拿到设备来源
}
```

这样敏感动作的审计日志里可以同时记下"谁、在哪个设备、做了什么动作"。即便 Token 被盗用,审计链路也能定位是哪台设备做的,事后追溯有据可查。

## 关键决策与边界

指纹采集的稳定性与隐私。Canvas 和 AudioContext 的输出在不同浏览器版本间会有差异,指纹哈希不能要求逐字节一致,要做模糊匹配或分桶。同时这些信号属于客户端环境信息,采集前要在隐私协议里说清,不要默认采集所有维度。把 `DeviceSignals` 的字段做成可选集合,按合规要求调整。

Refresh Token 的存储位置是这套方案的安全基石。放进 localStorage 等于和 access Token 一样暴露给 XSS;放进普通 Cookie 没有 SameSite 属性会被 CSRF 利用。生产环境强制 httpOnly + Secure + SameSite=Lax 或 Strict,并且只接受 POST 请求,Origin 头比对。任何一个属性漏掉,这套方案的安全性就退回单 Token 水平。

IP 弱校验的容忍度要按业务调。金融场景严到同网段才放行,内容类应用可以松到只看国家或大区。把容忍度做成配置,不要写死在 `DeviceBindingFilter` 里。容忍度太严会误杀正常用户,太松等于没做。常见做法是新设备首次登录要求二次验证,之后同指纹的设备只做弱 IP 校验,触发风险信号才升级到二次验证。

## 把链路合到一起

整条登录与校验链路按职责分布:

```text
登录:
  POST /api/auth/login (验证码 challengeId + captcha + 账号密码 + 设备信号)
    -> CaptchaService.verify 原子消费挑战
    -> CredentialAuthorizer.verify 校验账号密码
    -> PasswordHasher.matches 慢哈希比对
    -> PasswordHasher.needsUpgrade 校验通过后按需重哈希写回
    -> RequestContextResolver.resolve 拿真实 IP 与 UA
    -> DeviceFingerprintHasher.hash 哈希信号
    -> DeviceRegistry.registerOrTouch 注册或更新设备
    -> TokenIssuer.issue 签发 access + refresh
    -> 返回 access Token,refresh 走 httpOnly Cookie

业务请求:
  GET /api/orders (Authorization: Bearer <access>, X-Device-Fp: <轻量指纹>)
    -> DeviceBindingFilter 校验 Token、比对设备指纹、写入 CurrentUser
    -> PermissionAspect 校验动作权限
    -> DataScopeInterceptor 改写 SQL
    -> Controller 返回结果

刷新:
  POST /api/auth/refresh (httpOnly Cookie 里的 refresh Token)
    -> TokenIssuer.refresh 原子消费 refresh,签发新 access + 新 refresh
    -> 重放检测:同一 refresh 用两次吊销该用户全部 refresh

风险升级:
  指纹不匹配 / 设备被撤销 -> 吊销 refresh + 跳登录
  IP 跨段 -> 触发二次验证(短信 / 邮件 / 已信任设备确认)
  Refresh 重放 -> 吊销该用户全部 refresh + 通知用户
```

每一跳只做自己的事。验证码坏了不影响凭据校验单测,设备指纹换算法不影响 Token 签发,Token 签发换 JWT 实现不影响权限校验。新增一种"通过 TOTP 二次验证"的设备,只需要在 `DeviceRegistry` 的 risk 升级流程里加一个分支,签发和权限链路都不动。这就是这套分层想要的开闭性质。

链路覆盖不了所有边界。跨服务调用时,设备上下文是本地 `CurrentUserHolder`,不会随 RPC 传递,下游服务要么自己校验上游签发的内部令牌,要么信任上游的设备绑定结果。WebSocket 长连接的设备校验要在握手时做一次,之后的帧不再重复校验,过期后断开重连走 HTTP 链路。这些取舍放进设计文档比塞进代码注释更好查。
