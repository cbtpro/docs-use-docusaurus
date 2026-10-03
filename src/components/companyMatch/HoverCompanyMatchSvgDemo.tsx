import React, {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import styles from './HoverCompanyMatchSvgDemo.module.css'

type Point = { x: number; y: number }

type Connector = {
  sourceId: string
  resultId: string
}

const CONNECTORS: Connector[] = [
  { sourceId: 'source-full-name', resultId: 'company-alibaba' },
  { sourceId: 'source-alias', resultId: 'company-alibaba' },
  { sourceId: 'source-tencent', resultId: 'company-tencent' },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

type DraggablePanelProps = {
  children?: React.ReactNode
  label: string
  panelRef: RefObject<HTMLDivElement | null>
  position: Point
  setPosition: React.Dispatch<React.SetStateAction<Point>>
  workspaceRef: RefObject<HTMLDivElement | null>
}

function DraggablePanel({
  children,
  label,
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
  const pointerRef = useRef<Point | null>(null)
  const frameRef = useRef<number | null>(null)

  const commitPosition = useCallback(() => {
    frameRef.current = null
    const drag = dragRef.current
    const pointer = pointerRef.current
    const workspace = workspaceRef.current
    const panel = panelRef.current
    if (!drag || !pointer || !workspace || !panel) return

    setPosition({
      x: clamp(
        drag.origin.x + pointer.x - drag.startX,
        8,
        workspace.clientWidth - panel.offsetWidth - 8,
      ),
      y: clamp(
        drag.origin.y + pointer.y - drag.startY,
        52,
        workspace.clientHeight - panel.offsetHeight - 8,
      ),
    })
  }, [panelRef, setPosition, workspaceRef])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: position,
    }
    pointerRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    pointerRef.current = { x: event.clientX, y: event.clientY }
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(commitPosition)
    }
  }

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    pointerRef.current = { x: event.clientX, y: event.clientY }
    commitPosition()
    dragRef.current = null
    pointerRef.current = null
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
      className={styles.panel}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      <div
        aria-label={label}
        className={styles.dragHandle}
        onPointerCancel={finishDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        role="button"
        tabIndex={0}
      >
        <span>{label}</span>
        <span className={styles.dragHint}>拖动</span>
      </div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  )
}

