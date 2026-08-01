import { useRef, useEffect, useState, useCallback, useMemo } from 'react';

interface CanvasVirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  renderItem: (item: T, index: number) => {
    name: string;
    role: string;
  };
}

// 浏览器对 scrollHeight 有最大限制，Canvas 渲染不依赖 DOM 元素高度
// 但仍需要一个撑开滚动条的 DOM 容器，所以大数据量时仍用自定义滚动
const MAX_SCROLL_HEIGHT = 10_000_000;

export default function CanvasVirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
}: CanvasVirtualListProps<T>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);
  const rafIdRef = useRef(0);

  const [scrollPosition, setScrollPosition] = useState(0);
  // DPR 用于高分屏适配，1 表示普通屏幕，2+ 表示 Retina 等
  const [dpr, setDpr] = useState(1);

  const totalHeight = useMemo(
    () => items.length * itemHeight,
    [items.length, itemHeight],
  );

  const needsScaling = totalHeight > MAX_SCROLL_HEIGHT;
  const maxScrollPosition = Math.max(0, totalHeight - height);

  // 检测设备像素比，用于 Canvas 高分屏适配
  useEffect(() => {
    setDpr(window.devicePixelRatio || 1);
  }, []);

  // rAF 节流
  const rafScroll = useCallback((newPos: number) => {
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        setScrollPosition(newPos);
        rafIdRef.current = 0;
      });
    }
  }, []);

  // ---- 自定义滚动（needsScaling 时）----
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      rafScroll(
        Math.max(0, Math.min(maxScrollPosition, scrollPosition + e.deltaY)),
      );
    },
    [scrollPosition, maxScrollPosition, rafScroll],
  );

  const handleThumbMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { startY: e.clientY, startScroll: scrollPosition };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current || !trackRef.current) return;
        const trackHeight = trackRef.current.clientHeight;
        const thumbSize = Math.max(16, (height / totalHeight) * height);
        const delta = ev.clientY - dragRef.current.startY;
        const scrollDelta =
          (delta / (trackHeight - thumbSize)) * maxScrollPosition;
        rafScroll(
          Math.max(
            0,
            Math.min(
              maxScrollPosition,
              dragRef.current.startScroll + scrollDelta,
            ),
          ),
        );
      };

      const handleMouseUp = () => {
        dragRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [scrollPosition, height, totalHeight, maxScrollPosition, rafScroll],
  );

  const handleTrackMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const thumbSize = Math.max(16, (height / totalHeight) * height);
      const thumbPos =
        (scrollPosition / maxScrollPosition) * (height - thumbSize);
      const direction = clickY < thumbPos ? -1 : 1;
      rafScroll(
        Math.max(
          0,
          Math.min(maxScrollPosition, scrollPosition + direction * height * 0.8),
        ),
      );
    },
    [scrollPosition, height, totalHeight, maxScrollPosition, rafScroll],
  );

  // ---- 原生滚动（非 needsScaling）----
  const handleNativeScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    rafScroll(node.scrollTop);
  }, [rafScroll]);

  useEffect(() => {
    if (needsScaling) return;
    const node = containerRef.current;
    if (!node) return;
    node.addEventListener('scroll', handleNativeScroll, { passive: true });

    // 阻止滚动穿透：滚到顶/底时 preventDefault wheel 事件
    const preventScrollPropagation = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = node;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight;
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        e.preventDefault();
      }
    };
    node.addEventListener('wheel', preventScrollPropagation, { passive: false });

    return () => {
      node.removeEventListener('scroll', handleNativeScroll);
      node.removeEventListener('wheel', preventScrollPropagation);
    };
  }, [needsScaling, handleNativeScroll]);

  // 数据量切换时重置滚动位置
  useEffect(() => {
    setScrollPosition(0);
    rafIdRef.current = 0;
    if (!needsScaling) {
      containerRef.current?.scrollTo(0, 0);
    }
  }, [items.length, needsScaling]);

  // Canvas 绘制：每次 scrollPosition 或数据变化时重绘
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 高分屏适配：Canvas 实际像素 = CSS 像素 × DPR
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 清空画布
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // 计算可视范围
    const overscan = 5;
    const startIndex = Math.max(
      0,
      Math.floor(scrollPosition / itemHeight) - overscan,
    );
    const visibleCount = Math.ceil(cssHeight / itemHeight) + overscan * 2;
    const endIndex = Math.min(items.length - 1, startIndex + visibleCount);

    // 逐行绘制
    for (let i = startIndex; i <= endIndex; i++) {
      const item = items[i];
      if (!item) continue;

      // y 坐标 = 行索引 × 行高 - 滚动位置，始终在视口范围内
      const y = i * itemHeight - scrollPosition;
      const rendered = renderItem(item, i);

      // 斑马纹背景
      if (i % 2 === 0) {
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, y, cssWidth, itemHeight);
      }

      // 底部分割线
      ctx.strokeStyle = '#f0f0f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + itemHeight - 0.5);
      ctx.lineTo(cssWidth, y + itemHeight - 0.5);
      ctx.stroke();

      // 名称
      ctx.fillStyle = '#1f2937';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(rendered.name, 12, y + itemHeight / 2);

      // 角色
      ctx.fillStyle = '#6b7280';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const roleText = rendered.role;
      const roleMetrics = ctx.measureText(roleText);
      ctx.fillText(roleText, cssWidth - roleMetrics.width - 12, y + itemHeight / 2);
    }
  }, [scrollPosition, items, itemHeight, renderItem, dpr]);

  // 自定义滚动条尺寸
  const thumbSize = Math.max(16, (height / totalHeight) * height);
  const thumbPos =
    maxScrollPosition > 0
      ? (scrollPosition / maxScrollPosition) * (height - thumbSize)
      : 0;

  const canvasWidth = '100%';

  if (needsScaling) {
    return (
      <div
        style={{
          height,
          border: '1px solid #d1d5db',
          borderRadius: 6,
          display: 'flex',
          position: 'relative',
        }}
      >
        <div
          style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
          onWheel={handleWheel}
        >
          <canvas
            ref={canvasRef}
            style={{ width: canvasWidth, height, display: 'block' }}
          />
        </div>
        <div
          ref={trackRef}
          style={{
            width: 10,
            height: '100%',
            background: '#f0f0f0',
            position: 'relative',
            cursor: 'pointer',
            borderRadius: '0 6px 6px 0',
          }}
          onMouseDown={handleTrackMouseDown}
        >
          <div
            style={{
              position: 'absolute',
              top: thumbPos,
              left: 1,
              width: 8,
              height: thumbSize,
              borderRadius: 4,
              background: 'rgba(0, 0, 0, 0.35)',
              cursor: 'grab',
            }}
            onMouseDown={handleThumbMouseDown}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        height,
        overflow: 'auto',
        border: '1px solid #d1d5db',
        borderRadius: 6,
        position: 'relative',
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: canvasWidth,
            height,
            display: 'block',
            position: 'sticky',
            top: 0,
          }}
        />
      </div>
    </div>
  );
}
