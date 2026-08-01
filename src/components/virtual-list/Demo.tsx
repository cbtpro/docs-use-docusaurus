import { useState, useEffect, useMemo, useRef } from 'react';
import { Progress, Radio, InputNumber } from 'antd';
import VirtualList from './VirtualList';
import TanstackVirtualList from './TanstackVirtualList';
import CanvasVirtualList from './CanvasVirtualList';
import { createDataWorker } from './createDataWorker';

// SSR 不安全组件（顶层访问 window/document）改为动态 import，避免 server bundle 打包
type AsyncComp = React.ComponentType<{ items: any; height: number; itemHeight: number }>;
const loadGlide = () => import('./GlideDataGridDemo').then(m => m.default as AsyncComp);
// canvas-datagrid 模块顶层会执行 customElements.define('canvas-datagrid', ...)
// HMR 重新加载模块时会因重复定义抛错，这里在 import 前做防御：
// 若已定义过，临时将 define 替换为 no-op，import 后恢复
const loadCanvasDatagrid = async (): Promise<AsyncComp> => {
  const ce = window.customElements;
  if (ce && ce.get('canvas-datagrid')) {
    const origDefine = ce.define.bind(ce);
    ce.define = (() => {}) as typeof ce.define;
    try {
      const m = await import('./CanvasDatagridDemo');
      return m.default as AsyncComp;
    } finally {
      ce.define = origDefine;
    }
  }
  const m = await import('./CanvasDatagridDemo');
  return m.default as AsyncComp;
};
const loadAgGrid = () => import('./AgGridDemo').then(m => m.default as AsyncComp);
const loadRcVirtual = () => import('./RcVirtualListDemo').then(m => m.default as AsyncComp);

const COUNT_PRESETS = [
  { label: '1K', value: 1_000 },
  { label: '1W', value: 10_000 },
  { label: '5W', value: 50_000 },
  { label: '10W', value: 100_000 },
  { label: '50W', value: 500_000 },
  { label: '100W', value: 1_000_000 },
];

type Tab =
  | 'normal'
  | 'virtual'
  | 'tanstack'
  | 'canvas'
  | 'glide'
  | 'canvasDatagrid'
  | 'aggrid'
  | 'rcvirtual';

const styles = {
  tabContainer: {
    display: 'flex',
    gap: 16,
    marginTop: 16,
    alignItems: 'flex-start',
  },
  tabSidebar: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    minWidth: 220,
    borderRight: '2px solid #e5e7eb',
    paddingRight: 12,
  },
  tab: {
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: 500 as const,
    cursor: 'pointer',
    border: 'none',
    borderLeft: '3px solid transparent',
    textAlign: 'left' as const,
    borderRadius: 6,
    transition: 'all 0.15s',
    background: 'transparent',
    color: '#6b7280',
    lineHeight: 1.4,
  },
  tabActive: {
    padding: '10px 14px',
    fontSize: 14,
    fontWeight: 600 as const,
    cursor: 'pointer',
    border: 'none',
    borderLeft: '3px solid #3b82f6',
    textAlign: 'left' as const,
    borderRadius: 6,
    transition: 'all 0.15s',
    background: '#eff6ff',
    color: '#1d4ed8',
    lineHeight: 1.4,
  },
  tabContent: {
    flex: 1,
    minWidth: 0,
  },
  stats: {
    display: 'flex',
    gap: 12,
    margin: '0 0 8px',
    flexWrap: 'wrap' as const,
  },
  badge: {
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 500 as const,
  },
  controls: {
    display: 'flex',
    gap: 16,
    marginBottom: 16,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  controlGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  row: {
    padding: '4px 12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #f0f0f0',
  },
  roleText: {
    color: '#6b7280',
    fontSize: 13,
  },
};

