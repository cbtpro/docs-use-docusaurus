---
title: CRUD 之外 - 图表组件的封装与流式数据
authors: [cbtpro]
description: 分开管理图表实例与数据更新，监听容器尺寸，并处理流式定时器、交互状态和数据窗口。
tags:
  - crud
  - 图表
  - 组件
  - 状态管理
  - 前端
  - react
  - 工程实践
  - 鲁棒性
---

图表更新频繁时，把 `init`、`setOption` 和监听器都放在依赖 option 的 effect 里，会在每次数据变化时销毁并重建实例。折线图每秒追加一个点，就每秒重建一次。

封装时可以分开处理实例生命周期与数据更新。另一个容易漏掉的地方是尺寸：侧栏折叠或父容器变化，不一定触发 window resize。

{/* truncate */}

## 实例放在 ref 中

下面的 ECharts 容器接收完整 option，实例在挂载时创建，数据变化时只更新配置。

```tsx title="Chart.tsx"
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

interface ChartProps {
  option: EChartsOption
  height?: number | string
}

export default function Chart({ option, height = 320 }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const instance = echarts.init(container)
    chartRef.current = instance
    const resize = () => instance.resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(container)
    window.addEventListener('resize', resize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      instance.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
```

实例不直接参与 JSX，放在 ref 中无需为保存它额外渲染一次。严格模式会在开发环境额外检查 effect 的建立和清理。init 与 dispose 成对执行，每次初始化都对应自己的清理函数。

更新 effect 在实例初始化后执行，无需在初始化 effect 中重复调用一次 setOption。监听器建立和移除使用同一个函数引用。容器初始隐藏或尺寸为零时，需要在显示后 resize；上面保留明确高度，并用 ResizeObserver 响应容器尺寸变化。

## 完整配置和增量配置

ECharts 默认会合并 option。删除 series 时，仅传更短的数组未必清掉旧项。上面的 `notMerge: true` 适用于每次都提供完整配置的组件，但可能重置缩放、图例选择等交互状态。

如果需要保留这些状态，可按业务选择 merge 或 `replaceMerge: ['series']`，并给 series 稳定 ID。完整替换和增量更新分别采用对应的合并策略。

## 定时器读取最新粒度

这里让切换粒度后继续使用同一个定时器，通过 ref 保存已经提交的配置。`VIEW_META`、`StreamPoint` 和 `generateValue` 由业务提供。

```tsx
const [view, setView] = useState<ChartView>('second')
const [streaming, setStreaming] = useState(true)
const [points, setPoints] = useState<StreamPoint[]>([])
const viewRef = useRef(view)
const cursorRef = useRef(Date.now())

useEffect(() => {
  viewRef.current = view
  cursorRef.current = Date.now()
  setPoints([])
}, [view])

useEffect(() => {
  if (!streaming) return
  const append = () => {
    const config = VIEW_META[viewRef.current]
    cursorRef.current += config.stepMs
    const point = { time: cursorRef.current, value: generateValue() }
    setPoints((previous) => [...previous, point].slice(-config.window))
  }
  const timer = window.setInterval(append, 1000)
  return () => window.clearInterval(timer)
}, [streaming])
```

随机数和时间推进放在 updater 外面，使 updater 只根据旧数组和已生成的点计算新数组。updater 保持纯计算，即使被重复调用，也得到同一份更新结果。

另一种有效做法是让 effect 依赖 view，切换时重建计时器。它会重置下一次 tick 的时间，但不会自行丢失已有数据。是否清空 points 是独立的产品决定。

这里按 `stepMs` 推进的是模拟时间轴。如果展示真实采样数据，应使用服务端或采样时刻的时间戳；浏览器后台计时器会被节流，回调到达后按时间戳定位数据点。

## 数据窗口与 option

`slice` 和展开都需要复制数组，仍是 O(n)，优点是保持 React state 不可变。数据量很大时，需要聚合、限长或专门的缓冲结构。

```tsx
const option = useMemo<EChartsOption>(() => ({
  animation: false,
  xAxis: { type: 'time' },
  yAxis: { type: 'value' },
  series: [{ id: 'stream', type: 'line', data: points.map((p) => [p.time, p.value]) }],
}), [points])

return <Chart option={option} />
```

空数据仍传空 series 数据，保留图表实例，避免清空窗口时卸载、下一次 tick 又重建。`useMemo` 可以减少无关更新，但不应承担正确性保证。

相关实现：[Chart.tsx](https://github.com/cbtpro/action-in-reactjs/blob/main/apps/web/src/components/Chart.tsx) 与 [ChartsPage.tsx](https://github.com/cbtpro/action-in-reactjs/blob/main/apps/web/src/pages/ChartsPage.tsx)。
