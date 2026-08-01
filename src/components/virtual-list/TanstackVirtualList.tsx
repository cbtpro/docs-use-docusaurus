import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface TanstackVirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}

// 浏览器对 scrollHeight 有最大限制（Chrome ~33.5M, Firefox ~11M）
// 取保守值确保跨浏览器兼容
const MAX_SCROLL_HEIGHT = 10_000_000;

export default function TanstackVirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
}: TanstackVirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);
  const rafIdRef = useRef(0);

  const [scrollPosition, setScrollPosition] = useState(0);

  const totalHeight = useMemo(
    () => items.length * itemHeight,
    [items.length, itemHeight]
  );

  // 当总高度超过浏览器限制时，切换到自定义滚动模式
  const needsScaling = totalHeight > MAX_SCROLL_HEIGHT;
  const maxScrollPosition = Math.max(0, totalHeight - height);

  // rAF 节流
  const rafScroll = useCallback((newPos: number) => {
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        setScrollPosition(newPos);
        rafIdRef.current = 0;
      });
    }
  }, []);

  // ---- 自定义滚动模式（needsScaling 时）----
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    rafScroll(
      Math.max(0, Math.min(maxScrollPosition, scrollPosition + e.deltaY))
    );
  }, [scrollPosition, maxScrollPosition, rafScroll]);

  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startY: e.clientY, startScroll: scrollPosition };

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

  // 自定义模式下手动计算可视范围（不依赖 virtualizer 的 scrollElement）
  const customRange = useMemo(() => {
    if (!needsScaling) return null;
    const overscan = 5;
    const start = Math.max(0, Math.floor(scrollPosition / itemHeight) - overscan);
    const visibleCount = Math.ceil(height / itemHeight);
    const end = Math.min(
      items.length - 1,
      Math.ceil(scrollPosition / itemHeight) + visibleCount + overscan
    );
    return { start, end };
  }, [needsScaling, scrollPosition, itemHeight, height, items.length]);

  // ---- 原生滚动模式（非 needsScaling）----
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5,
  });

  const handleNativeScroll = useCallback(() => {
    const node = parentRef.current;
    if (!node) return;
    rafScroll(node.scrollTop);
  }, [rafScroll]);

  useEffect(() => {
    if (needsScaling) return;
    const node = parentRef.current;
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

  useEffect(() => {
    setScrollPosition(0);
    rafIdRef.current = 0;
    if (!needsScaling) {
      parentRef.current?.scrollTo(0, 0);
    }
  }, [items.length, needsScaling]);

  // 自定义滚动条尺寸
  const thumbSize = Math.max(16, (height / totalHeight) * height);
  const thumbPos = maxScrollPosition > 0
    ? (scrollPosition / maxScrollPosition) * (height - thumbSize)
    : 0;

  if (needsScaling) {
    const startIdx = customRange!.start;
    const endIdx = customRange!.end;
    // top = index * itemHeight - scrollPosition，始终在视口范围内，无精度问题
    const offsetY = startIdx * itemHeight - scrollPosition;

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
              top: offsetY,
              left: 0,
              right: 0,
            }}
          >
            {Array.from({ length: endIdx - startIdx + 1 }, (_, i) => {
              const index = startIdx + i;
              return (
                <div
                  key={index}
                  style={{
                    height: itemHeight,
                    boxSizing: 'border-box',
                  }}
                >
                  {renderItem(items[index], index)}
                </div>
              );
            })}
          </div>
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

  // 原生滚动模式
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      style={{
        height,
        overflow: 'auto',
        border: '1px solid #d1d5db',
        borderRadius: 6,
      }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: virtualItem.size,
              transform: `translateY(${virtualItem.start}px)`,
              boxSizing: 'border-box',
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
