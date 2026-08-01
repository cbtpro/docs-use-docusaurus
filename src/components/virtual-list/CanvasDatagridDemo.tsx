import { useEffect, useRef } from 'react';
import canvasDatagrid from 'canvas-datagrid';

interface DataItem {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface Props {
  items: DataItem[];
  height: number;
  itemHeight: number;
}

const SCHEMA = [
  { name: 'id', title: 'ID', width: 80 },
  { name: 'name', title: '姓名', width: 180 },
  { name: 'email', title: '邮箱', width: 260 },
  { name: 'role', title: '角色', width: 180 },
];

// canvas-datagrid 的类型定义将实例方法误声明为 static，此处用类型断言修正
type GridInstance = InstanceType<typeof canvasDatagrid> & {
  draw: () => void;
  dispose: () => void;
  resize: () => void;
  data: any[];
  schema: any[];
  style: Record<string, unknown>;
  scrollTop: number;
  scrollHeight: number;
  height: number;
};

// canvas-datagrid 是框架无关的 Web Component
// 官网说明：Capable of displaying millions of contiguous rows on a single canvas
// 内部自带虚拟滚动，只需正确设置容器尺寸和 style.cellHeight
//
// 卡死根因：
// 1. component.observe 创建 MutationObserver 监听 document 中所有 <style> 元素
//    Docusaurus/AntD 动态注入 <style> → 触发回调 → applyComponentStyle(false)
//    → getComputedStyle（强制同步布局）→ rAF(resize) → 主线程卡死
// 2. main.js 中 i.data = args.data 在 connectedCallback 之前被调用
//    此时 canvas 尺寸为 0，dataSetter 中的 resize/draw 异常
//
// 修复方案：
// 1. 用 TrackedMutationObserver 记录创建的 observer，创建后立即 disconnect()
// 2. 不传 data 初始化空 grid，append 到 DOM 后异步设置 data
export default function CanvasDatagridDemo({ items, height, itemHeight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<GridInstance | null>(null);

  // 初始化：创建空 grid，异步设置 data
  useEffect(() => {
    if (!containerRef.current) return;

    // 用 TrackedMutationObserver 记录 component.observe 创建的所有 observer
    // 创建后立即 disconnect()，彻底阻止 observer 监听 style 变化
    const origMO = window.MutationObserver;
    const createdObservers: MutationObserver[] = [];
    const TrackedMO = class extends origMO {
      constructor(callback: MutationCallback) {
        super(callback);
        createdObservers.push(this);
      }
    };
    (window as unknown as { MutationObserver: unknown }).MutationObserver =
      TrackedMO;

    let grid: GridInstance;
    let gridElement: HTMLDivElement;
    try {
      // 官方文档：先创建独立 div，作为 parentNode 传给 grid
      gridElement = document.createElement('div');
      grid = canvasDatagrid({
        parentNode: gridElement,
        editable: false,
        allowColumnReordering: false,
        allowColumnResizing: true,
        allowRowReordering: false,
        allowSorting: false,
        showFilter: false,
        selectionMode: 'row',
        // 不传 data，先创建空 grid，避免 dataSetter 在 canvas 尺寸为 0 时执行
        schema: SCHEMA,
      }) as unknown as GridInstance;
    } finally {
      // 恢复原始 MutationObserver
      window.MutationObserver = origMO;
      // 立即 disconnect 所有 observer，阻止监听 <style> 变化
      createdObservers.forEach((o) => o.disconnect());
    }

    // 行高通过 style.cellHeight 设置（官网 API：Changing a style will automatically call draw）
    grid.style.cellHeight = itemHeight;

    // 官方文档：最后再把 gridElement append 到容器
    containerRef.current.appendChild(gridElement);

    gridRef.current = grid;

    // 异步设置 data：让浏览器先渲染空 grid，再在下一帧处理大数据
    // dataSetter 中 etl/refresh/fitColumnToValues 在大数据量下较慢
    // 用 rAF 延迟到下一帧，避免阻塞当前帧的 UI 渲染
    const rafId = requestAnimationFrame(() => {
      if (gridRef.current) {
        gridRef.current.data = items;
      }
    });

    // 阻止滚动穿透：grid 内部可滚动时阻止 wheel 冒泡到页面
    const node = containerRef.current;
    const preventScrollPropagation = (e: WheelEvent) => {
      const g = gridRef.current;
      if (!g) return;
      if (g.scrollHeight <= g.height) return;
      const atTop = g.scrollTop <= 0;
      const atBottom = g.scrollTop + g.height >= g.scrollHeight;
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) return;
      e.preventDefault();
    };
    node.addEventListener('wheel', preventScrollPropagation, { passive: false });

    return () => {
      cancelAnimationFrame(rafId);
      node.removeEventListener('wheel', preventScrollPropagation);
      if (gridRef.current) {
        gridRef.current.dispose();
        gridRef.current = null;
      }
      if (gridElement.parentNode) {
        gridElement.parentNode.removeChild(gridElement);
      }
    };
    // 只在挂载时初始化一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数据变化时重新绑定
  useEffect(() => {
    if (!gridRef.current) return;
    gridRef.current.data = items;
  }, [items]);

  // 容器高度变化时手动 resize + 重绘
  useEffect(() => {
    if (!gridRef.current) return;
    gridRef.current.resize();
    gridRef.current.draw();
  }, [height]);

  // 行高变化时更新 style（官网：Changing a style will automatically call draw）
  useEffect(() => {
    if (!gridRef.current) return;
    gridRef.current.style.cellHeight = itemHeight;
  }, [itemHeight]);

  return (
    <div
      ref={containerRef}
      style={{
        height,
        width: '100%',
        border: '1px solid #d1d5db',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    />
  );
}
