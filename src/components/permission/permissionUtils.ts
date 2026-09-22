import type {
  HasPermissionParams,
  PermissionCode,
  RoleKey,
} from './types'

// 权限矩阵:权限码 → 允许的角色
// admin 对角色权限放行，但仍需满足 customFn 的业务限制。
export const PERMISSION_MATRIX: Record<PermissionCode, RoleKey[]> = {
  'record:create': ['admin', 'manager', 'employee'],
  'record:view': ['admin', 'manager', 'employee', 'auditor', 'guest'],
  'record:edit': ['admin', 'manager', 'employee'],
  'record:delete': ['admin'],
  'record:export': ['admin', 'manager', 'auditor'],
  'record:approve': ['admin', 'manager'],
  'record:audit': ['auditor'],
  'record:submit': ['admin', 'manager', 'employee'],
  'system:user-manage': ['admin'],
  'system:role-manage': ['admin'],
}

// 判断顺序(AND 关系,全部满足才返回 true):
//   1. admin 短路:矩阵类权限对 admin 全放行
//   2. codes 与矩阵有交集(或 roles 直接命中)
//   3. 若传 customFn,customFn 返回 true
export function hasPermission<T = unknown>(
  params: HasPermissionParams<T>,
): boolean {
  const { userRoles, codes, roles, customFn, extra } = params
  const isAdmin = userRoles.includes('admin')

  // 第 1 步:矩阵校验(codes 走矩阵,roles 直接命中,二选一)
  let matrixPass = true
  if (codes && codes.length > 0) {
    matrixPass =
      isAdmin ||
      codes.some((c) => {
        const allow = PERMISSION_MATRIX[c] ?? []
        return allow.some((r) => userRoles.includes(r))
      })
  } else if (roles && roles.length > 0) {
    matrixPass = isAdmin || roles.some((r) => userRoles.includes(r))
  }
  if (!matrixPass) return false

  // 第 2 步:业务级校验(对 admin 也生效)
  if (customFn && !customFn(userRoles, extra)) return false

  return true
}
