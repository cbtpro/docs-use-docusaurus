---
title: CRUD 之外 - 列表搜索的输入即搜索与防抖
authors: [cbtpro]
description: 统一输入、查询与重置的触发入口，说明防抖计时器、实时取值和请求竞态各自负责什么。
tags:
  - crud
  - 搜索
  - 防抖
  - 前端
  - react
  - 表单
  - 状态管理
  - 工程实践
  - 鲁棒性
---

搜索框输入一个关键字，如果每敲一个字都查一次，用户会看到连续的加载状态。加上防抖后，请求少了，但查询按钮、回车和重置还可能各走一条路径，造成重复查询。

这里把这些入口合到一个调度函数里：输入等待一小段时间，明确的提交动作立即查询，两者共用同一个计时器。查询成本高、筛选项需要成组填写的页面，仍可以保留手动查询作为默认方式。

{/* truncate */}

## 先确定 Form 的事件行为

Ant Design Form 的 `onValuesChange` 处理用户交互引起的字段变化。`setFieldsValue` 和 `resetFields` 不会替调用方触发这个回调。重置回到 `initialValues`，也未必等于清空所有字段。

因此重置按钮需要显式查询：

```tsx
const handleReset = () => {
  form.resetFields()
  scheduleSearch({ force: true })
}
```

连续输入交给防抖合并，重置则恢复初始值后立即执行一次查询，两类动作分别接入调度器。

## 共用一个计时器

下面是基于项目 FormSearch 整理的调度片段。`form`、`onSearch` 和 `debounceMs` 来自组件参数。

```tsx title="FormSearch 调度片段"
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const cancelPending = useCallback(() => {
  if (timerRef.current !== null) {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }
}, [])

const scheduleSearch = useCallback(({ force }: { force: boolean }) => {
  cancelPending()
  const flush = () => {
    timerRef.current = null
    onSearch(form.getFieldsValue(true))
  }
  const delay = Number.isFinite(debounceMs) ? Math.max(0, debounceMs) : 300
  if (force || delay === 0) flush()
  else timerRef.current = setTimeout(flush, delay)
}, [cancelPending, form, onSearch, debounceMs])

useEffect(() => cancelPending, [cancelPending, scheduleSearch])

const handleValuesChange = () => scheduleSearch({ force: false })
const handleFinish = () => scheduleSearch({ force: true })
```

立即查询也先取消待执行的计时器。例如输入后 100ms 点查询，按钮发出一次请求，剩下的 200ms 不会再补发一次。已经发出的请求不受 `clearTimeout` 影响，仍要在数据请求层处理竞态。

卸载和调度配置变化时，清理函数取消旧任务。调用方应使用 `useCallback` 稳定 `onSearch`；若每次无关渲染都创建新回调，这里的清理也会取消正在等待的搜索。

## 执行时再取值

计时器可以保存最后一次交互的 `allValues` 快照，也可以在执行时读取 Form store。两者的区别在于等待期间通过程序写入的字段值是否参与这次搜索。

这里选择执行时读取 `form.getFieldsValue(true)`，是为了纳入等待期间通过 `setFieldsValue` 写入的值。`true` 会包括 Form store 中保留但未挂载的字段；如果这些字段不应成为搜索条件，要在构造请求参数时筛掉。

## 查询条件也要进入状态

`onSearch` 只做 `setPage(1)` 不够。当前已经在第一页时，页码没有变化，依赖页码的 effect 不会重新查询。可以把已提交的条件和分页放在一个对象里：

```tsx
const [query, setQuery] = useState({ filters: {}, page: 1, pageSize: 10 })

const handleSearch = useCallback((filters: UserQuery) => {
  setQuery((previous) => ({ ...previous, filters, page: 1 }))
}, [])
```

请求 effect 依赖 `query`。每次搜索都会产生新对象，即使页码相同也能触发请求；翻页沿用已提交条件，不会提前使用用户还没完成的输入。

中文输入还需要区分合成中的拼音和最终文字。防抖只处理时间间隔，无法判断用户是否完成选字。这个判断可以放在输入控件里，也可以在查询入口检查合成状态，详见[输入法篇](./2026-09-20-crud-beyond-ime-composition.md)。

实现参考：[FormSearch](https://github.com/cbtpro/action-in-reactjs/tree/main/apps/web/src/components/FormSearch)。事件和取值语义见 [Ant Design Form 文档](https://ant.design/components/form/)。
