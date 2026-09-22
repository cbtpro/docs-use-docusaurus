import type { ComponentType } from 'react'
import { usePermission } from './usePermission'
import { renderFallback } from './fallback'
import type { PermissionOptions } from './types'

// 柯里化 HOC:withPermission(options)(Component)
// 返回的新组件内部调 usePermission 判断,有权限渲染原组件,无权限按 fallback 处理
export function withPermission<T extends object>(
  staticOptions: PermissionOptions<T>,
) {
  return function <P extends object>(
    Wrapped: ComponentType<P>,
  ): ComponentType<P & PermissionOptions<T>> {
    function PermissionWrapped(props: P & PermissionOptions<T>) {
      const {
        // 运行时 props 优先级高于静态配置:codes/roles/customFn/extra/fallback/tooltipText
        codes,
        roles,
        customFn,
        extra,
        fallback: runtimeFallback,
        tooltipText: runtimeTooltip,
        ...rest
      } = props

      const merged: PermissionOptions<T> = {
        codes: codes ?? staticOptions.codes,
        roles: roles ?? staticOptions.roles,
        customFn: customFn ?? staticOptions.customFn,
        extra: extra ?? staticOptions.extra,
        fallback: runtimeFallback ?? staticOptions.fallback ?? 'hide',
        tooltipText: runtimeTooltip ?? staticOptions.tooltipText,
      }

      const { hasAuth } = usePermission<T>({
        codes: merged.codes,
        roles: merged.roles,
        customFn: merged.customFn,
        extra: merged.extra,
      })

      if (hasAuth) return <Wrapped {...(rest as P)} />

      // fallback 用 merged 的值,跟判断结果一致
      const fallbackMode = merged.fallback ?? 'hide'
      return renderFallback(
        fallbackMode,
        merged.tooltipText,
        <Wrapped {...(rest as P)} />,
      )
    }

    PermissionWrapped.displayName = `withPermission(${Wrapped.displayName ?? Wrapped.name ?? 'Component'})`
    return PermissionWrapped
  }
}
