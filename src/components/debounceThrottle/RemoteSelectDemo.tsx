import { useRef, useState } from 'react'
import { Card, Select, Tag } from 'antd'
import { useDebouncedCallback } from './hooks'

// mock 城市数据,模拟后端可检索的全集
const CITIES = [
  '北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '成都',
  '武汉', '西安', '天津', '重庆', '青岛', '大连', '厦门', '福州',
  '长沙', '郑州', '合肥', '南昌',
]

type CityOption = { label: string; value: string }

// 模拟远程查询:按关键字过滤 mock 数据,延迟 200ms 返回,制造网络时延
function fetchRemoteCities(keyword: string): Promise<CityOption[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const list = CITIES.filter((c) => c.includes(keyword)).map((c) => ({
        label: c,
        value: c,
      }))
      resolve(list)
    }, 200)
  })
}

// 下拉框远程搜索演示:防抖 300ms + 请求序号竞态保护
export default function RemoteSelectDemo() {
  const [options, setOptions] = useState<CityOption[]>([])
  const [loading, setLoading] = useState(false)
  // 已发起远程请求次数
  const [requestCount, setRequestCount] = useState(0)
  // 最近一次请求的关键字(发出时记录)
  const [lastRequestKeyword, setLastRequestKeyword] = useState('—')
  // 当前展示结果的来源关键字(响应被采纳时记录)
  const [resultSourceKeyword, setResultSourceKeyword] = useState('—')

  // 请求序号:每次发请求递增,响应回来比对,丢弃过期响应,避免竞态
  const requestIdRef = useRef(0)

  const handleSearch = useDebouncedCallback(async (keyword: string) => {
    // 空关键字:清空结果,不发远程请求
    if (!keyword) {
      setOptions([])
      setLoading(false)
      setResultSourceKeyword('—')
      return
    }

    // 递增请求序号,记录本次关键字与计数
    const id = ++requestIdRef.current
    setRequestCount((c) => c + 1)
    setLastRequestKeyword(keyword)
    setLoading(true)

    const list = await fetchRemoteCities(keyword)
    // 竞态保护:若期间又发起新请求,本次响应作废,不更新视图
    if (id !== requestIdRef.current) return

    setOptions(list)
    setLoading(false)
    setResultSourceKeyword(keyword)
  }, 300)

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <div
        style={{
          marginBottom: 12,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Tag color="blue">已发请求:{requestCount}</Tag>
        <Tag color={loading ? 'processing' : 'default'}>
          {loading ? '加载中…' : '已就绪'}
        </Tag>
        <Tag color="purple">最近请求:{lastRequestKeyword}</Tag>
        <Tag color="green">结果来源:{resultSourceKeyword}</Tag>
      </div>

      <Select
        showSearch
        allowClear
        placeholder="输入城市名搜索(如:南)"
        filterOption={false}
        style={{ width: '100%' }}
        options={options}
        loading={loading}
        onSearch={handleSearch}
        notFoundContent={loading ? '搜索中…' : '暂无数据'}
      />
    </Card>
  )
}
