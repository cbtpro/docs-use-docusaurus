import { useEffect, useRef, useState } from 'react';

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

// 0.4.7 的声明将实例方法标成 static，这里仅声明演示使用的接口。
interface GridElement extends HTMLElement {
  data: DataItem[];
  schema: typeof SCHEMA;
  attributes: HTMLElement['attributes'] & Record<string, unknown>;
  style: CSSStyleDeclaration & { cellHeight: number };
  resize: () => void;
  dispose: () => void;
}

let registration: Promise<void> | undefined;
function loadGrid() {
  if (customElements.get('canvas-datagrid')) return Promise.resolve();
  registration ??= import('canvas-datagrid').then(() => {}).catch((error) => {
    registration = undefined;
    throw error;
  });
  return registration;
}

export default function CanvasDatagridDemo({ items, height, itemHeight }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<GridElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let element: GridElement | undefined;
    let observer: ResizeObserver | undefined;

    void loadGrid().then(() => {
      if (cancelled) return;
      element = document.createElement('canvas-datagrid') as GridElement;
      Object.assign(element.attributes, {
        editable: false,
        allowColumnReordering: false,
        allowColumnResizing: true,
        allowRowReordering: false,
        allowSorting: false,
        showFilter: false,
        saveAppearance: false,
        selectionMode: 'row',
      });
      element.style.width = '100%';
      element.style.height = '100%';
      element.schema = SCHEMA;
      container.appendChild(element);
      observer = new ResizeObserver(() => element?.resize());
      observer.observe(container);
      setGrid(element);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      element?.dispose();
      element?.remove();
    };
  }, []);

  useEffect(() => {
    if (!grid) return;
    grid.data = items;
  }, [grid, items]);

  useEffect(() => {
    if (!grid) return;
    grid.style.cellHeight = itemHeight;
    grid.resize();
  }, [grid, itemHeight]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: '100%', border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden' }}
    >
      {error ? <div role="alert">Canvas Datagrid 加载失败：{error}</div> : !grid ? <div role="status">加载 Canvas Datagrid 组件...</div> : null}
    </div>
  );
}
