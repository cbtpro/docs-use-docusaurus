---
title: CRUD 之外 - 布局外壳与子页面的两条通信路径
authors: [cbtpro]
description: 通过 Outlet context 注册页面操作，通过 route handle 提供标题和面包屑，明确 effect 依赖、清理与多页面边界。
tags:
  - crud
  - 路由
  - 布局
  - 前端
  - react
  - antd
  - 工程实践
  - 鲁棒性
---

列表页的“新建”、详情页的“编辑”和“返回列表”可以统一放到布局外壳的面包屑栏右侧。位置由 Layout 管理，按钮的行为仍由当前页面决定。

这里用两条通信路径：路由标题和面包屑放在 route handle 中，依赖页面内部状态的操作按钮通过 Outlet context 注册。

{/* truncate */}

## Layout 提供操作区域

```tsx title="Layout 中的局部上下文"
export type OutletContext = {
  setActions: (actions: ReactNode) => void
}

function Layout() {
  const [actions, setActions] = useState<ReactNode>(null)
  return (
    <>
      <div className="app-breadcrumb-bar">
        <Breadcrumb />
        <div>{actions}</div>
      </div>
      <Outlet context={{ setActions } satisfies OutletContext} />
    </>
  )
}
```

`satisfies` 在传入处检查对象形状，子页面通过 `useOutletContext<OutletContext>()` 获得消费侧类型，形成编译期的接口约定。

操作栏节点由 Layout 的局部 state 保存，随页面挂载和卸载注册、清理。需要全局持久化时，将操作描述保存为可序列化数据，在展示层映射为组件。

## 注册时带齐依赖

```tsx title="子页面注册操作按钮"
const { setActions } = useOutletContext<OutletContext>()
const navigate = useNavigate()
const handleBack = useCallback(() => navigate('/list'), [navigate])

useEffect(() => {
  setActions(
    <Space>
      <Button onClick={handleBack}>返回列表</Button>
      {pageMode === 'detail' && <Button onClick={handleEnableEdit}>编辑</Button>}
      {pageMode === 'edit' && <Button onClick={handleCancelEdit}>取消编辑</Button>}
    </Space>,
  )
  return () => setActions(null)
}, [setActions, pageMode, handleBack, handleEnableEdit, handleCancelEdit])
```

`handleEnableEdit` 和 `handleCancelEdit` 也应使用正确依赖的 useCallback。否则每次注册都会创建新节点、引起 Layout 更新，再让页面重新注册。省略依赖虽然暂时减少执行次数，却可能让按钮保留旧的记录 ID 或表单快照。

清理函数负责页面离开后移除操作按钮，尤其是下一个页面没有注册按钮时。setActions 替换当前节点，cleanup 负责注销当前页面的注册。其他订阅和异步资源也在各自的清理函数中释放。

effect 在提交后更新操作栏。需要按钮与路由同步切换时，将注册结果绑定路由标识，Layout 只渲染当前路由对应的操作；也可以通过 Portal 渲染到布局插槽。保留多个缓存页面时，注册表以路由为键，并按当前激活页面选择操作栏。

## 路由元信息由 handle 提供

```tsx title="路由配置示意"
{
  path: 'form',
  element: <FormPage />,
  handle: {
    title: (params: URLSearchParams) => {
      const id = params.get('id')
      return id ? `表单 ${id}` : '新建表单'
    },
    breadcrumb: (params: URLSearchParams) => [
      { title: '列表', path: '/list' },
      { title: params.get('id') ? `表单 ${params.get('id')}` : '新建表单' },
    ],
  } satisfies RouteHandle,
}
```

Layout 内的面包屑组件通过 `useMatches` 读取匹配链，这要求使用 React Router 数据路由。带 path 的条目最好渲染为 Link，保留键盘访问、复制地址和新标签打开等链接行为。

route handle 适合静态按钮，或能由路由数据决定的操作。依赖页面内部草稿、加载状态和回调的按钮，通过 Outlet context 注册更方便。两种方式按数据来源分工。

这套设计适用于单个活跃 Outlet。更复杂的嵌套路由、多个区域或页面缓存，需要明确谁拥有操作区、谁能覆盖，以及什么时候注销。

实现参考：[Layout.tsx](https://github.com/cbtpro/action-in-reactjs/blob/main/apps/web/src/components/Layout.tsx)、[router.tsx](https://github.com/cbtpro/action-in-reactjs/blob/main/apps/web/src/app/router.tsx)。
