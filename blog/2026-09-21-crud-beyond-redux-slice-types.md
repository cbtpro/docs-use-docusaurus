---
title: CRUD 之外 - Redux store 的 slice 设计与类型安全
authors: [cbtpro]
description: 从 store 推断 Redux 类型，明确 typed hooks 的作用，并区分账号替换与资料更新，避免角色残留。
tags:
  - crud
  - 状态管理
  - 权限
  - 前端
  - react
  - 工程实践
  - 鲁棒性
  - 软件设计
---

权限按钮需要读取当前角色，用户菜单还会读取姓名和头像。项目已经使用 Redux Toolkit 时，可以把这些字段放在 user slice 中，并让组件只订阅需要的部分。

类型应从真实 store 推断。手写另一份 RootState 容易在新增 reducer 后失配，而角色联合类型可以及时发现拼写错误。是否采用 Redux 仍取决于状态共享和调试需求，也可以通过拆分 Context 满足较简单的共享需求。

{/* truncate */}

## slice 的数据契约

```ts title="userSlice.ts"
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type RoleKey = 'admin' | 'manager' | 'employee' | 'auditor' | 'guest'
export interface UserInfo {
  id: string
  name: string
  avatar?: string
  roles: RoleKey[]
}
interface UserState { info: UserInfo | null }
const initialState: UserState = { info: null }

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<UserInfo>) {
      state.info = action.payload
    },
    clearUser(state) {
      state.info = null
    },
    updateProfile(state, action: PayloadAction<Partial<Pick<UserInfo, 'name' | 'avatar'>>>) {
      if (state.info) Object.assign(state.info, action.payload)
    },
  },
})
export const { setUser, clearUser, updateProfile } = userSlice.actions
export default userSlice.reducer
```

切换账号应替换完整用户信息。用 `Partial<UserInfo>` 合并新账号，如果遗漏 roles，会继承上一个账号的角色。局部资料更新单独命名，并限制可修改字段；退出登录时清空身份及相关业务缓存。

用户状态初始为空，登录后校验服务端响应，再写入身份与角色。权限演示使用独立的模拟数据入口，角色联合类型用于编译期检查。

## 从 store 推断 hooks 类型

```ts title="store.ts"
import { configureStore } from '@reduxjs/toolkit'
import userReducer from './userSlice'

export const store = configureStore({ reducer: { user: userReducer } })
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
```

```ts title="hooks.ts"
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from './store'

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
```

`withTypes` 需要 React Redux 9.1 或更新版本。旧版本可使用 `TypedUseSelectorHook` 和显式返回类型的 dispatch hook。

`RootState` 跟随 reducer 结构变化，`AppDispatch` 则包含 store 中间件扩展出来的能力，例如 thunk。dispatch 保留 Redux 的开放 action 模型。

类型检查分布在两个位置：createSlice 生成的 action creator 检查 payload，typed hooks 提供 RootState 和包含中间件能力的 AppDispatch。组件调用时，两部分约束自然衔接。

## 订阅时保持结果引用稳定

```tsx
const roles = useAppSelector((state) => state.user.info?.roles)
const canEdit = roles?.includes('admin') || roles?.includes('employee') || false
```

`useSelector` 默认按严格相等比较返回值。只改姓名且 roles 引用不变时，这份订阅不会因 store 更新而要求重渲染；组件仍可能因父组件或其他状态更新而渲染。若 selector 每次都返回新对象，需要 memoized selector 或适当的相等比较。

Context value 变化会通知其消费者，拆分 Context 可以缩小更新范围。性能比较以实际页面的订阅范围和渲染耗时为准。

Redux Toolkit 的 reducer 通过 Immer 接受 draft 修改，因此 `state.info.roles.push(role)` 是合法写法；无需为了“不可变”再机械地复制一次数组。边界规则仍要显式实现，例如角色去重、退出时清空和账号切换时整体替换。

前端 store 负责界面状态，真实权限由后端认证和授权结果决定。相关实现：[action-in-reactjs 的 store](https://github.com/cbtpro/action-in-reactjs/tree/main/apps/web/src/store)。
