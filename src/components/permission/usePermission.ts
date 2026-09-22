import { useMemo } from 'react'
import { hasPermission } from './permissionUtils'
import { useUserRoles } from './RoleContext'
import type { UsePermissionOptions } from './types'

export function usePermission<T = unknown>(options: UsePermissionOptions<T> = {}) {
  const userRoles = useUserRoles()

  // 主判断:有权限才返回 true
  const hasAuth = useMemo(
    () => hasPermission<T>({ userRoles, ...options }),
    [
      userRoles,
      options.codes,
      options.roles,
      options.customFn,
      options.extra,
    ],
  )

  // 行内二次校验函数:列表 map 场景用
  // 引用稳定,只依赖 userRoles
  const check = useMemo(
    () => (opts: UsePermissionOptions) =>
      hasPermission({ userRoles, ...opts }),
    [userRoles],
  )

  return { hasAuth, userRoles, check }
}
