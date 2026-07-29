import { useState, useRef, useEffect, useMemo } from 'react';
import { Progress, Radio, InputNumber } from 'antd';
import VirtualList from './VirtualList';
import TanstackVirtualList from './TanstackVirtualList';
import { createDataWorker } from './createDataWorker';

const COUNT_PRESETS = [
  { label: '1K', value: 1_000 },
  { label: '1W', value: 10_000 },
  { label: '5W', value: 50_000 },
  { label: '10W', value: 100_000 },
  { label: '50W', value: 500_000 },
  { label: '100W', value: 1_000_000 },
];

type Tab = 'normal' | 'virtual' | 'tanstack';

const styles = {
  tabBar: {
    display: 'flex',
    gap: 0,
    marginTop: 16,
    borderBottom: '2px solid #e5e7eb',
  },
  tab: {
    padding: '8px 20px',
    fontSize: 14,
    fontWeight: 500 as const,
    cursor: 'pointer',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -2,
    transition: 'all 0.15s',
    background: 'transparent',
    color: '#6b7280',
  },
  tabActive: {
    padding: '8px 20px',
    fontSize: 14,
    fontWeight: 600 as const,
    cursor: 'pointer',
    border: 'none',
    borderBottom: '2px solid #3b82f6',
    marginBottom: -2,
    transition: 'all 0.15s',
    background: 'transparent',
    color: '#1d4ed8',
  },
  stats: {
    display: 'flex',
    gap: 12,
    margin: '12px 0 8px',
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
  const [percent, setPercent] = useState(0);

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
    setPercent(0);
    const worker = createDataWorker();

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setPercent(msg.percent);
        console.log(`[VirtualList Worker] 数据生成进度: ${msg.percent}%`);
      } else if (msg.type === 'done') {
        setData(msg.data);
        setLoading(false);
        setPercent(100);
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
            percent={percent}
            strokeColor={{ from: '#3b82f6', to: '#06b6d4' }}
            format={(p) => `${p}%`}
          />
        </div>
      ) : (
      <>
        {/* Tab 切换 */}
        <div style={styles.tabBar}>
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
            style={activeTab === 'normal' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('normal')}
          >
            普通列表
          </button>
        </div>

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
            <VirtualList
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
            <TanstackVirtualList
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
      </>
      )}
    </div>
  );
}
