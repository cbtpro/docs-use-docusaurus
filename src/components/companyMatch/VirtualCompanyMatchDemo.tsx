import React, {
  forwardRef,
  type ReactNode,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import styles from './VirtualCompanyMatchDemo.module.css'

const ROW_HEIGHT = 52
const VIEWPORT_HEIGHT = 272
const OVERSCAN = 3

type SourceItem = {
  id: string
  name: string
}

type ResultItem = {
  id: string
  name: string
  sourceIds: string[]
}

type VirtualListHandle = {
  getVisibleCenterIndex: () => number
  scrollToIndex: (index: number) => void
}

type VirtualListProps<T> = {
  ariaLabel: string
  items: T[]
  itemKey: (item: T) => string
  onItemsRendered: () => void
  renderItem: (item: T, index: number) => ReactNode
}

const VirtualList = forwardRef(function VirtualList<T>(
  {
    ariaLabel,
    items,
    itemKey,
    onItemsRendered,
    renderItem,
  }: VirtualListProps<T>,
  ref: React.ForwardedRef<VirtualListHandle>,
) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT)
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(
    items.length,
    startIndex + visibleCount + OVERSCAN * 2,
  )
  const visibleItems = items.slice(startIndex, endIndex)

  useImperativeHandle(ref, () => ({
    getVisibleCenterIndex() {
      const currentScrollTop = viewportRef.current?.scrollTop ?? scrollTop
      return currentScrollTop / ROW_HEIGHT + visibleCount / 2
    },
    scrollToIndex(index) {
      const viewport = viewportRef.current
      if (!viewport || index < 0 || index >= items.length) return

      const centeredOffset = index * ROW_HEIGHT
        - (VIEWPORT_HEIGHT - ROW_HEIGHT) / 2
      const maxOffset = Math.max(0, items.length * ROW_HEIGHT - VIEWPORT_HEIGHT)
      const nextScrollTop = Math.min(Math.max(centeredOffset, 0), maxOffset)
      viewport.scrollTop = nextScrollTop
      setScrollTop(nextScrollTop)
    },
  }), [items.length, scrollTop, visibleCount])

  useLayoutEffect(() => {
    onItemsRendered()
  }, [endIndex, onItemsRendered, startIndex])

  return (
    <div
      aria-label={ariaLabel}
      className={styles.viewport}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      ref={viewportRef}
      role="list"
      style={{ height: VIEWPORT_HEIGHT }}
    >
      <div
        className={styles.spacer}
        style={{ height: items.length * ROW_HEIGHT }}
      >
        <div
          className={styles.window}
          style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}
        >
          {visibleItems.map((item, visibleIndex) => {
            const index = startIndex + visibleIndex
            return (
              <React.Fragment key={itemKey(item)}>
                {renderItem(item, index)}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}) as <T>(
  props: VirtualListProps<T> & React.RefAttributes<VirtualListHandle>,
) => React.ReactElement

type PendingTarget = {
  direction: 'forward' | 'reverse'
  resultId: string
  resultWasMounted: boolean
  relatedSourceCount: number
  sourceId: string
  sourceWasMounted: boolean
}

export default function VirtualCompanyMatchDemo() {
  const sources = useMemo<SourceItem[]>(() => (
    Array.from({ length: 1000 }, (_, index) => ({
      id: `source-${index}`,
      name: `导入企业 ${String(index + 1).padStart(4, '0')}`,
    }))
  ), [])
  const results = useMemo<ResultItem[]>(() => (
    Array.from({ length: 500 }, (_, index) => ({
      id: `company-${index}`,
      name: `标准企业 ${String(index + 1).padStart(3, '0')}`,
      sourceIds: [`source-${index * 2}`, `source-${index * 2 + 1}`],
    }))
  ), [])
  const sourceIndexById = useMemo(
    () => new Map(sources.map((source, index) => [source.id, index])),
    [sources],
  )
  const resultIndexBySourceId = useMemo(() => {
    const map = new Map<string, number>()
    results.forEach((result, resultIndex) => {
      result.sourceIds.forEach((sourceId) => map.set(sourceId, resultIndex))
    })
    return map
  }, [results])
  const resultIndexById = useMemo(
    () => new Map(results.map((result, index) => [result.id, index])),
    [results],
  )

  const sourceListRef = useRef<VirtualListHandle>(null)
  const resultListRef = useRef<VirtualListHandle>(null)
  const sourceItemRefs = useRef(new Map<string, HTMLDivElement>())
  const resultItemRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingTargetRef = useRef<PendingTarget | null>(null)
  const [targetId, setTargetId] = useState('source-780')
  const [targetResultId, setTargetResultId] = useState('company-390')
  const [activeSourceIds, setActiveSourceIds] = useState<string[]>([])
  const [activeResultId, setActiveResultId] = useState<string | null>(null)
  const [status, setStatus] = useState(
    'source-780 当前不在 DOM 中，点击定位后再检查。',
  )

  const verifyPendingTarget = () => {
    const pending = pendingTargetRef.current
    if (!pending) return

    const sourceElement = sourceItemRefs.current.get(pending.sourceId)
    const resultElement = resultItemRefs.current.get(pending.resultId)
    if (!sourceElement || !resultElement) return

    pendingTargetRef.current = null
    sourceElement.focus({ preventScroll: true })
    const beforeStatus = `滚动前：来源${pending.sourceWasMounted ? '已' : '未'}渲染、结果${pending.resultWasMounted ? '已' : '未'}渲染`
    setStatus(pending.direction === 'forward'
      ? `${beforeStatus}；滚动后：两个节点都已挂载，可从 ref Map 取得。`
      : `反向定位完成：结果关联 ${pending.relatedSourceCount} 条来源，选择了离当前视口最近的 ${pending.sourceId}；${beforeStatus}，滚动后两个节点都已挂载。`)
  }

  const locateSource = (rawSourceId: string) => {
    const sourceId = rawSourceId.trim()
    const sourceIndex = sourceIndexById.get(sourceId)
    const resultIndex = resultIndexBySourceId.get(sourceId)
    if (sourceIndex === undefined || resultIndex === undefined) {
      setStatus(`没有找到 ${sourceId || '空 ID'}，请输入 source-0 至 source-999。`)
      return
    }

    const result = results[resultIndex]
    pendingTargetRef.current = {
      direction: 'forward',
      sourceId,
      resultId: result.id,
      relatedSourceCount: result.sourceIds.length,
      sourceWasMounted: sourceItemRefs.current.has(sourceId),
      resultWasMounted: resultItemRefs.current.has(result.id),
    }
    setActiveSourceIds([sourceId])
    setActiveResultId(result.id)
    setStatus(`已在数据中找到 ${sourceId}，正在滚动到索引 ${sourceIndex}。`)
    sourceListRef.current?.scrollToIndex(sourceIndex)
    resultListRef.current?.scrollToIndex(resultIndex)
  }

  const locateResult = (rawResultId: string) => {
    const resultId = rawResultId.trim()
    const resultIndex = resultIndexById.get(resultId)
    if (resultIndex === undefined) {
      setStatus(`没有找到 ${resultId || '空 ID'}，请输入 company-0 至 company-499。`)
      return
    }

    const result = results[resultIndex]
    const currentCenter = sourceListRef.current?.getVisibleCenterIndex() ?? 0
    const sourceId = result.sourceIds.reduce((nearestId, candidateId) => {
      const nearestIndex = sourceIndexById.get(nearestId) ?? 0
      const candidateIndex = sourceIndexById.get(candidateId) ?? 0
      return Math.abs(candidateIndex - currentCenter)
        < Math.abs(nearestIndex - currentCenter)
        ? candidateId
        : nearestId
    })
    const sourceIndex = sourceIndexById.get(sourceId)
    if (sourceIndex === undefined) return

    pendingTargetRef.current = {
      direction: 'reverse',
      sourceId,
      resultId,
      relatedSourceCount: result.sourceIds.length,
      sourceWasMounted: sourceItemRefs.current.has(sourceId),
      resultWasMounted: resultItemRefs.current.has(resultId),
    }
    setActiveSourceIds(result.sourceIds)
    setActiveResultId(resultId)
    setStatus(
      `已找到 ${resultId} 的 ${result.sourceIds.length} 条来源，正在定位最接近当前视口的 ${sourceId}。`,
    )
    resultListRef.current?.scrollToIndex(resultIndex)
    sourceListRef.current?.scrollToIndex(sourceIndex)
  }

  return (
    <section className={styles.demo}>
      <div className={styles.toolbar}>
        <label className={styles.label}>
          来源 ID
          <input
            aria-label="要定位的来源 ID"
            className={styles.input}
            onChange={(event) => setTargetId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') locateSource(targetId)
            }}
            value={targetId}
          />
        </label>
        <button
          className={styles.button}
          onClick={() => locateSource(targetId)}
          type="button"
        >
          定位来源及匹配结果
        </button>
        <button
          className={styles.secondaryButton}
          onClick={() => {
            setTargetId('source-997')
            locateSource('source-997')
          }}
          type="button"
        >
          试试末尾记录
        </button>
        <label className={styles.label}>
          结果 ID
          <input
            aria-label="要反向定位的结果 ID"
            className={styles.input}
            onChange={(event) => setTargetResultId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') locateResult(targetResultId)
            }}
            value={targetResultId}
          />
        </label>
        <button
          className={styles.button}
          onClick={() => locateResult(targetResultId)}
          type="button"
        >
          反向定位关联来源
        </button>
      </div>

      <p aria-live="polite" className={styles.status} data-virtual-status>
        {status}
      </p>

      <div className={styles.columns}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <strong>原始输入</strong>
            <span>1000 条，当前窗口最多挂载 12 行</span>
          </div>
          <VirtualList
            ariaLabel="原始输入虚拟列表"
            itemKey={(source) => source.id}
            items={sources}
            onItemsRendered={verifyPendingTarget}
            ref={sourceListRef}
            renderItem={(source, index) => (
              <div
                className={`${styles.row} ${activeSourceIds.includes(source.id) ? styles.activeRow : ''}`}
                data-virtual-source-id={source.id}
                onClick={() => {
                  setTargetId(source.id)
                  locateSource(source.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setTargetId(source.id)
                    locateSource(source.id)
                  }
                }}
                ref={(element) => {
                  if (element) sourceItemRefs.current.set(source.id, element)
                  else sourceItemRefs.current.delete(source.id)
                }}
                role="listitem"
                tabIndex={-1}
              >
                <span>{source.name}</span>
                <small>{source.id} · 数据索引 {index}</small>
              </div>
            )}
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <strong>去重结果</strong>
            <span>500 条，当前窗口最多挂载 12 行</span>
          </div>
          <VirtualList
            ariaLabel="匹配结果虚拟列表"
            itemKey={(result) => result.id}
            items={results}
            onItemsRendered={verifyPendingTarget}
            ref={resultListRef}
            renderItem={(result, index) => (
              <div
                className={`${styles.row} ${activeResultId === result.id ? styles.activeRow : ''}`}
                data-virtual-result-id={result.id}
                onClick={() => {
                  setTargetResultId(result.id)
                  locateResult(result.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setTargetResultId(result.id)
                    locateResult(result.id)
                  }
                }}
                ref={(element) => {
                  if (element) resultItemRefs.current.set(result.id, element)
                  else resultItemRefs.current.delete(result.id)
                }}
                role="listitem"
                tabIndex={0}
              >
                <span>{result.name}</span>
                <small>{result.sourceIds.join('、')} · 数据索引 {index}</small>
              </div>
            )}
          />
        </section>
      </div>
    </section>
  )
}
