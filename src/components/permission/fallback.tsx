import { Tooltip } from 'antd'
import type { ReactNode } from 'react'

export function renderFallback(
  mode: 'hide' | 'disable',
  tooltipText: ReactNode | undefined,
  content: ReactNode,
): ReactNode {
  if (mode === 'hide') return null

  return (
    <Tooltip title={tooltipText ?? '暂无操作权限'} trigger={['hover', 'focus']}>
      <span
        aria-disabled="true"
        tabIndex={0}
        onClickCapture={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        style={{ display: 'inline-block', opacity: 0.5, cursor: 'not-allowed' }}
      >
        {/* inert 阻止子控件获得焦点；外层保留鼠标和焦点事件以显示原因。 */}
        <span inert style={{ display: 'inline-block', pointerEvents: 'none' }}>
          {content}
        </span>
      </span>
    </Tooltip>
  )
}
