import { useRef, useState } from 'react'
import { Button, Card, Segmented, Space, Tag, message } from 'antd'
import { useDebouncedCallback, useThrottledCallback } from './hooks'

// 三种模式:无防护直接提交、防抖合并提交、节流可能挤入第二次
type Mode = '无防护' | '防抖' | '节流'

// 每种模式的安全标签:防抖标绿"安全",节流标红"可能多次提交",无防护标红"危险"
const MODE_META: Record<Mode, { color: string; label: string }> = {
  无防护: { color: 'error', label: '危险' },
  防抖: { color: 'success', label: '安全' },
  节流: { color: 'error', label: '可能多次提交' },
}

// 防抖静默时长与节流间隔,统一 300ms 便于横向对比
const DEBOUNCE_WAIT = 300
const THROTTLE_INTERVAL = 300
// 辅助连点:5 次、每次间隔 50ms,模拟用户手抖连点
const RAPID_TIMES = 5
const RAPID_INTERVAL = 50

// 把毫秒时间戳格式化为 HH:mm:ss.SSS,方便观察节流 300ms 的间隔
function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

export default function SubmitButtonDemo() {
  const [mode, setMode] = useState<Mode>('防抖')
  const [count, setCount] = useState(0)
  const [timestamps, setTimestamps] = useState<number[]>([])
  // 用 ref 持有提交计数,递增生成序号,避免闭包陈旧
  const seqRef = useRef(0)

  // 真正的提交动作:递增序号、写状态、弹提示
  const submit = () => {
    seqRef.current += 1
    const seq = seqRef.current
    setCount(seq)
    // 新的在前,只保留最近 5 次
    setTimestamps((prev) => [Date.now(), ...prev].slice(0, 5))
    message.success(`已提交,序号 #${seq}`)
  }

  // 防抖/节流版本始终挂载(hooks 不能条件调用),按模式选择调用哪一个
  const debouncedSubmit = useDebouncedCallback(submit, DEBOUNCE_WAIT)
  const throttledSubmit = useThrottledCallback(submit, THROTTLE_INTERVAL)

  const handleClick = () => {
    if (mode === '无防护') submit()
    else if (mode === '防抖') debouncedSubmit()
    else throttledSubmit()
  }

  // 切换模式:清空计数与时间戳,避免跨模式串扰
  const handleModeChange = (next: Mode) => {
    seqRef.current = 0
    setCount(0)
    setTimestamps([])
    setMode(next)
  }

  // 辅助:用 setInterval 模拟用户快速连点 5 次,每次间隔 50ms
  const handleRapidClick = () => {
    let n = 0
    const timer = setInterval(() => {
      n += 1
      handleClick()
      if (n >= RAPID_TIMES) clearInterval(timer)
    }, RAPID_INTERVAL)
  }

  const meta = MODE_META[mode]

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
        <Segmented
          value={mode}
          options={['无防护', '防抖', '节流']}
          onChange={(v) => handleModeChange(v as Mode)}
        />
        <Tag color={meta.color}>{meta.label}</Tag>
      </div>

      <Space wrap>
        <Button type="primary" onClick={handleClick}>
          提交订单
        </Button>
        <Button onClick={handleRapidClick}>快速连点 {RAPID_TIMES} 次</Button>
      </Space>

      <div style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 8 }}>
          已提交次数:<strong>{count}</strong>
        </div>
        <div>
          最近 {RAPID_TIMES} 次时间戳(新的在前):
          {timestamps.length === 0 ? (
            <span style={{ marginLeft: 8, color: '#999' }}>暂无</span>
          ) : (
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {timestamps.map((ts, i) => (
                <li key={`${ts}-${i}`}>
                  #{count - i} - {formatTime(ts)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}
