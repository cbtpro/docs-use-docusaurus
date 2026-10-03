import React, {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import styles from './CompanyMatchSvgDemo.module.css'

type Point = { x: number; y: number }

type Connector = {
  sourceId: string
  resultId: string
}

type DraggablePanelProps = {
  ariaLabel: string
  children?: React.ReactNode
  className: string
  panelRef: RefObject<HTMLDivElement | null>
  position: Point
  setPosition: React.Dispatch<React.SetStateAction<Point>>
  workspaceRef: RefObject<HTMLDivElement | null>
}

const CONNECTORS: Connector[] = [
  { sourceId: 'source-full-name', resultId: 'company-alibaba' },
  { sourceId: 'source-alias', resultId: 'company-alibaba' },
  { sourceId: 'source-tencent', resultId: 'company-tencent' },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function DraggablePanel({
  ariaLabel,
  children,
  className,
  panelRef,
  position,
  setPosition,
  workspaceRef,
}: DraggablePanelProps) {
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origin: Point
  } | null>(null)
  const latestPointerRef = useRef<Point | null>(null)
  const frameRef = useRef<number | null>(null)

  const commitPointerPosition = useCallback(() => {
    frameRef.current = null
    const drag = dragRef.current
    const pointer = latestPointerRef.current
    const workspace = workspaceRef.current
    const panel = panelRef.current
    if (!drag || !pointer || !workspace || !panel) return

    const nextX = drag.origin.x + pointer.x - drag.startX
    const nextY = drag.origin.y + pointer.y - drag.startY
    setPosition({
      x: clamp(nextX, 8, workspace.clientWidth - panel.offsetWidth - 8),
      y: clamp(nextY, 52, workspace.clientHeight - panel.offsetHeight - 8),
    })
  }, [panelRef, setPosition, workspaceRef])

  const schedulePointerPosition = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(commitPointerPosition)
  }, [commitPointerPosition])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
    }
    latestPointerRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    latestPointerRef.current = { x: event.clientX, y: event.clientY }
    schedulePointerPosition()
  }

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    latestPointerRef.current = { x: event.clientX, y: event.clientY }
    commitPointerPosition()
    dragRef.current = null
    latestPointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
  }, [])

  return (
    <section
      ref={panelRef}
      className={`${styles.panel} ${className}`}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      <div
        aria-label={ariaLabel}
        className={styles.dragHandle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        role="button"
        tabIndex={0}
      >
        <span>{ariaLabel}</span>
        <span className={styles.dragHint}>拖动</span>
      </div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  )
}

type CompanyMatchSvgInstanceProps = {
  accent?: 'blue' | 'violet'
  title: string
}

