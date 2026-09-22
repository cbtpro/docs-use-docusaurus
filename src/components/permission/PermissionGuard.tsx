import { usePermission } from './usePermission'
import { renderFallback } from './fallback'
import type { PermissionGuardProps } from './types'

// 声明式权限组件:适合单次使用,不提前抽具名组件
// 内部跟 withPermission 完全等价,只是把配置搬到 JSX 标签 props 上
export function PermissionGuard<T = unknown>({
  fallback = 'hide',
  tooltipText,
  children,
  ...rest
}: PermissionGuardProps<T>) {
  const { hasAuth } = usePermission<T>(rest)

  if (hasAuth) return <>{children}</>

  return renderFallback(fallback, tooltipText, children)
}
