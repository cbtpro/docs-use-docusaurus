import { useRef, useState } from 'react'
import { Card, Input, Segmented, Tag, Typography } from 'antd'
import { useDebouncedCallback, useThrottledCallback } from './hooks'

const { Text } = Typography

type Mode = '无防护' | '防抖' | '节流'

interface RequestLog {
  id: number
  ts: number
  keyword: string
  done: boolean
}

const DEBOUNCE_WAIT = 300
const THROTTLE_INTERVAL = 300
const FETCH_DELAY = 200
const MAX_LOGS = 10

// 将时间戳格式化为 时:分:秒.毫秒,毫秒补零至 3 位
function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
    d.getMilliseconds(),
    3,
  )}`
}

// 模拟一次异步搜索请求,FETCH_DELAY 毫秒后返回关键字
function simulateFetch(keyword: string): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(keyword), FETCH_DELAY)
  })
}

// 单条请求记录:时间戳 + 状态 Tag + 关键字
function LogItem({ log }: { log: RequestLog }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
      <Text
        type="secondary"
        style={{ fontVariantNumeric: 'tabular-nums', width: 120 }}
      >
        {formatTime(log.ts)}
      </Text>
      <Tag color={log.done ? 'green' : 'orange'} style={{ margin: 0 }}>
        {log.done ? '完成' : 'loading'}
      </Tag>
      <Text>{log.keyword}</Text>
    </div>
  )
}

export default function SearchCompareDemo() {
  const [mode, setMode] = useState<Mode>('防抖')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [lastRequestKeyword, setLastRequestKeyword] = useState('')
  const [lastResponseKeyword, setLastResponseKeyword] = useState('')
  const [logs, setLogs] = useState<RequestLog[]>([])

  // 请求计数用 ref 持有:自增不触发渲染,展示依赖同一次请求中的 setLogs 刷新
  const countRef = useRef(0)
  // 代际 token:切换模式时自增,用于丢弃切换前在途的过期响应
  const genRef = useRef(0)
  // 当前模式镜像到 ref,供调度回调在触发时判断是否仍属于当前模式
  const modeRef = useRef<Mode>(mode)
  modeRef.current = mode

  // 发起一次模拟请求
  const issueRequest = (keyword: string) => {
    if (!keyword) return
    const gen = genRef.current
    const id = ++countRef.current
    const ts = Date.now()
    setLastRequestKeyword(keyword)
    setLoading(true)
    // 最新在前,最多保留 MAX_LOGS 条
    setLogs((prev) => [{ id, ts, keyword, done: false }, ...prev].slice(0, MAX_LOGS))
    simulateFetch(keyword).then((res) => {
      // 模式已切换,丢弃过期响应,避免污染新模式的展示
      if (genRef.current !== gen) return
      setLastResponseKeyword(res)
      setLoading(false)
      setLogs((prev) =>
        prev.map((log) => (log.id === id ? { ...log, done: true } : log)),
      )
    })
  }

  // 三种调度策略:始终全部声明以满足 hooks 规则,触发时按 modeRef 过滤过期调用
  const handleDebounced = useDebouncedCallback((keyword: string) => {
    if (modeRef.current !== '防抖') return
    issueRequest(keyword)
  }, DEBOUNCE_WAIT)

  const handleThrottled = useThrottledCallback((keyword: string) => {
    if (modeRef.current !== '节流') return
    issueRequest(keyword)
  }, THROTTLE_INTERVAL)

  const handleInputChange = (next: string) => {
    setValue(next)
    if (mode === '无防护') {
      issueRequest(next)
    } else if (mode === '防抖') {
      handleDebounced(next)
    } else {
      handleThrottled(next)
    }
  }

  // 切换模式:清空计数与日志,自增代际,避免跨模式混淆
  const handleModeChange = (next: Mode) => {
    genRef.current += 1
    countRef.current = 0
    setMode(next)
    setValue('')
    setLastRequestKeyword('')
    setLastResponseKeyword('')
    setLoading(false)
    setLogs([])
  }

  return (
    <Card size="small">
      {/* 模式切换 */}
      <div style={{ marginBottom: 12 }}>
        <Text strong>调度策略:</Text>
        <Segmented
          style={{ marginTop: 8 }}
          value={mode}
          options={['无防护', '防抖', '节流']}
          onChange={(v) => handleModeChange(v as Mode)}
        />
      </div>

      {/* 输入框 */}
      <div style={{ marginBottom: 12 }}>
        <Input
          allowClear
          placeholder="输入关键字模拟搜索"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
        />
      </div>

      {/* 状态统计 */}
      <div
        style={{
          marginBottom: 12,
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div>
          <Text type="secondary">已发起请求:</Text>
          <Text strong style={{ marginLeft: 6 }}>
            {countRef.current}
          </Text>
        </div>
        <div>
          <Text type="secondary">最近请求:</Text>
          <Text style={{ marginLeft: 6 }}>{lastRequestKeyword || '—'}</Text>
        </div>
        <div>
          <Text type="secondary">最近响应:</Text>
          <Text style={{ marginLeft: 6 }}>{lastResponseKeyword || '—'}</Text>
        </div>
        <Tag color={loading ? 'orange' : 'green'} style={{ margin: 0 }}>
          {loading ? 'loading' : '完成'}
        </Tag>
      </div>

      {/* 请求日志 */}
      <div>
        <Text type="secondary">
          请求日志(最新在前,最多 {MAX_LOGS} 条):
        </Text>
        <div style={{ marginTop: 8 }}>
          {logs.length === 0 ? (
            <Text type="secondary">暂无请求记录</Text>
          ) : (
            logs.map((log) => <LogItem key={log.id} log={log} />)
          )}
        </div>
      </div>
    </Card>
  )
}