export default function VirtualListDemo() {
  const [inputValue, setInputValue] = useState('100000');
  const [count, setCount] = useState(100000);
  const [itemHeight, setItemHeight] = useState(36);
  const [containerHeight, setContainerHeight] = useState(400);
  const [activeTab, setActiveTab] = useState<Tab>('virtual');
  const [visibleCount, setVisibleCount] = useState(0);
  const [data, setData] = useState<{ id: number; name: string; email: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);

  // 异步加载的 4 个 SSR 不安全组件（tab 切换后才 import）
  const [asyncComps, setAsyncComps] = useState<{
    glide?: AsyncComp;
    canvasDatagrid?: AsyncComp;
    aggrid?: AsyncComp;
    rcvirtual?: AsyncComp;
  }>({});
  const [asyncLoading, setAsyncLoading] = useState<Partial<Record<Tab, boolean>>>({});
  const [asyncError, setAsyncError] = useState<Partial<Record<Tab, string>>>({});

  // 需要时才动态 import SSR 不安全组件（避免 window/document 在 server bundle 中引用）
  // 用 ref 记录已加载/加载中的组件，避免依赖 state 触发 effect 重跑导致 cancelled 误杀 promise
  const loadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const loaders: Record<string, () => Promise<AsyncComp>> = {
      glide: loadGlide,
      canvasDatagrid: loadCanvasDatagrid,
      aggrid: loadAgGrid,
      rcvirtual: loadRcVirtual,
    };
    const loader = loaders[activeTab];
    if (!loader || loadedRef.current.has(activeTab)) return;
    loadedRef.current.add(activeTab);

    setAsyncLoading((s) => ({ ...s, [activeTab]: true }));
    loader()
      .then((Comp) => {
        setAsyncComps((s) => ({ ...s, [activeTab]: Comp }));
      })
      .catch((err) => {
        setAsyncError((s) => ({ ...s, [activeTab]: String(err?.message ?? err) }));
        loadedRef.current.delete(activeTab); // 失败时允许重试
      })
      .finally(() => {
        setAsyncLoading((s) => ({ ...s, [activeTab]: false }));
      });
  }, [activeTab]);

  const loaderBoxStyle = {
    height: containerHeight,
    border: '1px solid #d1d5db',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9ca3af',
  } as const;

  // 提取数据项类型，供 VirtualList 等泛型组件正确推断
  type DataItem = (typeof data)[number];

  // 防抖：数量切换延迟 500ms 生效，避免快速连击预设按钮时频繁重建 Worker
  useEffect(() => {
    const timer = setTimeout(() => {
      const v = parseInt(inputValue, 10);
      if (!isNaN(v) && v > 0) setCount(v);
    }, 500);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // 用 Web Worker 在后台线程生成数据，不阻塞主线程
  useEffect(() => {
    setLoading(true);
    setProgress(0);
    const worker = createDataWorker();

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProgress(msg.percent);
        console.log(`[VirtualList Worker] 数据生成进度: ${msg.percent}%`);
      } else if (msg.type === 'done') {
        setData(msg.data);
        setLoading(false);
        setProgress(100);
        console.log(`[VirtualList Worker] 数据生成完成，耗时 ${msg.elapsed}ms`);
      }
    };

    worker.postMessage({ count });

    // cleanup：组件卸载或 count 变化时终止 Worker
    return () => worker.terminate();
  }, [count]);

  // 统计虚拟列表基础渲染的 DOM 节点数（实际渲染可能因动态 overscan 更多）
  useEffect(() => {
    const visible = Math.ceil(containerHeight / itemHeight) + 10; // +基础 overscan(5×2)
    setVisibleCount(Math.min(visible, data.length));
  }, [containerHeight, itemHeight, data.length]);

  // 估算数据占用的内存大小（基于首条数据的 JSON 序列化大小 × 总数）
  const dataSize = useMemo(() => {
    if (data.length === 0) return 0;
    const itemSize = new Blob([JSON.stringify(data[0])]).size;
    return itemSize * data.length;
  }, [data]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={styles.controls}>
        <div style={styles.controlGroup}>
          <label>数据量：</label>
          <Radio.Group
            value={Number(inputValue)}
            onChange={(e) => setInputValue(String(e.target.value))}
            optionType="button"
            buttonStyle="solid"
            options={COUNT_PRESETS.map((p) => ({ label: p.label, value: p.value }))}
          />
          <InputNumber
            min={1}
            max={5_000_000}
            value={Number(inputValue)}
            onChange={(v) => v != null && setInputValue(String(v))}
            style={{ width: 120 }}
            controls={false}
          />
        </div>
        <div style={styles.controlGroup}>
          <label>行高：</label>
          <input
            type="range"
            min={24}
            max={80}
            value={itemHeight}
            onChange={(e) => setItemHeight(Number(e.target.value))}
          />
          <span>{itemHeight}px</span>
        </div>
        <div style={styles.controlGroup}>
          <label>容器高度：</label>
          <input
            type="range"
            min={200}
            max={600}
            step={50}
            value={containerHeight}
            onChange={(e) => setContainerHeight(Number(e.target.value))}
          />
          <span>{containerHeight}px</span>
        </div>
      </div>

      {loading ? (
        <div style={{
          padding: '40px 24px',
          border: '1px dashed #d1d5db',
          borderRadius: 8,
        }}>
          <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
            正在生成 {count.toLocaleString()} 条数据（Web Worker 后台处理中）...
          </div>
          <Progress
            percent={progress}
            strokeColor={{ from: '#3b82f6', to: '#06b6d4' }}
            format={(p) => `${p}%`}
          />
        </div>
      ) : (
      <div style={styles.tabContainer}>
        {/* 左侧 Tab 列表 */}
        <div style={styles.tabSidebar}>
          <button
            style={activeTab === 'virtual' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('virtual')}
          >
            虚拟列表
          </button>
          <button
            style={activeTab === 'tanstack' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('tanstack')}
          >
            @tanstack/react-virtual
          </button>
          <button
            style={activeTab === 'canvas' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('canvas')}
          >
            Canvas 渲染
          </button>
          <button
            style={activeTab === 'glide' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('glide')}
          >
            Glide Data Grid
          </button>
          <button
            style={activeTab === 'canvasDatagrid' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('canvasDatagrid')}
          >
            Canvas Datagrid
          </button>
          <button
            style={activeTab === 'aggrid' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('aggrid')}
          >
            AG Grid
          </button>
          <button
            style={activeTab === 'rcvirtual' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('rcvirtual')}
          >
            rc-virtual-list
          </button>
          <button
            style={activeTab === 'normal' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('normal')}
          >
            普通列表
          </button>
        </div>

        {/* 右侧 Tab 内容 */}
        <div style={styles.tabContent}>

        {/* 虚拟列表 — 仅在选中时渲染 */}
        {activeTab === 'virtual' && (
          <div>
            <div style={styles.stats}>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#dcfce7',
                  color: '#166534',
                }}
              >
                渲染 {visibleCount} 个 DOM 节点
              </span>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#e0e7ff',
                  color: '#3730a3',
                }}
              >
                数据占用 {formatSize(dataSize)}
              </span>
            </div>
            <VirtualList<DataItem>
              items={data}
              itemHeight={itemHeight}
              height={containerHeight}
              renderItem={(item) => (
                <div style={styles.row}>
                  <span>{item.name}</span>
                  <span style={styles.roleText}>
                    {item.role}
                  </span>
                </div>
              )}
            />
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              * 快速滚动时缓冲区自动扩大，渲染节点数会临时增加
            </p>
          </div>
        )}

        {/* @tanstack/react-virtual — 仅在选中时渲染 */}
        {activeTab === 'tanstack' && (
          <div>
            <div style={styles.stats}>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                }}
              >
                渲染 {Math.min(Math.ceil(containerHeight / itemHeight) + 10, data.length)} 个 DOM 节点
              </span>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#e0e7ff',
                  color: '#3730a3',
                }}
              >
                数据占用 {formatSize(dataSize)}
              </span>
            </div>
            <TanstackVirtualList<DataItem>
              items={data}
              itemHeight={itemHeight}
              height={containerHeight}
              renderItem={(item) => (
                <div style={styles.row}>
                  <span>{item.name}</span>
                  <span style={styles.roleText}>
                    {item.role}
                  </span>
                </div>
              )}
            />
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              * 使用 @tanstack/react-virtual，无头方案，框架无关
            </p>
          </div>
        )}

        {/* Canvas 渲染 — 仅在选中时渲染 */}
        {activeTab === 'canvas' && (
          <div>
            <div style={styles.stats}>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#f3e8ff',
                  color: '#6b21a8',
                }}
              >
                0 个 DOM 节点（纯 Canvas 绘制）
              </span>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#e0e7ff',
                  color: '#3730a3',
                }}
              >
                数据占用 {formatSize(dataSize)}
              </span>
            </div>
            <CanvasVirtualList<DataItem>
              items={data}
              itemHeight={itemHeight}
              height={containerHeight}
              renderItem={(item) => ({
                name: item.name,
                role: item.role,
              })}
            />
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              * Canvas 直接绘制像素，无 DOM 节点，百万级数据也能流畅滚动
            </p>
          </div>
        )}

        {/* Glide Data Grid — 仅在选中时渲染，且仅在客户端渲染（避免 SSR window 未定义） */}
        {activeTab === 'glide' && (
          <div>
            <div style={styles.stats}>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#ecfeff',
                  color: '#155e75',
                }}
              >
                单 Canvas 绘制，按需 getCellContent
              </span>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#e0e7ff',
                  color: '#3730a3',
                }}
              >
                数据占用 {formatSize(dataSize)}
              </span>
            </div>
            {asyncLoading.glide ? (
              <div style={loaderBoxStyle}>加载 Glide Data Grid 组件...</div>
            ) : asyncError.glide ? (
              <div style={{ ...loaderBoxStyle, color: '#dc2626' }}>加载失败：{asyncError.glide}</div>
            ) : asyncComps.glide ? (
              (() => {
                const Comp = asyncComps.glide!;
                return <Comp items={data} height={containerHeight} itemHeight={itemHeight} />;
              })()
            ) : null}
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              * @glideapps/glide-data-grid：Canvas 表格，天然支持百万级行与列
            </p>
          </div>
        )}

        {/* Canvas Datagrid — 仅在选中时渲染，且仅在客户端渲染 */}
        {activeTab === 'canvasDatagrid' && (
          <div>
            <div style={styles.stats}>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#f0fdf4',
                  color: '#166534',
                }}
              >
                框架无关 Web Component（单 Canvas immediate mode）
              </span>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#e0e7ff',
                  color: '#3730a3',
                }}
              >
                数据占用 {formatSize(dataSize)}
              </span>
            </div>
            {asyncLoading.canvasDatagrid ? (
              <div style={loaderBoxStyle}>加载 Canvas Datagrid 组件...</div>
            ) : asyncError.canvasDatagrid ? (
              <div style={{ ...loaderBoxStyle, color: '#dc2626' }}>加载失败：{asyncError.canvasDatagrid}</div>
            ) : asyncComps.canvasDatagrid ? (
              (() => {
                const Comp = asyncComps.canvasDatagrid!;
                return <Comp items={data} height={containerHeight} itemHeight={itemHeight} />;
              })()
            ) : null}
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              * canvas-datagrid：零 React/Vue 依赖，单 Canvas 绘制，内置虚拟滚动支持百万级数据
            </p>
          </div>
        )}

        {/* AG Grid — 仅在选中时渲染，且仅在客户端渲染 */}
        {activeTab === 'aggrid' && (
          <div>
            <div style={styles.stats}>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#fff7ed',
                  color: '#9a3412',
                }}
              >
                DOM 行虚拟化（企业版提供 Canvas）
              </span>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#e0e7ff',
                  color: '#3730a3',
                }}
              >
                数据占用 {formatSize(dataSize)}
              </span>
            </div>
            {asyncLoading.aggrid ? (
              <div style={loaderBoxStyle}>加载 AG Grid 组件...</div>
            ) : asyncError.aggrid ? (
              <div style={{ ...loaderBoxStyle, color: '#dc2626' }}>加载失败：{asyncError.aggrid}</div>
            ) : asyncComps.aggrid ? (
              (() => {
                const Comp = asyncComps.aggrid!;
                return <Comp items={data} height={containerHeight} itemHeight={itemHeight} />;
              })()
            ) : null}
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              * ag-grid-community：最成熟的企业级虚拟化表格开源方案
            </p>
          </div>
        )}

        {/* rc-virtual-list — 仅在选中时渲染，且仅在客户端渲染 */}
        {activeTab === 'rcvirtual' && (
          <div>
            <div style={styles.stats}>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#fef2f2',
                  color: '#991b1b',
                }}
              >
                AntD 底层 DOM 虚拟化列表
              </span>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#e0e7ff',
                  color: '#3730a3',
                }}
              >
                数据占用 {formatSize(dataSize)}
              </span>
            </div>
            {asyncLoading.rcvirtual ? (
              <div style={loaderBoxStyle}>加载 rc-virtual-list 组件...</div>
            ) : asyncError.rcvirtual ? (
              <div style={{ ...loaderBoxStyle, color: '#dc2626' }}>加载失败：{asyncError.rcvirtual}</div>
            ) : asyncComps.rcvirtual ? (
              (() => {
                const Comp = asyncComps.rcvirtual!;
                return <Comp items={data} height={containerHeight} itemHeight={itemHeight} />;
              })()
            ) : null}
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              * rc-virtual-list：Ant Design Select/Tree 的虚拟滚动底层实现
            </p>
          </div>
        )}

        {/* 普通列表 — 仅在选中时渲染，避免大量 DOM 影响全局 */}
        {activeTab === 'normal' && (
          <div>
            <div style={styles.stats}>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                }}
              >
                渲染 {data.length.toLocaleString()} 条
              </span>
              <span
                style={{
                  ...styles.badge,
                  backgroundColor: '#e0e7ff',
                  color: '#3730a3',
                }}
              >
                数据占用 {formatSize(dataSize)}
              </span>
            </div>
            <div
              style={{
                height: containerHeight,
                overflow: 'auto',
                border: '1px solid #d1d5db',
                borderRadius: 6,
              }}
            >
              {data.map((item) => (
                <div key={item.id} style={styles.row}>
                  <span>{item.name}</span>
                  <span style={styles.roleText}>
                    {item.role}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              * 普通列表渲染全部 {count.toLocaleString()} 条数据，滚动试试
            </p>
          </div>
        )}
        </div>
      </div>
      )}
    </div>
  );
}
