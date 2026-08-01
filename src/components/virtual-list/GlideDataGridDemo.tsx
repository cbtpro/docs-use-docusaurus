import { useMemo, useCallback } from 'react';
import DataEditor, {
  GridCell,
  GridColumn,
  GridCellKind,
  Item,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';

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

const COLUMNS: GridColumn[] = [
  { title: 'ID', width: 80 },
  { title: '姓名', width: 180 },
  { title: '邮箱', width: 260 },
  { title: '角色', width: 180 },
];

// Glide Data Grid 使用 [列, 行] 二维索引按需获取单元格内容
// Canvas 绘制，不存在 DOM 渲染瓶颈，天然支持百万级行列
export default function GlideDataGridDemo({ items, height, itemHeight }: Props) {
  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      const item = items[row];
      if (!item) {
        return {
          kind: GridCellKind.Text,
          data: '',
          displayData: '',
          allowOverlay: false,
        };
      }
      const values = [
        String(item.id),
        item.name,
        item.email,
        item.role,
      ];
      return {
        kind: GridCellKind.Text,
        data: values[col] ?? '',
        displayData: values[col] ?? '',
        allowOverlay: false,
      };
    },
    [items],
  );

  const columns = useMemo(() => COLUMNS, []);

  return (
    <div
      style={{
        border: '1px solid #d1d5db',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <DataEditor
        width="100%"
        height={height}
        rows={items.length}
        columns={columns}
        getCellContent={getCellContent}
        rowHeight={itemHeight}
        headerHeight={itemHeight}
        // 禁用行标记列，保持与其他 tab 视觉一致
        rowMarkers="none"
        // 禁用列拖拽和调整大小，仅展示
        freezeColumns={0}
        // 只读展示：未设置 onCellEdited 即无法编辑
      />
    </div>
  );
}
