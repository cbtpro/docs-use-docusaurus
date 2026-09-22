import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Button, Card, Dropdown, Modal, Popconfirm, Popover, Segmented, Space, Tag, message } from 'antd'
import {
  PermissionGuard,
  RoleProvider,
  usePermission,
  withPermission,
} from './index'
import type { PermissionCode, RoleKey } from './types'

const ALL_ROLES: RoleKey[] = ['admin', 'manager', 'employee', 'auditor', 'guest']
type RecordStatus = '草稿' | '已提交' | '已通过'

// withPermission 包住整个 Popconfirm:hide 模式下整组消失
const DeleteWithPopconfirm = withPermission({
  codes: ['record:delete'],
  fallback: 'hide',
})(Popconfirm)

function RowActions({ status, setStatus }: {
  status: RecordStatus
  setStatus: Dispatch<SetStateAction<RecordStatus>>
}) {
  const { userRoles, check } = usePermission()
  // hasAuth 一次性判断(非列表场景):角色管理只 admin 有权限
  const { hasAuth: canRoleManage } = usePermission({ codes: ['system:role-manage'] })
  const handleRoleManage = () => message.success('进入角色管理')
  const record = useMemo(() => ({ id: 'rec-002', status }), [status])

  // 次要操作原始列表(未做权限过滤)
  const secondaryActions = useMemo(() => {
    return [
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
        key: 'exportPdf',
        label: '导出 PDF',
        permission: { codes: ['record:export'] },
        onClick: () => message.success('已生成 PDF'),
      },
    ]
  }, [setStatus])

  // 过滤后的次要操作(Dropdown 用);同一份数据 Popover 也复用,但渲染策略不同
  const secondary = useMemo(
    () =>
      secondaryActions.filter((item) =>
        check({ ...item.permission, extra: record }),
      ),
    [secondaryActions, check, record],
  )

  // Popover 触发器:任一次要操作有权限才显示
  const hasAnySecondary = useMemo(
    () =>
      secondaryActions.some((item) =>
        check({ ...item.permission, extra: record }),
      ),
    [secondaryActions, check, record],
  )

  // Modal.confirm 命令式二次确认
  const handleReset = () => {
    Modal.confirm({
      title: '重置记录状态为草稿?',
      content: '此操作会清除已提交/已通过的标记,不可撤销。',
      okText: '重置',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setStatus('草稿')
        message.success('已重置为草稿')
      },
    })
  }

  // disable 状态下的 hover 提示:用外层 span 监听 mouseenter/leave
  // button disabled 时原生 hover 不触发,得靠外层包装
  const [roleHovering, setRoleHovering] = useState(false)
  const showRolePopover = !canRoleManage && roleHovering

  return (
    <Card size="small">
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>当前角色:</span>
        {userRoles.map((r) => (
          <Tag key={r} color="blue">{r}</Tag>
        ))}
        <span style={{ marginLeft: 16 }}>记录状态:</span>
        <Tag color="orange">{record.status}</Tag>
      </div>

      <Space wrap>
        {/* 主要按钮:编辑(disable + customFn) */}
        <PermissionGuard
          codes={['record:edit']}
          fallback="disable"
          extra={record}
          customFn={(_, r) => (r as { status?: RecordStatus })?.status === '草稿'}
          tooltipText={
            record.status === '草稿'
              ? '当前角色无编辑权限'
              : '已提交/已通过的数据不可编辑'
          }
        >
          <Button type="primary" onClick={() => message.success('进入编辑页')}>
            编辑
          </Button>
        </PermissionGuard>

        {/* Popconfirm:权限包裹整个确认操作,无权限整组消失 */}
        <DeleteWithPopconfirm
          title="确定删除该条记录吗?"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={() => message.success('已删除')}
        >
          <Button danger>删除(二次确认)</Button>
        </DeleteWithPopconfirm>

        {/* 命令式 Modal.confirm:按钮本身由 PermissionGuard 控制,确认弹窗在 onClick 里 */}
        <PermissionGuard
          codes={['record:delete']}
          fallback="disable"
          tooltipText="重置需管理员权限"
        >
          <Button onClick={handleReset}>重置为草稿(Modal)</Button>
        </PermissionGuard>

        {/* Dropdown:收纳次要操作,filter 后只显示有权限的 */}
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
            <Button>更多 ▾</Button>
          </Dropdown>
        )}

        {secondary.length === 0 && (
          <Tag color="default">「更多」无可见项(全部被权限过滤)</Tag>
        )}

        {/* Popover:卡片式更多操作,每个 item 独立判权 */}
        {/* 跟 Dropdown 的差别:content 是任意 ReactNode,适合放带说明的按钮组、表单片段 */}
        {hasAnySecondary && (
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
                {secondaryActions.map(({ key, label, permission, onClick }) => (
                  <PermissionGuard
                    key={key}
                    fallback="hide"
                    extra={record}
                    {...permission}
                  >
                    <Button size="small" block onClick={onClick}>
                      {label}
                    </Button>
                  </PermissionGuard>
                ))}
              </div>
            }
          >
            <Button>更多操作 ⋯</Button>
          </Popover>
        )}

        {/* disable + Popover 提示:跟 Tooltip 的差别是 content 可放富文本 */}
        {/* 这里用 system:role-manage(仅 admin),非 admin 切到时按钮变 disable,hover 弹 Popover */}
        <Popover
          trigger="hover"
          placement="top"
          open={showRolePopover}
          content={
            <div style={{ maxWidth: 240 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>无操作权限</div>
              <div style={{ color: 'rgba(0,0,0,0.65)' }}>
                当前角色不具备该操作的权限,如需开通,请联系管理员。
              </div>
            </div>
          }
        >
          {/* 外层 span 监听 hover:button disabled 时原生 mouseenter 不触发 */}
          <span
            onMouseEnter={() => setRoleHovering(true)}
            onMouseLeave={() => setRoleHovering(false)}
            style={{ display: 'inline-block' }}
          >
            <Button disabled={!canRoleManage} onClick={handleRoleManage}>
              角色管理
            </Button>
          </span>
        </Popover>
      </Space>
    </Card>
  )
}

export default function PopoverConfirmDemo() {
  const [roles, setRoles] = useState<RoleKey[]>(['employee'])
  const [status, setStatus] = useState<RecordStatus>('草稿')

  const toggleRole = (r: RoleKey) => {
    setRoles((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    )
  }

  return (
    <RoleProvider value={{ roles, setRoles }}>
      <Card size="small" style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 8 }}>
          <strong>切换角色(可多选):</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

        <div style={{ marginTop: 12, marginBottom: 8 }}>
          <strong>切换记录状态:</strong>
        </div>
        <Segmented
          value={status}
          options={['草稿', '已提交', '已通过']}
          onChange={(v) => setStatus(v as RecordStatus)}
        />
      </Card>

      <RowActions status={status} setStatus={setStatus} />
    </RoleProvider>
  )
}
