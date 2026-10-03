---
title: CRUD 之外 - Token 防盗用的三层绑定
authors: [cbtpro]
description: Token 被盗后攻击者拥有用户全部能力，把 Token 与设备指纹、真实 IP、用户身份三层绑定，被盗后在异设备、异网络环境无法继续使用。
tags:
  - crud
  - 全栈
  - 安全
---

登录接口签发的 Token 经常被直接返回给前端，前端放在 localStorage 或内存里，后续请求带在 Authorization 头里。Token 一旦泄露，攻击者就拥有了这个用户的所有能力，直到过期。过期时间设短，用户频繁掉线；设长，被盗的窗口也跟着拉长。

真正的问题不是 Token 会不会泄露，而是泄露之后攻击者能不能用。把 Token 和三个东西绑在一起：谁在用（用户身份）、在什么设备上用（设备指纹）、从哪个网络环境用（真实 IP）。三者同时匹配，Token 才有效。

{/* truncate */}

## 朴素实现：Token 里只有用户 ID

最常见的写法是签一个 JWT，payload 里只放 `uid` 和 `roles`：

```java
String token = jwt.sign(Map.of("uid", user.id(), "roles", user.roles()));
```

这套写法的问题很直接。Token 被 XSS 抓走、被日志记录、被中间代理缓存，攻击者拿到后换个设备、换个网络照样能用。后端没有任何信号判断这个请求是不是来自原来的用户。

## 改进一：绑定 IP

给 Token 加一个 `ip` 字段，签发时记下客户端 IP，后续请求比对。

```java
String ip = request.getRemoteAddr();
String token = jwt.sign(Map.of("uid", user.id(), "ip", ip));
```

马上撞到两个问题。移动网络切换基站、Wi-Fi 与 5G 互切，IP 会变。校验严到必须一致，正常用户会被踢回登录页。更隐蔽的是 `getRemoteAddr` 拿到的 IP 不可信，后端前面挂了 Nginx、CDN、WAF 时，拿到的是最后一跳的代理地址。要拿真实 IP，得解析 `X-Forwarded-For`，但这条头是客户端可以伪造的。

## 改进二：加设备指纹

让前端采集 UA、屏幕分辨率、时区、语言、Canvas 渲染特征、AudioContext 输出，哈希成指纹，登录时一起发过来，后端写进 Token。

```java
String fp = hasher.hash(signals);
String token = jwt.sign(Map.of("uid", user.id(), "fp", fp));
```

设备指纹比 localStorage 里的随机 UUID 稳定得多，但仍有边界。指纹采集依赖客户端环境，攻击者拿到 Token 的同时也能拿到同源的 storage 内容。单一信号维度不够，要组合多个信号。

## 核心方案：三层绑定

把 Token 与三个维度同时绑定：用户身份在 Token 里，设备指纹在 Token 里，真实 IP 在签发时记录到服务端，后续校验时按配置的容忍度比对。

```java title="TokenClaims.java"
public record TokenClaims(
    Long userId,
    Set<String> roles,
    String deviceId,
    String fingerprintHash
) {}
```

```java title="TokenBindingFilter.java"
@Component
public class TokenBindingFilter extends OncePerRequestFilter {

    private final JwtVerifier verifier;
    private final DeviceRegistry devices;
    private final RequestContextResolver contextResolver;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            chain.doFilter(request, response);
            return;
        }

        TokenClaims claims = verifier.verify(header.substring(7));

        // 设备指纹比对
        String actualFp = request.getHeader("X-Device-Fp");
        if (!claims.fingerprintHash().equals(actualFp)) {
            throw new DeviceMismatchException();
        }

        // 设备状态检查
        Device device = devices.findById(claims.deviceId());
        if (device == null || device.risk() == RiskLevel.REVOKED) {
            throw new DeviceRevokedException();
        }

        // IP 弱校验,只作为风险信号,不做硬比对
        String clientIp = contextResolver.resolve(request).clientIp();
        if (!device.lastKnownIp().equals(clientIp)) {
            riskService.recordIpChange(device.deviceId(), clientIp);
        }

        CurrentUserHolder.set(new AuthenticatedUser(
            claims.userId(), claims.roles(), device
        ));

        try {
            chain.doFilter(request, response);
        } finally {
            CurrentUserHolder.clear();
        }
    }
}
```

三层绑定的校验逻辑分开。设备指纹不匹配是高危，直接拒绝。设备被撤销是用户主动操作，要求重新登录。IP 变化只记录风险，不阻断请求。三层各管各的，新增一层绑定不需要改其他层的代码。

## 真实 IP 获取

`X-Forwarded-For` 是逗号分隔的链路，客户端可以伪造任何内容。正确做法是从右往左跳过可信代理，第一个不在可信网段的就是真实客户端。可信代理网段在配置里显式声明，不在代码里写死。

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
        // 最后一跳不可信,说明请求没经过已知代理,直接返回 remote
        if (!isTrusted(remote)) {
            return remote;
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded == null || forwarded.isBlank()) {
            return remote;
        }
        // 从右往左跳过可信代理,第一个不在可信网段的就是真实客户端
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

这套 IP 解析不只用在登录。`TokenBindingFilter` 里也要用同一个 `RequestContextResolver` 拿真实 IP，否则登录时记的 IP 和请求时校验的 IP 不在一个口径上。

