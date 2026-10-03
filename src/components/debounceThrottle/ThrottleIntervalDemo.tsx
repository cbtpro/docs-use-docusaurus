import { useCallback, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { Card, Segmented, Tag } from 'antd'
import { useRafThrottle, useThrottledCallback } from './hooks'

// 四种节流策略:rAF 跟随帧率,其余为固定 interval。
type Strategy = 'rAF' | '16ms' | '100ms' | '200ms'

const STRATEGIES: Strategy[] = ['rAF', '16ms', '100ms', '200ms']

// 不同策略对应的节流间隔;rAF 不使用固定间隔,占位 16。
function intervalOf(strategy: Strategy): number {
  if (strategy === '16ms') return 16
  if (strategy === '100ms') return 100
  if (strategy === '200ms') return 200
  return 16
}

const AREA_WIDTH = 400
const AREA_HEIGHT = 240
const BOX_SIZE = 40

// 拖拽区域内跟随鼠标的小方块初始居中。
const INITIAL_POSITION = {
  left: AREA_WIDTH / 2 - BOX_SIZE / 2,
  top: AREA_HEIGHT / 2 - BOX_SIZE / 2,
}

export default function ThrottleIntervalDemo() {
  const [strategy, setStrategy] = useState<Strategy>('rAF')
  const [position, setPosition] = useState(INITIAL_POSITION)
  const [count, setCount] = useState(0)
  const [lastTs, setLastTs] = useState(0)

  // 实际更新位置、计数与时间戳的纯函数,保持稳定引用。
  const applyMove = useCallback((e: MouseEvent) => {
    setPosition({
      left: e.nativeEvent.offsetX - BOX_SIZE / 2,
      top: e.nativeEvent.offsetY - BOX_SIZE / 2,
    })
    setCount((c) => c + 1)
    setLastTs(Date.now())
  }, [])

  const interval = intervalOf(strategy)

  // 两个节流 hook 必须无条件调用,按策略选用其一。
  const rafHandler = useRafThrottle(applyMove)
  const throttledHandler = useThrottledCallback(applyMove, interval)

  // 用 ref 持有最新调度函数,避免每次渲染重建 onMouseMove。
  const handlerRef = useRef(rafHandler)
  handlerRef.current = strategy === 'rAF' ? rafHandler : throttledHandler

  const onMove = useCallback((e: MouseEvent) => {
    handlerRef.current(e)
  }, [])

  // 切换策略时清零计数与时间戳,便于直观对比。
  const handleStrategyChange = (next: Strategy) => {
    setStrategy(next)
    setCount(0)
    setLastTs(0)
  }

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <div
        style={{
          marginBottom: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span>节流策略:</span>
        <Segmented
          value={strategy}
          options={STRATEGIES}
          onChange={(v) => handleStrategyChange(v as Strategy)}
        />
      </div>

      <div
        onMouseMove={onMove}
        style={{
          position: 'relative',
          width: AREA_WIDTH,
          height: AREA_HEIGHT,
          background: '#f5f5f5',
          border: '1px solid #d9d9d9',
          cursor: 'crosshair',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: position.left,
            top: position.top,
            width: BOX_SIZE,
            height: BOX_SIZE,
            background: '#1677ff',
            // 跟随元素不接收鼠标事件,保证 offsetX/Y 始终相对拖拽区域。
            pointerEvents: 'none',
          }}
        />
      </div>

      <div
        style={{
          marginTop: 12,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Tag color="blue">已触发:{count}</Tag>
        <Tag color="orange">最近时间戳:{lastTs || '—'}</Tag>
      </div>
    </Card>
  )
}
