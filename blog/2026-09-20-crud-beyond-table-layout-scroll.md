---
title: CRUD 之外 - 列表页布局的高度链与表格滚动
authors: [cbtpro]
description: 通过 flex 高度链分配列表空间，测量表头与容器计算表体高度，让分页保持可见。
tags:
  - crud
  - 前端
  - react
  - antd
  - 工程实践
  - 鲁棒性
---

固定表头、表体滚动、分页留在底部，需要先分配好整个列表页的高度。搜索栏、Card 内边距和表头都会占空间，剩下的才是表体可滚动区域。

这里使用纵向 flex 布局，让搜索区和分页保持自身高度，中间区域分配剩余空间，再测量表头与容器尺寸计算 scroll.y。

{/* truncate */}

## 从页面到 Card body 的高度链

```css
html, body, #root { height: 100%; }
.app { height: 100%; display: flex; flex-direction: column; }
.app-content, .list-page, .list-card, .list-card > .ant-card-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.list-page { overflow: hidden; }
.list-search, .list-pagination { flex-shrink: 0; }
.list-table { flex: 1; min-height: 0; overflow: hidden; }
```

根节点 ID 按应用实际结构调整。Card 有独立 body 包装层，flex 布局需要延伸到这一层；也可通过 `styles.body` 设置。

`min-height: 0` 允许中间 flex 子项在内容较多时缩小到分配的高度。外层限制尺寸，表体承担滚动，分页就能留在可见区域。窄屏或低高度窗口下，如果搜索栏本身已经占满空间，应折叠次要条件或允许页面级滚动。

## 测量表体的可用高度

antd 的 `scroll.y` 控制表体最大高度。容器高度还包括表头，因此用“容器高度减表头高度”作为起点。下面针对普通非虚拟 Table，无 title、footer、summary 和内置分页。

```tsx title="表格高度测量"
const tableWrapRef = useRef<HTMLDivElement>(null)
const [scrollY, setScrollY] = useState(300)

useLayoutEffect(() => {
  const container = tableWrapRef.current
  if (!container) return
  const header = container.querySelector<HTMLElement>('.ant-table-header')
  const measure = () => {
    const headerHeight = header?.getBoundingClientRect().height ?? 0
    setScrollY(Math.max(0, container.clientHeight - headerHeight))
  }
  measure()
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
  observer?.observe(container)
  if (header) observer?.observe(header)
  window.addEventListener('resize', measure)
  return () => {
    observer?.disconnect()
    window.removeEventListener('resize', measure)
  }
}, [columns])
```

列定义保持稳定引用；动态切换表头结构时重新绑定观察器。`.ant-table-header` 属于组件内部结构，升级 antd 时一并检查。表格若加入 summary、footer 或其他装饰，需要把它们的实际高度算进去。

ResizeObserver 同时响应侧栏折叠、搜索区换行等内部布局变化。`useLayoutEffect` 在客户端绘制前完成首次测量；服务端输出阶段仍使用初始高度。

## 分页作为独立区域

```tsx
<Card className="list-card">
  <div className="list-search">{searchForm}</div>
  <div ref={tableWrapRef} className="list-table">
    <Table
      rowKey="id"
      dataSource={data}
      columns={columns}
      loading={loading}
      scroll={{ x: 1100, y: scrollY }}
      pagination={false}
    />
  </div>
  <div className="list-pagination">
    <Pagination
      current={page}
      pageSize={pageSize}
      total={total}
      onChange={handlePageChange}
    />
  </div>
</Card>
```

独立分页便于对齐和分配高度。Table 内置分页本身也在表体滚动区之外；当它被挤出屏幕时，通常需要检查页面总高度，而非分页组件的滚动行为。

普通 Table 的 scroll.y 是最大高度，少量数据时表体可以自然变矮。外层 `.list-table` 继续占满剩余空间，分页位置仍稳定。若需要空表也铺满背景，可在容器上设置背景与空状态布局。

## 横向滚动与固定列

列较多时为关键列设置宽度，给操作列加 `fixed: 'right'`。`scroll.x` 决定横向布局基准；列宽、容器宽度和长文本共同影响最终布局，至少留一列自适应通常更容易分配空间。

长字符串可用 ellipsis 或换行策略处理，固定列背景与层级也要与主题一致。验证时分别看空表、少量行、多行、窄屏和侧栏折叠后的效果，这几种状态最容易暴露高度计算遗漏。

布局参考：[action-in-reactjs](https://github.com/cbtpro/action-in-reactjs)。
