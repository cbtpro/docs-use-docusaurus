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

export default function VirtualList<T>({
  items,
  itemHeight,
  height,
  overscan = 5,
  renderItem,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
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

  // 可视范围计算：根据滚动速度动态扩大缓冲区
  const { startIndex, endIndex, visibleItems } = useMemo(() => {
    const velocity = velocityRef.current;
    // 速度越快，缓冲区越大：每 1px/ms 额外增加 5 行缓冲
    const dynamicOverscan = overscan + Math.floor(Math.min(velocity, 10) * 5);
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - dynamicOverscan);
    const visibleCount = Math.ceil(height / itemHeight);
    const end = Math.min(
      items.length - 1,
      Math.ceil(scrollTop / itemHeight) + visibleCount + dynamicOverscan
    );
    return {
      startIndex: start,
      endIndex: end,
      visibleItems: items.slice(start, end + 1),
    };
  }, [scrollTop, itemHeight, height, overscan, items]);

  // rAF 节流 + 速度追踪
  // 每帧最多更新一次 scrollTop，减少主线程压力
  // 同时计算滚动速度，供动态 overscan 使用
  const handleScroll = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;

    const currentScrollTop = node.scrollTop;
    const now = performance.now();

    if (lastTimeRef.current > 0) {
      velocityRef.current =
        Math.abs(currentScrollTop - lastScrollTopRef.current) /
        (now - lastTimeRef.current);
    }
    lastScrollTopRef.current = currentScrollTop;
    lastTimeRef.current = now;

    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        setScrollTop(currentScrollTop);
        rafIdRef.current = 0;
      });
    }
  }, []);

  // useEffect 绑定 scroll 监听，cleanup 确保不泄漏
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => node.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // 数据量切换时重置滚动位置，避免 scrollTop 超出新的总高度
  useEffect(() => {
    setScrollTop(0);
    containerRef.current?.scrollTo(0, 0);
    velocityRef.current = 0;
    lastScrollTopRef.current = 0;
    lastTimeRef.current = 0;
  }, [items.length]);

  // 用 transform 定位可见项：外层 div 撑开完整高度，内层 div 偏移到正确位置
  const offsetY = startIndex * itemHeight;

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
        <div style={{ transform: `translateY(${offsetY}px)`, willChange: 'transform' }}>
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
