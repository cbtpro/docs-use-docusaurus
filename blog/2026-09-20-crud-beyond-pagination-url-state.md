---
title: CRUD 之外 - 列表页的分页、URL 同步与初始值
authors: [cbtpro]
description: 区分输入草稿与已提交条件，用 URL 驱动分页查询，并处理参数校验、历史导航和旧响应覆盖。
tags:
  - crud
  - 搜索
  - 前端
  - react
  - 表单
  - 状态管理
  - 工程实践
  - 鲁棒性
---

列表页通常同时保存三类信息：输入框里正在编辑的条件、已提交查询的条件，以及页码和每页条数。把它们混在一起，容易出现“已经在第一页，改了条件却不刷新”，或者翻页时意外提交尚未确认的输入。

如果还要求刷新和分享链接后恢复查询，URL 就需要记录已提交的条件。下面用 URL 驱动查询，表单只保留编辑中的值。

{/* truncate */}

## URL 保存已提交查询

`setPage(1)` 无法独自表达一次搜索。同样，额外加一个 `searchVersion` 虽然能触发查询，也仍需处理表单值、页码和 URL 之间的同步。

另一种做法是直接从 URL 解析查询。提交搜索和翻页都更新 URL，请求 effect 只读解析后的结果。下面是 React Router 数据路由中的接入骨架，`queryFormRecords`、表格列和下拉选项由业务提供。

```tsx title="解析与校验查询参数"
interface QueryForm {
  keyword?: string
  role?: string
  status?: string
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseQuery(search: string) {
  const params = new URLSearchParams(search)
  const size = positiveInteger(params.get('pageSize'), 10)
  return {
    keyword: params.get('keyword') ?? '',
    role: params.get('role') ?? '',
    status: params.get('status') ?? '',
    page: positiveInteger(params.get('page'), 1),
    pageSize: [10, 20, 50, 100].includes(size) ? size : 10,
  }
}
```

页码按正整数校验，缺项、负数、小数及非有限值都回退到默认值。每页条数使用允许列表，前后端保持相同的容量上限。

```tsx title="URL、表单和请求的连接"
const [form] = Form.useForm<QueryForm>()
const location = useLocation()
const [urlParams, setUrlParams] = useSearchParams()
const query = useMemo(() => parseQuery(location.search), [location.search])
const [reload, setReload] = useState(0)

useEffect(() => {
  form.setFieldsValue({ keyword: query.keyword, role: query.role, status: query.status })
}, [form, query])

const commitQuery = useCallback((next: ReturnType<typeof parseQuery>) => {
  const params = new URLSearchParams(urlParams)
  for (const name of ['keyword', 'role', 'status'] as const) {
    if (next[name]) params.set(name, next[name])
    else params.delete(name)
  }
  params.set('page', String(next.page))
  params.set('pageSize', String(next.pageSize))
  if (params.toString() === urlParams.toString()) {
    setReload((version) => version + 1)
  } else {
    setUrlParams(params, { replace: true })
  }
}, [urlParams, setUrlParams])

const handleSearch = useCallback((values: QueryForm) => {
  commitQuery({
    ...query,
    keyword: values.keyword ?? '',
    role: values.role ?? '',
    status: values.status ?? '',
    page: 1,
  })
}, [commitQuery, query])

const handlePageChange = (page: number, pageSize: number) => {
  commitQuery({ ...query, page: pageSize === query.pageSize ? page : 1, pageSize })
}
```

搜索提交使用回调参数，翻页使用上次已提交的 `query`。相同参数下再次点查询，用 `reload` 显式刷新。`replace: true` 适合输入即搜索；如果产品希望后退时逐次恢复查询，可以对手动提交用 push，对自动搜索用 replace。

URL 变化也会回填表单，因而浏览器前进、后退和同路由跳转都能更新字段。`setFieldsValue` 不触发 `onValuesChange`，不会因为回填产生循环查询。重置按钮显式提交默认查询条件，表单再跟随 URL 回填。

## 只采用当前查询的响应

```tsx title="请求 effect"
useEffect(() => {
  let active = true
  setLoading(true)
  setError(null)
  void (async () => {
    try {
      const result = await queryFormRecords(query)
      if (!active) return
      setData(result.list)
      setTotal(result.total)
    } catch (error) {
      if (active) setError(error instanceof Error ? error.message : '查询失败')
    } finally {
      if (active) setLoading(false)
    }
  })()
  return () => { active = false }
}, [query, reload])
```

`active` 随每次 effect 创建。查询改变或页面卸载后，旧响应和旧 `finally` 都不再写状态。接口支持 `AbortSignal` 时，还可以在清理时取消请求，减少无用的传输和解析。

URL 在请求前更新，表示用户希望查看的查询。请求失败时显示错误并允许重试。保留旧数据时，同步标记“更新失败”，让查询条件和结果的关系清楚可见。

这个骨架的首次请求直接读取 URL，无需等表单挂载。异步默认条件则应先加载完成，再更新 URL 或启用查询。表格可用 `pagination={false}` 配独立 Pagination；搜索组件的 `onSearch` 接 `handleSearch`，分页回调接 `handlePageChange`。

相关项目：[action-in-reactjs](https://github.com/cbtpro/action-in-reactjs)。
