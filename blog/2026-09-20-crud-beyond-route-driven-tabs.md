---
title: CRUD 之外 - 路由驱动的多标签栏
authors: [cbtpro]
description: 区分当前路由与已打开标签历史，处理参数标识、动态标题、关闭导航及持久化边界。
tags:
  - crud
  - 状态管理
  - 路由
  - 前端
  - react
  - antd
  - 工程实践
  - 鲁棒性
---

同一个表单路由可以打开多条记录，例如 `/form?id=REC1000` 和 `/form?id=REC1001`。标签栏需要区分它们，也需要在关闭当前标签时导航到仍然存在的页面。

当前激活项可以从 URL 派生，但“曾经打开过哪些标签”必须另外保存。URL 本身不包含整份访问历史，把这两种状态分开，逻辑会更清楚。

{/* truncate */}

## 标签标识取哪些参数

`pathname + search` 是一个简单起点，但原始字符串会把 `?id=1&mode=edit` 与 `?mode=edit&id=1` 当成两项。对参数顺序无业务意义的路由，可以先排序：

```ts
function getTabKey(pathname: string, search: string) {
  const params = new URLSearchParams(search)
  params.sort()
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
```

同名多值参数是否有顺序语义，要按路由决定。列表页的 page、keyword 也未必应该成为标签标识，否则每次筛选都会新增标签。更完整的方案是在路由配置里声明参与标识的参数，例如详情页只用 id，其他参数作为该标签最近一次访问的地址。

## 标题来自路由配置

```ts
interface RouteHandle {
  title?: string | ((params: URLSearchParams) => string)
}
```

使用 `useMatches` 获取匹配的 handle 需要数据路由。标题可为静态字符串，也可以根据 id 生成。面包屑描述层级，标签标题描述当前页面，两者可以分别配置。

以下片段假设 `currentKey` 已由路由归一化，`currentLabel` 已由 handle 计算，省略导入和路由定义。

```tsx title="标签历史与激活项"
interface RouteTab { key: string; label: string; closable: boolean }
const HOME_TAB: RouteTab = { key: '/', label: '首页', closable: false }

const [tabs, setTabs] = useState<RouteTab[]>([HOME_TAB])

useEffect(() => {
  if (currentKey === HOME_TAB.key) return
  setTabs((previous) => {
    const existing = previous.find((tab) => tab.key === currentKey)
    if (!existing) return [...previous, { key: currentKey, label: currentLabel, closable: true }]
    if (existing.label === currentLabel) return previous
    return previous.map((tab) => tab.key === currentKey ? { ...tab, label: currentLabel } : tab)
  })
}, [currentKey, currentLabel])

const removeTab = (key: string) => {
  if (key === HOME_TAB.key) return
  const index = tabs.findIndex((tab) => tab.key === key)
  if (index < 0) return
  const next = tabs.filter((tab) => tab.key !== key)
  setTabs(next)
  if (key === currentKey) {
    navigate(next[Math.max(0, index - 1)]?.key ?? HOME_TAB.key, { replace: true })
  }
}

return (
  <Tabs
    type="editable-card"
    items={tabs}
    activeKey={currentKey}
    onChange={(key) => navigate(key)}
    onEdit={(key, action) => {
      if (action === 'remove' && typeof key === 'string') removeTab(key)
    }}
    hideAdd
  />
)
```

函数式更新用最新的标签数组判重。标题也进入依赖，避免语言或记录标题变化后仍显示旧文案。

首页作为标签数组的固定首项。`closable: false` 隐藏关闭按钮，removeTab 中按 key 提前返回，两处共同保证它始终保留。

## 关闭、持久化与页面缓存

关闭当前标签后，这里选择左侧相邻项。关闭非当前项只修改标签历史，不改变当前 URL。仅删除标签不会自动卸载路由页面；是否导航由代码明确决定。

这份实现刷新后只恢复首页和当前 URL 对应的标签，其余历史会丢失。需要保留时可将标签地址写入 sessionStorage，并在恢复时校验路由、权限和数量，重新生成标题。持久化内容只保存可恢复的地址与业务标识。

标签历史与页面状态分别管理。表单草稿按记录 ID 保存，滚动位置按路由恢复，离开未保存页面时提供提示。同一路由参数变化后，页面按新 id 加载数据。

相关实现：[TabBar.tsx](https://github.com/cbtpro/action-in-reactjs/blob/main/apps/web/src/components/TabBar.tsx)。
