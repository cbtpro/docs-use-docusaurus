---
title: CRUD 之外 - 全局偏好的持久化与注入
authors: [cbtpro]
description: 用统一 Provider 管理偏好，区分跟随系统与显式主题，说明存储异常、SSR 和跨标签页同步。
tags:
  - crud
  - 主题切换
  - 状态管理
  - 前端
  - react
  - antd
  - 工程实践
  - 鲁棒性
---

主题、组件尺寸和语言都是跨页面偏好。如果 Header 和设置页各自读 localStorage、各自维护 state，一边修改后另一边不会自动同步。

把当前设置集中在 Provider 中，localStorage 只负责保存，下次进入页面再恢复。antd 的 ConfigProvider 消费同一份设置，自定义样式通过 CSS 变量响应主题。

{/* truncate */}

## 区分主题偏好与当前颜色

“跟随系统”应该作为独立选项保存。只在首次进入时读取系统颜色，再把得到的 light 或 dark 写入 localStorage，会把一次系统结果变成永久用户偏好，后续无法继续跟随系统。

```tsx
export type ThemePreference = 'light' | 'dark' | 'system'
export type Settings = {
  theme: ThemePreference
  componentSize: 'small' | 'middle' | 'large'
  locale: 'zhCN' | 'enUS'
}
const defaults: Settings = { theme: 'system', componentSize: 'middle', locale: 'zhCN' }

function readSavedSettings(): Settings {
  try {
    const raw = JSON.parse(window.localStorage.getItem('ui-settings') ?? '{}')
    if (!raw || typeof raw !== 'object') return defaults
    return {
      theme: ['light', 'dark', 'system'].includes(raw.theme) ? raw.theme : defaults.theme,
      componentSize: ['small', 'middle', 'large'].includes(raw.componentSize)
        ? raw.componentSize : defaults.componentSize,
      locale: ['zhCN', 'enUS'].includes(raw.locale) ? raw.locale : defaults.locale,
    }
  } catch {
    return defaults
  }
}
```

存储内容需要校验；JSON 可能无效，localStorage 本身也可能不可用。保存失败时仍应允许本次会话使用设置。

## Provider 管理恢复与副作用

以下为 Provider 内部片段，Context 类型、导入和语言包映射省略。首次渲染使用相同默认值，挂载后再读取浏览器状态，避免服务端与客户端首次渲染不一致。

```tsx
const [settings, setSettings] = useState<Settings>(defaults)
const [ready, setReady] = useState(false)
const [systemDark, setSystemDark] = useState(false)

useEffect(() => {
  setSettings(readSavedSettings())
  setReady(true)
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!media) return
  const update = () => setSystemDark(media.matches)
  update()
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
}, [])

const effectiveTheme = settings.theme === 'system'
  ? systemDark ? 'dark' : 'light'
  : settings.theme

useEffect(() => {
  if (!ready) return
  document.documentElement.dataset.theme = effectiveTheme
}, [ready, effectiveTheme])

useEffect(() => {
  if (!ready) return
  try {
    window.localStorage.setItem('ui-settings', JSON.stringify(settings))
  } catch {
    // 本次会话仍使用内存中的设置。
  }
}, [ready, settings])

const applySettings = useCallback((next: Partial<Settings>) => {
  setSettings((previous) => ({ ...previous, ...next }))
}, [])

return (
  <SettingsContext.Provider value={{ ...settings, applySettings }}>
    <ConfigProvider
      theme={{ algorithm: effectiveTheme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm }}
      componentSize={settings.componentSize}
      locale={ANTD_LOCALES[settings.locale]}
    >
      {children}
    </ConfigProvider>
  </SettingsContext.Provider>
)
```

`ready` 防止恢复完成前把默认设置写回存储。`applySettings` 接受受信任的应用内参数；若接收 JSON 或远程配置，还需复用运行时校验，TypeScript 不负责校验网络数据。

这里采用 antd 5 / 6.5 的 `middle` 尺寸值；升级组件库时应按对应版本的 ConfigProvider 类型核对。locale 只影响组件库内置文案，应用自己的文本与日期库语言需要另行处理。

## 在首次绘制前应用主题

挂载后读取设置兼容 SSR，首次绘制会采用默认主题。对首屏颜色敏感的页面，在 React 挂载前通过初始化脚本读取已保存的主题并设置 DOM 属性，让首屏与后续设置保持一致。

严格要求避免主题闪烁时，应由服务端根据 cookie 输出初始主题，或在绘制前执行受 CSP 约束的初始化脚本。Hydration 时还需保持服务端与客户端的初始状态一致。初始化脚本与应用共同使用同一份主题取值规则。

```css
:root {
  --page-bg: #fff;
  --page-text: #1a1a1a;
}
[data-theme='dark'] {
  --page-bg: #141414;
  --page-text: #e6e6e6;
}
.page {
  background: var(--page-bg);
  color: var(--page-text);
}
```

## 同步范围要明确

Context value 变化会通知消费它的组件。稳定 applySettings 便于回调传递；设置较多、消费范围较大时，可以把主题和其他偏好拆成不同 Context，减少无关更新。

当前页面通过 Context 更新，其他同源标签页通过 storage 事件接收变化。需要跨标签页同步时，订阅该事件并校验 newValue，再更新内存设置；相同值写回不会再次触发存储变更。

相关实现：[SettingsContext.tsx](https://github.com/cbtpro/action-in-reactjs/blob/main/apps/web/src/contexts/SettingsContext.tsx)。
