import { createContext, useContext, type ReactNode } from 'react'
import type { RoleKey } from './types'

// 演示场景下用 React Context 模拟 store 的 user.roles
// 真实项目里用 Redux/Zustand,这里用 Context 是为了在 Docusaurus 里独立跑
interface RoleContextValue {
  roles: RoleKey[]
  setRoles: (roles: RoleKey[]) => void
}

const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({
  children,
  value,
}: {
  children: ReactNode
  value: RoleContextValue
}) {
  // value 由调用方管理,Demo 里用 useState 持有,切换角色时整个 value 变
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRoleContext(): RoleContextValue {
  const ctx = useContext(RoleContext)
  if (!ctx) {
    throw new Error('useRoleContext 必须在 RoleProvider 内部调用')
  }
  return ctx
}

// 内部 hook:供 usePermission 消费角色
export function useUserRoles(): RoleKey[] {
  return useRoleContext().roles
}
