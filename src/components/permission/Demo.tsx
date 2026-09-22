import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Alert, Button, Card, Dropdown, Popconfirm, Segmented, Space, Tag, message } from 'antd'
import { PermissionGuard, RoleProvider, usePermission, withPermission } from './index'
import type { PermissionCode, RoleKey } from './types'

const ALL_ROLES: RoleKey[] = ['admin', 'manager', 'employee', 'auditor', 'guest']

type RecordStatus = '草稿' | '已提交' | '已通过'

// 一条 mock 数据,演示 customFn 走业务状态校验
function makeRecord(status: RecordStatus) {
  return { id: 'rec-001', status }
}

// 提前封装的带权限按钮(静态配置 + 运行时 props 组合)
const EditButton = withPermission<{ status: RecordStatus }>({
  codes: ['record:edit'],
  fallback: 'disable',
  tooltipText: '无编辑权限',
})(Button)

const DeleteButtonHOC = withPermission({
  codes: ['record:delete'],
  fallback: 'hide',
})(Popconfirm)

function PermissionPanel({ status, setStatus }: {
  status: RecordStatus
  setStatus: Dispatch<SetStateAction<RecordStatus>>
}) {
  const { userRoles, check } = usePermission()
  const record = useMemo(() => makeRecord(status), [status])

  // 次要操作:收集成数组,filter 时调 check
  const secondary = useMemo(() => {
    const items = [
      {
        key: 'submit',
        label: '提交',
        permission: {
          codes: ['record:submit'] as PermissionCode[],
          customFn: (_: RoleKey[], r: unknown) =>
            (r as { status?: RecordStatus })?.status === '草稿',
        },
        onClick: () => {
          setStatus('已提交')
          message.success('已提交')
        },
      },
      {
        key: 'audit',
        label: '审批',
        permission: { codes: ['record:audit'] },
        onClick: () => message.info('审批流程触发'),
      },
      {
        key: 'export',
        label: '导出 PDF',
        permission: { codes: ['record:export'] },
        onClick: () => message.success('已生成 PDF'),
      },
    ]
    return items.filter((item) =>
      check({ ...item.permission, extra: record }),
    )
  }, [check, record, setStatus])

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>当前角色:</span>
        {userRoles.map((r) => (
          <Tag key={r} color="blue">{r}</Tag>
        ))}
        <span style={{ marginLeft: 16 }}>记录状态:</span>
        <Tag color="orange">{record.status}</Tag>
      </div>

      <Space wrap>
        {/* 编辑:disable 模式 + customFn 走 record.status */}
        <EditButton
          type="primary"
          extra={record}
          customFn={(_, r) => (r as { status?: RecordStatus })?.status === '草稿'}
          tooltipText={
            record.status === '草稿'
              ? '当前角色无编辑权限'
              : '已提交/已通过的数据不可编辑'
          }
          onClick={() => message.success('进入编辑页')}
        >
          编辑
        </EditButton>

        {/* 删除:Popconfirm 二次确认 + hide 模式 */}
        <DeleteButtonHOC
          title="确定删除该条记录吗?"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => message.success('已删除')}
        >
          <Button danger>删除</Button>
        </DeleteButtonHOC>

        {/* 审批:PermissionGuard 临时声明 */}
        <PermissionGuard
          codes={['record:approve']}
          fallback="disable"
          tooltipText="审批权限需 admin/manager"
        >
          <Button onClick={() => message.success('已通过审批')}>审批</Button>
        </PermissionGuard>

        {/* 用户管理:hide 模式,整段不渲染 */}
        <PermissionGuard codes={['system:user-manage']} fallback="hide">
          <Button onClick={() => message.success('进入用户管理')}>用户管理</Button>
        </PermissionGuard>

        {/* 更多:Dropdown 收纳次要操作 */}
        {secondary.length > 0 && (
          <Dropdown
            menu={{
              items: secondary.map(({ key, label, onClick }) => ({
                key,
                label,
                onClick,
              })),
            }}
          >
            <Button>
              更多 ▾
            </Button>
          </Dropdown>
        )}
      </Space>

      {userRoles.length === 0 && (
        <Alert
          style={{ marginTop: 12 }}
          type="warning"
          message="未选中任何角色,所有按钮均无权限"
          showIcon
        />
      )}
    </Card>
  )
}

export default function PermissionDemo() {
  const [roles, setRoles] = useState<RoleKey[]>(['employee'])
  const [status, setStatus] = useState<RecordStatus>('草稿')

  // 切换角色:点击 Tag 切换选中状态(可多选)
  const toggleRole = (r: RoleKey) => {
    setRoles((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    )
  }

  const handleStatusChange = (next: RecordStatus) => {
    setStatus(next)
  }

  return (
    <RoleProvider value={{ roles, setRoles }}>
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <strong>切换角色(可多选):</strong>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ALL_ROLES.map((r) => (
              <Tag.CheckableTag
                key={r}
                checked={roles.includes(r)}
                onChange={() => toggleRole(r)}
                style={{
                  border: '1px solid #d9d9d9',
                  borderRadius: 4,
                  padding: '2px 8px',
                }}
              >
                {r}
              </Tag.CheckableTag>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <strong>切换记录状态:</strong>
          <Segmented
            style={{ marginTop: 8 }}
            value={status}
            options={['草稿', '已提交', '已通过']}
            onChange={(v) => handleStatusChange(v as RecordStatus)}
          />
        </div>
      </Card>

      <PermissionPanel status={status} setStatus={setStatus} />
    </RoleProvider>
  )
}
