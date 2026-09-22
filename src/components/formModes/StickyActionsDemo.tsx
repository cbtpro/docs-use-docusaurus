import { useEffect, useRef, useState } from 'react'
import { Button, Card, Segmented, Space, Tag } from 'antd'

type StickyState = 'hidden' | 'sticky' | 'inline'

// 操作栏始终保留文档流高度，切换状态时锚点不会随之移动。
function StickyActions({ scrollRef, children }: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<StickyState>('hidden')

  useEffect(() => {
    const root = scrollRef.current
    const sentinel = sentinelRef.current
    const actions = actionsRef.current
    if (!root || !sentinel || !actions) return
    let hasScrolled = root.scrollTop > 0
    let anchorVisible = false
    let observer: IntersectionObserver | undefined
    const update = () => setState(anchorVisible ? 'inline' : hasScrolled ? 'sticky' : 'hidden')
    const measure = () => {
      const rootRect = root.getBoundingClientRect()
      const anchorRect = sentinel.getBoundingClientRect()
      const top = rootRect.top + root.clientTop
      anchorVisible = anchorRect.top >= top - 1 &&
        anchorRect.bottom + actions.getBoundingClientRect().height <= top + root.clientHeight + 1
      update()
    }
    const observe = () => {
      observer?.disconnect()
      measure()
      if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver(() => {
          measure()
        }, { root, threshold: 1, rootMargin: `0px 0px -${actions.offsetHeight}px 0px` })
        observer.observe(sentinel)
      }
    }
    const onScroll = () => {
      hasScrolled = true
      measure()
    }
    observe()
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(observe)
    resize?.observe(root)
    resize?.observe(actions)
    root.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', observe)
    return () => {
      observer?.disconnect()
      resize?.disconnect()
      root.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', observe)
    }
  }, [scrollRef])

  return (
    <>
      <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
      <div
        ref={actionsRef}
        data-sticky-state={state}
        style={{
          position: state === 'sticky' ? 'sticky' : 'relative',
          bottom: 0,
          visibility: state === 'hidden' ? 'hidden' : 'visible',
          padding: '12px 0',
          background: 'var(--ifm-background-surface-color)',
          borderTop: '1px solid var(--ifm-color-emphasis-200)',
          textAlign: 'right',
          zIndex: 1,
        }}
      >
        <Tag color={state === 'inline' ? 'green' : 'orange'}>
          {state === 'inline' ? 'inline（恢复原位）' : 'sticky（吸底）'}
        </Tag>
        <div style={{ marginTop: 8 }}>{children}</div>
      </div>
    </>
  )
}

export default function StickyActionsDemo() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timerRef.current !== null) clearTimeout(timerRef.current) }, [])
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<'create' | 'edit'>('create')

  const handleSubmit = () => {
    setSubmitting(true)
    timerRef.current = setTimeout(() => {
      setSubmitting(false)
      // eslint-disable-next-line no-alert
      window.alert(`${mode === 'create' ? '提交' : '保存'}成功(模拟)`)
    }, 800)
  }

  // 监听 scrollRef 滚动距离,用于显示「hidden/sticky」状态提示
  const [scrollTop, setScrollTop] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <Card size="small">
      <div style={{ marginBottom: 12 }}>
        <Space>
          <span>模式:</span>
          <Segmented
            disabled={submitting}
            value={mode}
            options={[
              { label: '新建', value: 'create' },
              { label: '编辑', value: 'edit' },
            ]}
            onChange={(v) => setMode(v as 'create' | 'edit')}
          />
          <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
            scrollTop = {scrollTop}px(往下滚观察按钮吸底 → 滚到底部恢复)
          </span>
        </Space>
      </div>

      {/* 模拟可滚动的内容区,固定高度 + overflow auto */}
      <div
        ref={scrollRef}
        style={{
          height: 280,
          overflow: 'auto',
          border: '1px solid #f0f0f0',
          borderRadius: 6,
          padding: '0 16px',
        }}
      >
        <div style={{ padding: '16px 0', color: 'rgba(0,0,0,0.65)' }}>
          <p>这里是表单字段区,假设填了 30 个字段,内容很长。</p>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              style={{
                height: 48,
                marginBottom: 8,
                background: '#fafafa',
                borderRadius: 4,
                padding: '12px',
                color: 'rgba(0,0,0,0.45)',
              }}
            >
              字段 {i}:占位内容(模拟长表单)
            </div>
          ))}
        </div>

        <StickyActions scrollRef={scrollRef}>
          <Space size="middle">
            <Button onClick={() => window.alert('已重置(模拟)')}>重置</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              {mode === 'create' ? '提交创建' : '保存修改'}
            </Button>
          </Space>
        </StickyActions>
      </div>
    </Card>
  )
}
