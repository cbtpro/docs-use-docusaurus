import { useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  message,
} from 'antd'

type Role = 'personal' | 'enterprise'

interface FormValues {
  nickname: string
  role: Role
  company?: string
  jobTitle?: string
}

const ROLE_OPTIONS = [
  { label: '个人用户', value: 'personal' },
  { label: '企业员工', value: 'enterprise' },
]

// 未显式传入 form 时，useWatch 从最近的 Form 上下文取实例。
function ConditionalFields() {
  // 订阅 role 字段:role 变化时组件重渲染,决定公司/职位字段是否渲染
  const role = Form.useWatch('role') as Role | undefined
  const isEnterprise = role === 'enterprise'

  return (
    <>
      <Form.Item label="昵称" name="nickname" rules={[{ required: true, message: '请输入昵称' }]}>
        <Input placeholder="请输入昵称" />
      </Form.Item>

      <Form.Item label="用户类型" name="role" rules={[{ required: true, message: '请选择用户类型' }]}>
        <Select placeholder="请选择" options={ROLE_OPTIONS} />
      </Form.Item>

      {/* 条件字段:仅企业员工显示 */}
      {isEnterprise && (
        <>
          <Form.Item
            label="公司名称"
            name="company"
            rules={[{ required: true, message: '请填写公司名称' }]}
          >
            <Input placeholder="请输入公司名称" />
          </Form.Item>
          <Form.Item label="职位" name="jobTitle">
            <Input placeholder="请输入职位名称" />
          </Form.Item>
        </>
      )}
    </>
  )
}

export default function ConditionalFieldsDemo() {
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)

  const onFinish = async (values: FormValues) => {
    setSubmitting(true)
    await new Promise((r) => setTimeout(r, 500))
    setSubmitting(false)

    // 提交时按 role 清掉不该出现的字段(防御性 omit)
    const payload: FormValues = { ...values }
    if (payload.role === 'personal') {
      delete payload.company
      delete payload.jobTitle
    }
    // eslint-disable-next-line no-console
    console.log('submit payload:', payload)
    message.success('提交成功（模拟）')
  }

  // 监听字段变化:切回 personal 时清掉企业字段的值,避免隐藏值被带出去
  // onValuesChange 是 Form 级监听,比 each item onChange 更集中
  const handleValuesChange = (_changed: Partial<FormValues>, all: FormValues) => {
    if (all.role === 'personal') {
      // 清空已退出当前业务分支的字段。
      form.setFields([
        { name: 'company', value: undefined, errors: [] },
        { name: 'jobTitle', value: undefined, errors: [] },
      ])
    }
  }

  return (
    <Card size="small">
      <div style={{ marginBottom: 12, color: 'rgba(0,0,0,0.65)' }}>
        切换用户类型观察:企业员工多出公司/职位字段;切回个人用户时公司/职位字段消失,值也会被清掉,提交时 payload 不带隐藏字段。
      </div>

      <Form
        form={form}
        layout="vertical"
        disabled={submitting}
        initialValues={{ role: 'personal' }}
        onFinish={onFinish}
        onValuesChange={handleValuesChange}
      >
        <ConditionalFields />

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>
              提交
            </Button>
            <Button onClick={() => form.resetFields()}>重置</Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  )
}
