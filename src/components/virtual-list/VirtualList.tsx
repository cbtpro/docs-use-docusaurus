import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

interface VirtualListProps<T> {
  /** 完整数据列表 */
  items: T[];
  /** 每行高度（px） */
  itemHeight: number;
  /** 容器高度（px） */
  height: number;
  /** 上下缓冲区额外渲染的行数 */
  overscan?: number;
  /** 渲染每一行的组件 */
  renderItem: (item: T, index: number) => React.ReactNode;
}

// 浏览器对 scrollHeight 有最大限制（Chrome ~33.5M, Firefox ~11M）
// 取保守值确保跨浏览器兼容
const MAX_SCROLL_HEIGHT = 10_000_000;

export default function VirtualList<T>({
  items,
  itemHeight,
  height,
  overscan = 5,
  renderItem,
}: VirtualListProps<T>) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 性能优化相关 ref
  const rafIdRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);

  // 总高度：所有项目撑开的完整滚动高度
  const totalHeight = useMemo(
    () => items.length * itemHeight,
    [items.length, itemHeight]
  );

  // 当总高度超过浏览器限制时，切换到自定义滚动模式
  // 自定义滚动不依赖浏览器 scrollHeight，scrollPosition 可以是任意大的值
  // 渲染时用 top = startIndex * itemHeight - scrollPosition，相减后始终在视口范围内，无精度问题
  const needsScaling = totalHeight > MAX_SCROLL_HEIGHT;
  const maxScrollPosition = Math.max(0, totalHeight - height);

  // 可视范围计算：根据滚动速度动态扩大缓冲区
  const { startIndex, endIndex, visibleItems } = useMemo(() => {
    const velocity = velocityRef.current;
    // 速度越快，缓冲区越大：每 1px/ms 额外增加 5 行缓冲
    const dynamicOverscan = overscan + Math.floor(Math.min(velocity, 10) * 5);
    const start = Math.max(0, Math.floor(scrollPosition / itemHeight) - dynamicOverscan);
    const visibleCount = Math.ceil(height / itemHeight);
    const end = Math.min(
      items.length - 1,
      Math.ceil(scrollPosition / itemHeight) + visibleCount + dynamicOverscan
    );
    return {
      startIndex: start,
      endIndex: end,
      visibleItems: items.slice(start, end + 1),
    };
  }, [scrollPosition, itemHeight, height, overscan, items]);

  // rAF 节流 + 速度追踪
  const rafScroll = useCallback((newPos: number) => {
    const now = performance.now();
    if (lastTimeRef.current > 0) {
      velocityRef.current =
        Math.abs(newPos - lastScrollTopRef.current) /
        (now - lastTimeRef.current);
    }
    lastScrollTopRef.current = newPos;
    lastTimeRef.current = now;

    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        setScrollPosition(newPos);
        rafIdRef.current = 0;
      });
    }
  }, []);

  // ---- 自定义滚动模式（needsScaling 时）----
  // 不使用浏览器原生滚动，自己管理 scrollPosition
  // 通过 wheel 事件 + 自定义滚动条驱动
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!needsScaling) return;
    e.preventDefault();
    const delta = e.deltaY;
    rafScroll(
      Math.max(0, Math.min(maxScrollPosition, scrollPosition + delta))
    );
  }, [needsScaling, scrollPosition, maxScrollPosition, rafScroll]);

  // ---- 原生滚动模式：阻止滚动穿透 ----
  // React 的 onWheel 是 passive 事件，preventDefault 无效
  // 需要用原生 addEventListener({ passive: false }) 才能阻止
  useEffect(() => {
    if (needsScaling) return;
    const node = containerRef.current;
    if (!node) return;
    const preventScrollPropagation = (e: WheelEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = node;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight;
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        e.preventDefault();
      }
    };
    node.addEventListener('wheel', preventScrollPropagation, { passive: false });
    return () => node.removeEventListener('wheel', preventScrollPropagation);
  }, [needsScaling]);

  // 自定义滚动条拖拽
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);

  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      startY: e.clientY,
      startScroll: scrollPosition,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current || !trackRef.current) return;
      const trackHeight = trackRef.current.clientHeight;
      const thumbSize = Math.max(16, (height / totalHeight) * height);
      const delta = ev.clientY - dragRef.current.startY;
      const scrollDelta = (delta / (trackHeight - thumbSize)) * maxScrollPosition;
      rafScroll(
        Math.max(0, Math.min(maxScrollPosition, dragRef.current.startScroll + scrollDelta))
      );
    };

    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [scrollPosition, height, totalHeight, maxScrollPosition, rafScroll]);

  // 点击轨道翻页
  const handleTrackMouseDown = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const thumbSize = Math.max(16, (height / totalHeight) * height);
    const thumbPos = (scrollPosition / maxScrollPosition) * (height - thumbSize);
    const direction = clickY < thumbPos ? -1 : 1;
    rafScroll(
      Math.max(0, Math.min(maxScrollPosition, scrollPosition + direction * height * 0.8))
    );
  }, [scrollPosition, height, totalHeight, maxScrollPosition, rafScroll]);

  // ---- 原生滚动模式（非 needsScaling）----
  const handleNativeScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    const currentScrollTop = node.scrollTop;
    rafScroll(currentScrollTop);
  }, [rafScroll]);

  useEffect(() => {
    if (needsScaling) return;
    const node = containerRef.current;
    if (!node) return;
    node.addEventListener('scroll', handleNativeScroll, { passive: true });
    return () => node.removeEventListener('scroll', handleNativeScroll);
  }, [needsScaling, handleNativeScroll]);

  // 数据量切换时重置滚动位置
  useEffect(() => {
    setScrollPosition(0);
    velocityRef.current = 0;
    lastScrollTopRef.current = 0;
    lastTimeRef.current = 0;
    if (!needsScaling) {
      containerRef.current?.scrollTo(0, 0);
    }
  }, [items.length, needsScaling]);

  // 自定义滚动模式的渲染位置：top = startIndex * itemHeight - scrollPosition
  // 自定义滚动不使用浏览器 scrollTop，需要手动减去 scrollPosition 定位到视口内
  const customOffsetY = startIndex * itemHeight - scrollPosition;
  // 原生滚动模式的渲染位置：translateY 只需定位到 startIndex * itemHeight
  // 浏览器 scrollTop 已处理滚动偏移，不需要再减 scrollPosition，否则会双重偏移
  const nativeOffsetY = startIndex * itemHeight;

  // 自定义滚动条尺寸
  const thumbSize = Math.max(16, (height / totalHeight) * height);
  const thumbPos = maxScrollPosition > 0
    ? (scrollPosition / maxScrollPosition) * (height - thumbSize)
    : 0;

  if (needsScaling) {
    // 自定义滚动模式：overflow:hidden + 自定义滚动条
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
        {/* 视口：overflow hidden，不使用浏览器滚动 */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
          }}
          onWheel={handleWheel}
        >
          <div
            style={{
              position: 'absolute',
              top: customOffsetY,
              left: 0,
              right: 0,
              willChange: 'transform',
            }}
          >
            {visibleItems.map((item, i) => (
              <div
                key={startIndex + i}
                style={{
                  height: itemHeight,
                  boxSizing: 'border-box',
                }}
              >
                {renderItem(item, startIndex + i)}
              </div>
            ))}
          </div>
        </div>
        {/* 自定义滚动条 */}
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

  // 原生滚动模式
  return (
    <div
      ref={containerRef}
      style={{
        height,
        overflow: 'auto',
        border: '1px solid #d1d5db',
        borderRadius: 6,
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${nativeOffsetY}px)`, willChange: 'transform' }}>
          {visibleItems.map((item, i) => (
            <div
              key={startIndex + i}
              style={{
                height: itemHeight,
                boxSizing: 'border-box',
              }}
            >
              {renderItem(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
