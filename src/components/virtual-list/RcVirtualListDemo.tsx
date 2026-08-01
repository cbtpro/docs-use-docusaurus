import { useRef } from 'react';
import RcVirtualList, { ListRef } from 'rc-virtual-list';

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

const rowStyle = {
  padding: '4px 12px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid #f0f0f0',
  boxSizing: 'border-box' as const,
};

const roleTextStyle = {
  color: '#6b7280',
  fontSize: 13,
};

// rc-virtual-list 是 AntD 团队维护的 DOM 虚拟化列表
// 提供 scrollTo / 可变行高 / onScroll 等能力，广泛应用于 Ant Design Select/Tree 等组件
export default function RcVirtualListDemo({ items, height, itemHeight }: Props) {
  const listRef = useRef<ListRef | null>(null);

  // 注意：rc-virtual-list 的 itemHeight 属性要求行高在外部保持一致
  // 它使用相对定位的"单虚拟容器 + transform translateY"模式渲染可见项
  return (
    <div
      style={{
        border: '1px solid #d1d5db',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <RcVirtualList<DataItem>
        ref={(inst) => {
          listRef.current = inst;
        }}
        data={items}
        height={height}
        itemHeight={itemHeight}
        itemKey="id"
      >
        {(item, _index, { style: virtStyle }) => (
          <div
            style={{
              ...rowStyle,
              ...virtStyle,
              height: itemHeight,
            }}
          >
            <span>{item.name}</span>
            <span style={roleTextStyle}>{item.role}</span>
          </div>
        )}
      </RcVirtualList>
    </div>
  );
}
