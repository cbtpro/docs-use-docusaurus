import { useState } from 'react'
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FormInstance, FormListFieldData } from 'antd'

const { Text } = Typography
const { TextArea } = Input

interface Candidate {
  id: string
  name: string
  position: string
  round: string
}

interface ScoreItem {
  candidateId: string
  candidateName: string
  position: string
  score?: number
  feedback?: string
}

// 模拟候选人数据
const MOCK_CANDIDATES: Candidate[] = [
  { id: 'c1', name: '张三', position: '前端工程师', round: '二面' },
  { id: 'c2', name: '李四', position: '前端工程师', round: '二面' },
  { id: 'c3', name: '王五', position: '前端工程师', round: '二面' },
  { id: 'c4', name: '赵六', position: '前端工程师', round: '二面' },
  { id: 'c5', name: '钱七', position: '前端工程师', round: '二面' },
]

type View = 'list' | 'score'

function ScoreCard({
  field,
  form,
}: {
  field: FormListFieldData
  form: FormInstance
}) {
  const candidateName = Form.useWatch(
    ['scores', field.name, 'candidateName'],
    { form, preserve: true },
  ) as string | undefined
  const position = Form.useWatch(
    ['scores', field.name, 'position'],
    { form, preserve: true },
  ) as string | undefined

  return (
    <Card size="small" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <Space>
          <Text strong>{candidateName}</Text>
          <Tag color="blue">{position}</Tag>
        </Space>
      </div>
      <Row gutter={16}>
        <Col xs={24} sm={6}>
          <Form.Item
            label="综合评分"
            name={[field.name, 'score']}
            rules={[{ required: true, message: '请填写评分' }, { type: 'number', min: 0, max: 100, message: '评分须在 0 到 100 之间' }]}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="0-100" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={18}>
          <Form.Item label="评语" name={[field.name, 'feedback']}>
            <TextArea rows={2} placeholder="评语(可选)" />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  )
}

export default function BatchScoreDemo() {
  const [view, setView] = useState<View>('list')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<{ scores: ScoreItem[] }>()

  // 列表列定义(简化版,只保留必要列)
  const columns: ColumnsType<Candidate> = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '岗位', dataIndex: 'position', key: 'position' },
    { title: '轮次', dataIndex: 'round', key: 'round' },
  ]

  // 按候选人 ID 合并草稿，保留补选前已填写的评分。
  const goScoreView = () => {
    if (selectedIds.length === 0) {
      message.warning('请先在列表勾选候选人')
      return
    }
    const drafts = new Map((form.getFieldValue('scores') as ScoreItem[] | undefined ?? [])
      .map((item) => [item.candidateId, item]))
    const selected = MOCK_CANDIDATES.filter((c) => selectedIds.includes(c.id))
    form.setFieldsValue({
      scores: selected.map((c) => ({
        candidateId: c.id,
        candidateName: c.name,
        position: c.position,
        score: drafts.get(c.id)?.score,
        feedback: drafts.get(c.id)?.feedback,
      })),
    })
    setView('score')
  }

  const handleSubmit = async (values: { scores: ScoreItem[] }) => {
    if (values.scores.length === 0 || submitting) return
    setSubmitting(true)
    await new Promise((r) => setTimeout(r, 600))
    setSubmitting(false)
    // eslint-disable-next-line no-console
    console.log('submit payload:', values.scores)
    message.success(`已提交 ${values.scores.length} 条评分（模拟）`)
    // 提交完清空选择回到列表
    form.resetFields()
    setSelectedIds([])
    setView('list')
  }

  const rowSelection = {
    selectedRowKeys: selectedIds,
    onChange: (keys: React.Key[]) => setSelectedIds(keys as string[]),
  }

  return (
    <Card size="small">
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <span>当前视图:</span>
          <Segmented
            disabled={submitting}
            value={view}
            options={[
              { label: '候选人列表(勾选)', value: 'list' },
              { label: '批量评分', value: 'score' },
            ]}
            onChange={(v) => {
              if (v === 'score') {
                goScoreView()
              } else {
                setView('list')
              }
            }}
          />
        </Space>
        {view === 'list' ? (
          <Button type="primary" disabled={selectedIds.length === 0} onClick={goScoreView}>
            进入评分({selectedIds.length})
          </Button>
        ) : (
          <Button disabled={submitting} onClick={() => setView('list')}>返回列表补选</Button>
        )}
      </div>

      {view === 'list' ? (
        <>
          <div style={{ marginBottom: 8, color: 'rgba(0,0,0,0.65)' }}>
            勾选候选人后点击「进入评分」。返回补选时，已填写的评分会保留。
          </div>
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={MOCK_CANDIDATES}
            rowSelection={rowSelection}
            pagination={{ pageSize: 5, showSizeChanger: false }}
          />
        </>
      ) : (
        <>
          <div style={{ marginBottom: 12, color: 'rgba(0,0,0,0.65)' }}>
            为每位候选人填写评分，完成后统一提交。
          </div>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            disabled={submitting}
            validateTrigger={[]}
          >
            <Form.List name="scores">
              {(fields) => (
                <>
                  {fields.length === 0 ? (
                    <Empty description="未选择候选人,请返回列表勾选" />
                  ) : (
                    fields.map((field) => (
                      <ScoreCard key={field.key} field={field} form={form} />
                    ))
                  )}
                </>
              )}
            </Form.List>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={submitting}>
                  提交评分
                </Button>
                <Button onClick={() => {
                  const scores = form.getFieldValue('scores') as ScoreItem[]
                  form.setFieldValue('scores', scores.map(({ score, feedback, ...candidate }) => ({
                    ...candidate, score: undefined, feedback: undefined,
                  })))
                }}>重置评分</Button>
              </Space>
            </Form.Item>
          </Form>
        </>
      )}
    </Card>
  )
}