function CompanyMatchSvgInstance({
  accent = 'blue',
  title,
}: CompanyMatchSvgInstanceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const sourcePanelRef = useRef<HTMLDivElement>(null)
  const resultPanelRef = useRef<HTMLDivElement>(null)
  const sourceItemRefs = useRef(new Map<string, HTMLDivElement>())
  const resultItemRefs = useRef(new Map<string, HTMLDivElement>())
  const pathRefs = useRef(new Map<string, SVGPathElement>())
  const measureFrameRef = useRef<number | null>(null)
  const initializedRef = useRef(false)
  const markerId = `company-match-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [sourcePosition, setSourcePosition] = useState<Point>({ x: 16, y: 72 })
  const [resultPosition, setResultPosition] = useState<Point>({ x: 340, y: 126 })

  const measureConnectors = useCallback(() => {
    measureFrameRef.current = null
    const workspace = workspaceRef.current
    if (!workspace) return
    const workspaceRect = workspace.getBoundingClientRect()

    for (const connector of CONNECTORS) {
      const source = sourceItemRefs.current.get(connector.sourceId)
      const result = resultItemRefs.current.get(connector.resultId)
      const path = pathRefs.current.get(connector.sourceId)
      if (!source || !result || !path) continue

      const sourceRect = source.getBoundingClientRect()
      const resultRect = result.getBoundingClientRect()
      const sourceCenterX = sourceRect.left + sourceRect.width / 2
      const resultCenterX = resultRect.left + resultRect.width / 2
      const sourceIsLeft = sourceCenterX <= resultCenterX
      const x1 = (sourceIsLeft ? sourceRect.right : sourceRect.left) - workspaceRect.left
      const y1 = sourceRect.top + sourceRect.height / 2 - workspaceRect.top
      const x2 = (sourceIsLeft ? resultRect.left : resultRect.right) - workspaceRect.left
      const y2 = resultRect.top + resultRect.height / 2 - workspaceRect.top
      const curve = Math.max(36, Math.abs(x2 - x1) * 0.5)
      const direction = sourceIsLeft ? 1 : -1
      path.setAttribute(
        'd',
        `M ${x1} ${y1} C ${x1 + curve * direction} ${y1}, ${x2 - curve * direction} ${y2}, ${x2} ${y2}`,
      )
    }
  }, [])

  const scheduleConnectorMeasure = useCallback(() => {
    if (measureFrameRef.current !== null) return
    measureFrameRef.current = requestAnimationFrame(measureConnectors)
  }, [measureConnectors])

  useLayoutEffect(() => {
    scheduleConnectorMeasure()
  }, [resultPosition, scheduleConnectorMeasure, sourcePosition])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return

    const keepPanelsInsideWorkspace = () => {
      const sourcePanel = sourcePanelRef.current
      const resultPanel = resultPanelRef.current
      if (!sourcePanel || !resultPanel) return

      setSourcePosition((current) => ({
        x: clamp(current.x, 8, workspace.clientWidth - sourcePanel.offsetWidth - 8),
        y: clamp(current.y, 52, workspace.clientHeight - sourcePanel.offsetHeight - 8),
      }))
      setResultPosition((current) => {
        const initialX = Math.max(8, workspace.clientWidth - resultPanel.offsetWidth - 18)
        const candidate = initializedRef.current
          ? current
          : {
              x: initialX,
              y: workspace.clientWidth < 500 ? 286 : current.y,
            }
        initializedRef.current = true
        return {
          x: clamp(candidate.x, 8, workspace.clientWidth - resultPanel.offsetWidth - 8),
          y: clamp(candidate.y, 52, workspace.clientHeight - resultPanel.offsetHeight - 8),
        }
      })
      scheduleConnectorMeasure()
    }

    const observer = new ResizeObserver(() => {
      keepPanelsInsideWorkspace()
      scheduleConnectorMeasure()
    })
    observer.observe(workspace)
    if (sourcePanelRef.current) observer.observe(sourcePanelRef.current)
    if (resultPanelRef.current) observer.observe(resultPanelRef.current)
    sourceItemRefs.current.forEach((element) => observer.observe(element))
    resultItemRefs.current.forEach((element) => observer.observe(element))
    keepPanelsInsideWorkspace()

    return () => observer.disconnect()
  }, [scheduleConnectorMeasure])

  useEffect(() => () => {
    if (measureFrameRef.current !== null) {
      cancelAnimationFrame(measureFrameRef.current)
    }
  }, [])

  const registerSource = (sourceId: string) => (element: HTMLDivElement | null) => {
    if (element) sourceItemRefs.current.set(sourceId, element)
    else sourceItemRefs.current.delete(sourceId)
  }

  const registerResult = (resultId: string) => (element: HTMLDivElement | null) => {
    if (element) resultItemRefs.current.set(resultId, element)
    else resultItemRefs.current.delete(resultId)
  }

  const registerPath = (sourceId: string) => (element: SVGPathElement | null) => {
    if (element) pathRefs.current.set(sourceId, element)
    else pathRefs.current.delete(sourceId)
  }

  const workspaceStyle = {
    '--company-match-accent': accent === 'violet' ? '#7c3aed' : '#2563eb',
  } as CSSProperties

  return (
    <div
      ref={workspaceRef}
      className={styles.workspace}
      style={workspaceStyle}
    >
      <div className={styles.workspaceTitle}>{title}</div>
      <svg className={styles.connectorLayer} aria-hidden="true">
        <defs>
          <marker
            id={markerId}
            markerHeight="6"
            markerWidth="6"
            orient="auto"
            refX="5"
            refY="3"
          >
            <path d="M 0 0 L 6 3 L 0 6 z" className={styles.arrowHead} />
          </marker>
        </defs>
        {CONNECTORS.map((connector) => (
          <path
            key={connector.sourceId}
            ref={registerPath(connector.sourceId)}
            className={styles.connectorPath}
            markerEnd={`url(#${markerId})`}
          />
        ))}
      </svg>

      <DraggablePanel
        ariaLabel="原始输入"
        className={styles.sourcePanel}
        panelRef={sourcePanelRef}
        position={sourcePosition}
        setPosition={setSourcePosition}
        workspaceRef={workspaceRef}
      >
        <div ref={registerSource('source-full-name')} className={styles.item}>
          阿里巴巴（中国）有限公司
        </div>
        <div ref={registerSource('source-alias')} className={styles.item}>
          阿里巴巴
        </div>
        <div ref={registerSource('source-tencent')} className={styles.item}>
          腾讯控股
        </div>
      </DraggablePanel>

      <DraggablePanel
        ariaLabel="匹配结果"
        className={styles.resultPanel}
        panelRef={resultPanelRef}
        position={resultPosition}
        setPosition={setResultPosition}
        workspaceRef={workspaceRef}
      >
        <div ref={registerResult('company-alibaba')} className={styles.item}>
          <strong>阿里巴巴集团</strong>
          <small>命中 2 条输入</small>
        </div>
        <div ref={registerResult('company-tencent')} className={styles.item}>
          <strong>腾讯控股有限公司</strong>
          <small>简称匹配</small>
        </div>
      </DraggablePanel>
    </div>
  )
}

export function SingleCompanyMatchSvgDemo() {
  return (
    <CompanyMatchSvgInstance
      title="单实例：拖动左右面板观察连线"
    />
  )
}

export function MultipleCompanyMatchSvgDemo() {
  return (
    <div className={styles.multipleGrid}>
      <CompanyMatchSvgInstance
        title="实例 A：独立测量与绘制"
      />
      <CompanyMatchSvgInstance
        accent="violet"
        title="实例 B：不会与 A 串线"
      />
    </div>
  )
}