export default function HoverCompanyMatchSvgDemo() {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const sourcePanelRef = useRef<HTMLDivElement>(null)
  const resultPanelRef = useRef<HTMLDivElement>(null)
  const sourceItemRefs = useRef(new Map<string, HTMLDivElement>())
  const resultItemRefs = useRef(new Map<string, HTMLDivElement>())
  const pathRefs = useRef(new Map<string, SVGPathElement>())
  const measureFrameRef = useRef<number | null>(null)
  const initializedRef = useRef(false)
  const markerId = `hover-company-match-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [sourcePosition, setSourcePosition] = useState<Point>({ x: 16, y: 72 })
  const [resultPosition, setResultPosition] = useState<Point>({ x: 340, y: 126 })
  const [activeSourceIds, setActiveSourceIds] = useState<string[]>([])

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
      const sourceIsLeft = sourceRect.left + sourceRect.width / 2
        <= resultRect.left + resultRect.width / 2
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

  const scheduleMeasure = useCallback(() => {
    if (measureFrameRef.current !== null) return
    measureFrameRef.current = requestAnimationFrame(measureConnectors)
  }, [measureConnectors])

  useLayoutEffect(() => {
    scheduleMeasure()
  }, [resultPosition, scheduleMeasure, sourcePosition])

  useEffect(() => {
    const workspace = workspaceRef.current
    const sourcePanel = sourcePanelRef.current
    const resultPanel = resultPanelRef.current
    if (!workspace || !sourcePanel || !resultPanel) return

    const keepPanelsInsideWorkspace = () => {
      setSourcePosition((current) => ({
        x: clamp(current.x, 8, workspace.clientWidth - sourcePanel.offsetWidth - 8),
        y: clamp(current.y, 52, workspace.clientHeight - sourcePanel.offsetHeight - 8),
      }))
      setResultPosition((current) => {
        const candidate = initializedRef.current
          ? current
          : {
              x: Math.max(8, workspace.clientWidth - resultPanel.offsetWidth - 18),
              y: workspace.clientWidth < 500 ? 286 : current.y,
            }
        initializedRef.current = true
        return {
          x: clamp(candidate.x, 8, workspace.clientWidth - resultPanel.offsetWidth - 8),
          y: clamp(candidate.y, 52, workspace.clientHeight - resultPanel.offsetHeight - 8),
        }
      })
      scheduleMeasure()
    }

    const observer = new ResizeObserver(() => {
      keepPanelsInsideWorkspace()
      scheduleMeasure()
    })
    observer.observe(workspace)
    observer.observe(sourcePanel)
    observer.observe(resultPanel)
    sourceItemRefs.current.forEach((element) => observer.observe(element))
    resultItemRefs.current.forEach((element) => observer.observe(element))
    keepPanelsInsideWorkspace()

    return () => observer.disconnect()
  }, [scheduleMeasure])

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

  const showResultConnections = (resultId: string) => {
    setActiveSourceIds(
      CONNECTORS
        .filter((connector) => connector.resultId === resultId)
        .map((connector) => connector.sourceId),
    )
  }

  const isResultActive = (resultId: string) => CONNECTORS.some(
    (connector) => connector.resultId === resultId
      && activeSourceIds.includes(connector.sourceId),
  )

  return (
    <div ref={workspaceRef} className={styles.workspace}>
      <div className={styles.workspaceTitle}>
        Hover 联动：默认隐藏连线，悬停后显示蚂蚁线
      </div>
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
            className={`${styles.connectorPath} ${
              activeSourceIds.includes(connector.sourceId)
                ? styles.connectorPathVisible
                : ''
            }`}
            markerEnd={`url(#${markerId})`}
          />
        ))}
      </svg>

      <DraggablePanel
        label="原始输入"
        panelRef={sourcePanelRef}
        position={sourcePosition}
        setPosition={setSourcePosition}
        workspaceRef={workspaceRef}
      >
        <div
          ref={registerSource('source-full-name')}
          className={`${styles.item} ${activeSourceIds.includes('source-full-name') ? styles.activeItem : ''}`}
          data-hover-source-id="source-full-name"
          onMouseEnter={() => setActiveSourceIds(['source-full-name'])}
          onMouseLeave={() => setActiveSourceIds([])}
        >
          阿里巴巴（中国）有限公司
        </div>
        <div
          ref={registerSource('source-alias')}
          className={`${styles.item} ${activeSourceIds.includes('source-alias') ? styles.activeItem : ''}`}
          data-hover-source-id="source-alias"
          onMouseEnter={() => setActiveSourceIds(['source-alias'])}
          onMouseLeave={() => setActiveSourceIds([])}
        >
          阿里巴巴
        </div>
        <div
          ref={registerSource('source-tencent')}
          className={`${styles.item} ${activeSourceIds.includes('source-tencent') ? styles.activeItem : ''}`}
          data-hover-source-id="source-tencent"
          onMouseEnter={() => setActiveSourceIds(['source-tencent'])}
          onMouseLeave={() => setActiveSourceIds([])}
        >
          腾讯控股
        </div>
      </DraggablePanel>

      <DraggablePanel
        label="匹配结果"
        panelRef={resultPanelRef}
        position={resultPosition}
        setPosition={setResultPosition}
        workspaceRef={workspaceRef}
      >
        <div
          ref={registerResult('company-alibaba')}
          className={`${styles.item} ${isResultActive('company-alibaba') ? styles.activeItem : ''}`}
          data-hover-result-id="company-alibaba"
          onMouseEnter={() => showResultConnections('company-alibaba')}
          onMouseLeave={() => setActiveSourceIds([])}
        >
          <strong>阿里巴巴集团</strong>
          <small>命中 2 条输入</small>
        </div>
        <div
          ref={registerResult('company-tencent')}
          className={`${styles.item} ${isResultActive('company-tencent') ? styles.activeItem : ''}`}
          data-hover-result-id="company-tencent"
          onMouseEnter={() => showResultConnections('company-tencent')}
          onMouseLeave={() => setActiveSourceIds([])}
        >
          <strong>腾讯控股有限公司</strong>
          <small>简称匹配</small>
        </div>
      </DraggablePanel>
    </div>
  )
}
