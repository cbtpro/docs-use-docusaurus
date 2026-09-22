// 角色枚举
export type RoleKey = 'admin' | 'manager' | 'employee' | 'auditor' | 'guest'

// 权限码枚举
export type PermissionCode =
  | 'record:create'
  | 'record:view'
  | 'record:edit'
  | 'record:delete'
  | 'record:export'
  | 'record:approve'
  | 'record:audit'
  | 'record:submit'
  | 'system:user-manage'
  | 'system:role-manage'

// 自定义业务级校验函数:角色通过后,再做业务判断
// 典型场景:只有 record.status === '草稿' 才能编辑,即使角色允许
export type PermissionCustomFn<T = unknown> = (
  userRoles: RoleKey[],
  extra?: T,
) => boolean

// hasPermission 的入参
export interface HasPermissionParams<T = unknown> {
  userRoles: RoleKey[]
  codes?: PermissionCode[]
  roles?: RoleKey[]
  customFn?: PermissionCustomFn<T>
  extra?: T
}

// usePermission 的入参:跟 hasPermission 一致,只是去掉了 userRoles(从 store/Context 取)
export type UsePermissionOptions<T = unknown> = Omit<HasPermissionParams<T>, 'userRoles'>

// withPermission 静态配置 + 运行时 props 共用的 options
export interface PermissionOptions<T = unknown> extends UsePermissionOptions<T> {
  fallback?: 'hide' | 'disable'
  tooltipText?: React.ReactNode
}

// PermissionGuard 的 props
export interface PermissionGuardProps<T = unknown> extends PermissionOptions<T> {
  children?: React.ReactNode
}