## 浏览器指纹采集

React 端在登录页或全局初始化时采集一次信号，不重复采集。采集完哈希后随登录请求一起发，不进 localStorage 当唯一设备标识。

```ts title="collectDeviceSignals.ts"
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
```

Canvas 和 AudioContext 的采集放在懒加载组件里，SSR 阶段 `document` 不存在，直接调会报错。信号采集本身不保密，客户端能拿到的东西攻击者也能拿到。意义在于把伪造一个能通过的指纹的成本拉高，而不是不可伪造。

## 服务端指纹哈希

服务端拿到信号集合后，按固定字段顺序拼成稳定字符串，再哈希成设备指纹。

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
}
```

指纹哈希只是设备绑定的辅助信号，不作为唯一来源。服务端在 `DeviceRegistry` 里给每个用户维护一个 `(userId, fingerprint, deviceId, firstSeenIp, risk)` 的列表，同一个指纹第一次出现就发一个新的 `deviceId`，之后这个 deviceId 与用户绑定。Token 里同时装 `deviceId` 和 `fingerprintHash`，后续校验时两个都要比对。

## 双 Token 与存储位置

签发 Token 时同时产出 access 和 refresh，职责完全不同。access 短期，放前端内存，用于业务接口鉴权。refresh 长期，放 httpOnly Cookie，前端 JS 读不到，用于在 access 失效后换取新的 access 和 refresh。

```java title="JwtTokenIssuer.java"
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

access Token 装着设备 ID 和指纹哈希，后续请求校验时比对这两个字段。签发时的 IP 不进 Token，只作为风险信号记录在 `DeviceRegistry` 里，校验时按配置的容忍度做弱比对。

存储位置是这套方案的关键决策。access Token 暴露在前端 JS 可读的位置，XSS 抓得到，但因为有效期短，被盗窗口小。refresh Token 放 httpOnly Cookie，XSS 读不到，只能通过 CSRF 利用，而 CSRF 又可以靠 SameSite 属性和 Origin 头挡住。两者职责分开后，任何一种攻击单独成功都拿不到完整的刷新能力。

## 前端 Token 存储与自动刷新

React 端用一个 axios 拦截器自动加 access Token，401 时触发 refresh，refresh 失败再跳登录页。access Token 不放 localStorage，放内存中的 `tokenStore`，减少 XSS 拿到的内容。refresh Token 放 httpOnly Cookie，axios 自动带，前端 JS 不接触。

```ts title="authClient.ts"
const tokenStore = new TokenStore();
let refreshing: Promise<boolean> | null = null;
let cachedFingerprint: string | null = null;

export const authClient = axios.create({ withCredentials: true });

// 登录时调用一次,采集信号并算好指纹哈希缓存起来
export async function cacheDeviceSignals(): Promise<void> {
  const signals = await collectDeviceSignals();
  cachedFingerprint = hashSignals(signals);
}

function hashSignals(signals: DeviceSignals): string {
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

authClient.interceptors.request.use(async (config) => {
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
```

并发的 401 共享同一个 `refreshing` Promise，避免五个请求同时 401 触发五次刷新把对方的 refresh 顶掉。

## 风险升级与反馈

校验失败的反馈要分开。指纹不匹配是高危，直接吊销这个 Token 关联的所有 Refresh Token，要求重新登录。IP 跨段是中风险，触发二次验证而非直接拒绝。设备撤销是用户主动操作，要求重新登录。三类反馈分开，避免任何风险信号一变就踢登录的糟糕体验。

新设备首次登录 `risk = RISKY`，走二次验证流程。验证通过后升级为 `NORMAL`，长期使用且无异常的可以由用户在设置页标记为 `TRUSTED`，延长其 Refresh Token 有效期。

## 关键决策与边界

指纹采集的稳定性与隐私。Canvas 和 AudioContext 的输出在不同浏览器版本间会有差异，指纹哈希不能要求逐字节一致，要做模糊匹配或分桶。同时这些信号属于客户端环境信息，采集前要在隐私协议里说清，不要默认采集所有维度。

Refresh Token 的存储位置是这套方案的安全基石。放进 localStorage 等于和 access Token 一样暴露给 XSS；放进普通 Cookie 没有 SameSite 属性会被 CSRF 利用。生产环境强制 httpOnly + Secure + SameSite=Lax 或 Strict，并且只接受 POST 请求，Origin 头比对。

IP 弱校验的容忍度要按业务调。金融场景严到同网段才放行，内容类应用可以松到只看国家或大区。把容忍度做成配置，不要写死在 `TokenBindingFilter` 里。容忍度太严会误杀正常用户，太松等于没做。常见做法是新设备首次登录要求二次验证，之后同指纹的设备只做弱 IP 校验，触发风险信号才升级到二次验证。

跨服务调用时，设备上下文是本地 `CurrentUserHolder`，不会随 RPC 传递，下游服务要么自己校验上游签发的内部令牌，要么信任上游的设备绑定结果。WebSocket 长连接的设备校验要在握手时做一次，之后的帧不再重复校验，过期后断开重连走 HTTP 链路。这些取舍放进设计文档比塞进代码注释更好查。
