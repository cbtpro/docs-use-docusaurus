import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, RowSelectionOptions, SideBarDef } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

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

// AG Grid Community 使用 DOM 虚拟化（行虚拟化）
// 企业版提供 Canvas 渲染，此处使用社区版以保持零付费依赖
export default function AgGridDemo({ items, height, itemHeight }: Props) {
  const columnDefs = useMemo<ColDef<DataItem>[]>(
    () => [
      {
        field: 'id',
        headerName: 'ID',
        width: 80,
        filter: false,
        sortable: false,
      },
      {
        field: 'name',
        headerName: '姓名',
        width: 180,
        filter: false,
        sortable: false,
      },
      {
        field: 'email',
        headerName: '邮箱',
        width: 260,
        filter: false,
        sortable: false,
      },
      {
        field: 'role',
        headerName: '角色',
        width: 180,
        filter: false,
        sortable: false,
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef<DataItem>>(
    () => ({
      resizable: true,
      suppressMovable: true,
      cellStyle: { lineHeight: `${itemHeight}px` },
    }),
    [itemHeight],
  );

  const rowSelection = useMemo<RowSelectionOptions>(
    () => ({
      mode: 'singleRow',
      enableClickSelection: true,
    }),
    [],
  );

  return (
    <div
      className="ag-theme-alpine"
      style={{
        height,
        border: '1px solid #d1d5db',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <AgGridReact<DataItem>
        rowData={items}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        headerHeight={itemHeight}
        rowHeight={itemHeight}
        rowSelection={rowSelection}
        // 禁用单元格范围选择，保持与其他 tab 视觉一致
        cellSelection={false}
        suppressColumnVirtualisation={false}
        animateRows={false}
      />
    </div>
  );
}
