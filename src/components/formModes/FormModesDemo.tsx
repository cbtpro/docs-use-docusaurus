import { useState, type ReactNode } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Radio,
  Segmented,
  Select,
  Space,
  message,
} from 'antd'

type Mode = 'create' | 'detail' | 'edit'

interface FormRecord {
  name: string
  age: number | null
  gender: 'male' | 'female' | null
  city: string
  birthday: string
  remark: string
}

// 模拟详情接口返回
const MOCK_RECORD: FormRecord = {
  name: '张三',
  age: 32,
  gender: 'male',
  city: 'shanghai',
  birthday: '1993-04-15',
  remark: '这是一条已有记录的备注',
}

async function submitRecord(values: FormRecord, mode: Mode) {
  await new Promise((r) => setTimeout(r, 500))
  // eslint-disable-next-line no-console
  console.log(`[${mode}] submit`, values)
}

const CITY_OPTIONS = [
  { label: '北京', value: 'beijing' },
  { label: '上海', value: 'shanghai' },
  { label: '广州', value: 'guangzhou' },
  { label: '深圳', value: 'shenzhen' },
]

const GENDER_OPTIONS = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
]

// 只读展示文本:无边框、无背景,看起来像纯文字,但保留跟 Input 一致的 padding 让对齐
function ReadonlyText({ children, block }: { children: ReactNode; block?: boolean }) {
  return (
    <span
      style={{
        display: block ? 'block' : 'inline-block',
        padding: '4px 0',
        lineHeight: '22px',
        color: 'rgba(0,0,0,0.88)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {children ?? '-'}
    </span>
  )
}

// 显式传入 form 订阅字段，详情模式将枚举值转为可读文本。
function Fields({ mode, form }: { mode: Mode; form: ReturnType<typeof Form.useForm<FormRecord>>[0] }) {
  const name = Form.useWatch('name', form)
  const age = Form.useWatch('age', form)
  const gender = Form.useWatch('gender', form)
  const city = Form.useWatch('city', form)
  const birthday = Form.useWatch('birthday', form)
  const remark = Form.useWatch('remark', form)

  const isReadonly = mode === 'detail'

  // 枚举字段:把 code 翻译成人可读 label,没有匹配显示 -
  const genderLabel = GENDER_OPTIONS.find((o) => o.value === gender)?.label ?? '-'
  const cityLabel = CITY_OPTIONS.find((o) => o.value === city)?.label ?? '-'

  return (
    <>
      <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
        {isReadonly ? <ReadonlyText>{name || '-'}</ReadonlyText> : <Input placeholder="请输入" />}
      </Form.Item>

      <Form.Item
        label="年龄"
        name="age"
        rules={[
          { required: true, message: '请输入年龄' },
          { type: 'number', min: 0, max: 150, message: '年龄 0-150' },
        ]}
      >
        {isReadonly ? <ReadonlyText>{age ?? '-'}</ReadonlyText> : <InputNumber placeholder="请输入" style={{ width: '100%' }} />}
      </Form.Item>

      <Form.Item label="性别" name="gender" rules={[{ required: true }]}>
        {isReadonly ? (
          <ReadonlyText>{genderLabel}</ReadonlyText>
        ) : (
          <Radio.Group>
            {GENDER_OPTIONS.map((o) => (
              <Radio key={o.value} value={o.value}>
                {o.label}
              </Radio>
            ))}
          </Radio.Group>
        )}
      </Form.Item>

      <Form.Item label="所在城市" name="city" rules={[{ required: true }]}>
        {isReadonly ? <ReadonlyText>{cityLabel}</ReadonlyText> : <Select placeholder="请选择" options={CITY_OPTIONS} />}
      </Form.Item>

      <Form.Item label="出生日期" name="birthday">
        {isReadonly ? <ReadonlyText>{birthday || '-'}</ReadonlyText> : <Input placeholder="YYYY-MM-DD" />}
      </Form.Item>

      <Form.Item label="备注" name="remark">
        {isReadonly ? <ReadonlyText block>{remark || '-'}</ReadonlyText> : <Input.TextArea placeholder="请输入" rows={2} />}
      </Form.Item>
    </>
  )
}

export default function FormModesDemo() {
  const [record, setRecord] = useState<FormRecord>(MOCK_RECORD)
  const [mode, setMode] = useState<Mode>('create')
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<FormRecord>()

  const isReadonly = mode === 'detail'
  const initialValues = mode === 'create' ? {} : record
  const submitText = mode === 'create' ? '提交' : '保存'

  const switchMode = (next: Mode) => {
    if (submitting) return
    setMode(next)
    form.resetFields()
    form.setFieldsValue(next === 'create'
      ? { name: '', age: null, gender: null, city: '', birthday: '', remark: '' }
      : record)
  }

  const onFinish = async (values: FormRecord) => {
    setSubmitting(true)
    try {
      await submitRecord(values, mode)
      message.success(`${submitText}成功`)
      setRecord(values)
      setMode('detail')
      form.setFieldsValue(values)
    } catch {
      message.error(`${submitText}失败`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card size="small">
      <div style={{ marginBottom: 16 }}>
        <Space>
          <span>当前模式:</span>
          <Segmented
            disabled={submitting}
            value={mode}
            options={[
              { label: '新建', value: 'create' },
              { label: '详情', value: 'detail' },
              { label: '编辑', value: 'edit' },
            ]}
            onChange={(v) => switchMode(v as Mode)}
          />
          <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
            {mode === 'create' && '空表单,可填写,提交创建'}
            {mode === 'detail' && '预填数据,纯文本展示,无控件外观'}
            {mode === 'edit' && '预填数据,可修改,保存后回到详情'}
          </span>
        </Space>
      </div>

      <Form key={mode} disabled={submitting} form={form} layout="vertical" initialValues={initialValues} onFinish={onFinish}>
        <Fields mode={mode} form={form} />

        <Form.Item>
          <Space>
            {mode === 'create' && (
              <Button type="primary" htmlType="submit" loading={submitting}>
                {submitText}
              </Button>
            )}
            {mode === 'edit' && (
              <>
                <Button type="primary" htmlType="submit" loading={submitting}>
                  {submitText}
                </Button>
                <Button
                  disabled={submitting}
                  onClick={() => switchMode('detail')}
                >
                  取消
                </Button>
              </>
            )}
            {isReadonly && (
              <span style={{ color: 'rgba(0,0,0,0.45)' }}>
                详情模式纯只读,无操作按钮。如需编辑请用顶部切换器切到「编辑」。
              </span>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Card>
  )
}
