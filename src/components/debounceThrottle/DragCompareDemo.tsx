import { useCallback, useRef, useState } from 'react'
import { Card, Segmented, Space, Tag, Typography } from 'antd'
import { useDebouncedCallback, useThrottledCallback } from './hooks'

type Mode = '无防护' | '防抖' | '节流'

// 拖拽区域与跟随方块的尺寸
const AREA_WIDTH = 400
const AREA_HEIGHT = 200
const FOLLOWER_SIZE = 40

// 各模式说明,展示在切换器下方
const MODE_DESC: Record<Mode, string> = {
  无防护: '每次 mousemove 都同步位置,触发次数与鼠标移动频率一致(高频)。',
  防抖: '拖拽过程中持续重置 300ms 计时器,只有停顿后才跳到目标位置。',
  节流: '16ms 间隔更新,元素跟着鼠标走,松手时落到精确位置。',
}

export default function DragCompareDemo() {
  const [mode, setMode] = useState<Mode>('无防护')

  // 跟随方块、计数与位置显示都挂在 ref 上,位置更新走 DOM,
  // 避免高频 mousemove 触发 React 重渲染。
  const followerRef = useRef<HTMLDivElement>(null)
  const countRef = useRef(0)
  const countDisplayRef = useRef<HTMLSpanElement>(null)
  const posDisplayRef = useRef<HTMLSpanElement>(null)

  // 把位置写进 DOM 并累加计数。只依赖 ref,函数引用稳定。
  const applyPosition = useCallback((x: number, y: number) => {
    if (followerRef.current) {
      // 居中跟随,让方块中心对齐鼠标。
      const dx = x - FOLLOWER_SIZE / 2
      const dy = y - FOLLOWER_SIZE / 2
      followerRef.current.style.transform = `translate(${dx}px, ${dy}px)`
    }
    countRef.current += 1
    if (countDisplayRef.current) {
      countDisplayRef.current.textContent = String(countRef.current)
    }
    if (posDisplayRef.current) {
      posDisplayRef.current.textContent = `(${x}, ${y})`
    }
  }, [])

  // 防抖与节流复用同一个稳定的 handler,只调度策略不同。
  const debouncedMove = useDebouncedCallback(applyPosition, 300)
  const throttledMove = useThrottledCallback(applyPosition, 16)

  // 切换模式时顺手重置计数与位置,便于干净对比。
  const handleModeChange = (val: string | number) => {
    setMode(val as Mode)
    countRef.current = 0
    if (countDisplayRef.current) countDisplayRef.current.textContent = '0'
    if (posDisplayRef.current) posDisplayRef.current.textContent = '—'
    if (followerRef.current) followerRef.current.style.transform = 'translate(0px, 0px)'
  }

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const x = e.nativeEvent.offsetX
    const y = e.nativeEvent.offsetY
    if (mode === '无防护') applyPosition(x, y)
    else if (mode === '防抖') debouncedMove(x, y)
    else throttledMove(x, y)
  }

  return (
    <Card size="small" title="拖拽位置同步:三种调度策略对比">
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Segmented
            size="small"
            value={mode}
            options={['无防护', '防抖', '节流']}
            onChange={handleModeChange}
          />
          <Tag color="blue">当前模式:{mode}</Tag>
        </div>

        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {MODE_DESC[mode]}
        </Typography.Paragraph>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>
            已触发次数:
            <Tag>
              <span ref={countDisplayRef}>0</span>
            </Tag>
          </span>
          <span>
            最近位置:
            <Tag>
              <span ref={posDisplayRef}>—</span>
            </Tag>
          </span>
        </div>

        {/* 拖拽区域:固定尺寸,浅灰底;按住鼠标在其中移动,跟随方块即响应当前策略。 */}
        <div
          onMouseMove={onMove}
          style={{
            position: 'relative',
            width: AREA_WIDTH,
            height: AREA_HEIGHT,
            background: '#f5f5f5',
            border: '1px solid #d9d9d9',
            userSelect: 'none',
            cursor: 'default',
          }}
        >
          {/* 跟随方块:pointer-events: none,避免它成为 mousemove 的 target,保证 offset 始终相对拖拽区域。 */}
          <div
            ref={followerRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: FOLLOWER_SIZE,
              height: FOLLOWER_SIZE,
              background: 'rgba(22, 119, 255, 0.6)',
              pointerEvents: 'none',
              transform: 'translate(0px, 0px)',
            }}
          />
          <span style={{ position: 'absolute', bottom: 6, right: 8, color: '#999' }}>
            按住鼠标在此区域内移动
          </span>
        </div>
      </Space>
    </Card>
  )
}
