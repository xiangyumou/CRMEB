'use client';

import { Button, Drawer, Input, Modal, Space, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import {
  userAdminBatchSetGroups,
  userAdminBatchSetLabels,
  userAdminDetail,
  userAdminList,
  userAdminResetPassword,
  userAdminSetStatus,
  userAdminUpdate,
} from '@shop/contracts/user/user.admin.contract';
import { userGroupList, userLabelList } from '@shop/contracts/user/user.taxonomy.contract';
import { adminUserForm, type AdminUserListItem } from '@shop/contracts/user/schemas';

import { useRouteMutation, useRouteQuery } from '@/admin/api/hooks';
import { DescriptionsCard } from '@/admin/kit/descriptions-card';
import { ModalForm, useFormModal } from '@/admin/kit/form/modal-form';
import { InstantText } from '@/admin/kit/instant-text';
import { PageContainer } from '@/admin/kit/page-container';
import { StatusTag, statusOptions } from '@/admin/kit/status-tag';
import {
  actionsColumn,
  enumColumn,
  idColumn,
  instantColumn,
  textColumn,
} from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';
import { Can } from '@/admin/session/can';

import { REGISTER_SOURCE, USER_STATUS } from '../user-enums';

/**
 * 用户列表.
 *
 * Three things here are deliberate and easy to get wrong the other way:
 *
 *  - the list shows a **masked** number (`138****8000`). An operator browsing
 *    ten thousand customers has no business reading every number, and a
 *    screenshot of the legacy table was a leak. The unmasked one is on the
 *    detail route, which carries its own permission;
 *  - 禁用 and 重置密码 sit behind their own permission atoms, not 编辑's,
 *    because they end every live session of a paying customer while renaming a
 *    nickname does not;
 *  - the group and label pickers are fed by the taxonomy routes, so a group
 *    added on the next page is selectable here without a deploy.
 */
export function CustomersPage() {
  const edit = useFormModal<AdminUserListItem>();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [resetting, setResetting] = useState<AdminUserListItem | null>(null);

  const groups = useRouteQuery(userGroupList, { query: { page: 1, pageSize: 100 } });
  const labels = useRouteQuery(userLabelList, { query: { page: 1, pageSize: 200 } });

  const groupOptions = (groups.data?.items ?? []).map((group) => ({
    value: group.id,
    label: group.name,
  }));
  const labelOptions = (labels.data?.items ?? []).map((label) => ({
    value: label.id,
    label: label.categoryName ? `${label.categoryName} / ${label.name}` : label.name,
  }));

  const setStatus = useRouteMutation(userAdminSetStatus, {
    invalidate: [userAdminList],
    successMessage: '已更新状态',
  });
  const setGroups = useRouteMutation(userAdminBatchSetGroups, { invalidate: [userAdminList] });
  const setLabels = useRouteMutation(userAdminBatchSetLabels, { invalidate: [userAdminList] });

  return (
    <PageContainer subTitle="商城注册用户；列表里的手机号是打码的，完整号码在详情里">
      <CrudTable
        route={userAdminList}
        scrollX={1500}
        filters={[
          { kind: 'text', name: 'keyword', label: '账号/手机号/昵称' },
          { kind: 'select', name: 'status', label: '状态', options: statusOptions(USER_STATUS) },
          {
            kind: 'select',
            name: 'registerSource',
            label: '注册来源',
            options: statusOptions(REGISTER_SOURCE),
          },
          { kind: 'select', name: 'groupId', label: '分组', options: groupOptions },
          { kind: 'select', name: 'labelId', label: '标签', options: labelOptions },
          {
            kind: 'select',
            name: 'hasWechat',
            label: '微信绑定',
            options: [
              { value: 'true', label: '已绑定' },
              { value: 'false', label: '未绑定' },
            ],
          },
          { kind: 'dateRange', names: ['createdFrom', 'createdTo'], label: '注册时间' },
        ]}
        batchActions={({ selectedRowKeys, clear }) => {
          const userIds = selectedRowKeys.map(String);
          return (
            <Can permission="user:customer:write">
              <Space>
                <BatchPicker
                  label="设置分组"
                  noun="分组"
                  options={groupOptions}
                  count={userIds.length}
                  pending={setGroups.isPending}
                  onSubmit={async (selected) => {
                    const result = await setGroups.mutateAsync({
                      body: { userIds, groupIds: selected, mode: 'replace' },
                    });
                    void message.success(`已更新 ${result.affected} 个用户`);
                    clear();
                  }}
                />
                <BatchPicker
                  label="设置标签"
                  noun="标签"
                  options={labelOptions}
                  count={userIds.length}
                  pending={setLabels.isPending}
                  onSubmit={async (selected) => {
                    const result = await setLabels.mutateAsync({
                      body: { userIds, labelIds: selected, mode: 'replace' },
                    });
                    void message.success(`已更新 ${result.affected} 个用户`);
                    clear();
                  }}
                />
              </Space>
            </Can>
          );
        }}
        columns={[
          idColumn<AdminUserListItem>({ sortable: true }),
          textColumn<AdminUserListItem>({ title: '账号', dataIndex: 'account', ellipsis: true }),
          textColumn<AdminUserListItem>({ title: '手机号', dataIndex: 'phone', width: 130 }),
          textColumn<AdminUserListItem>({ title: '昵称', dataIndex: 'nickname', ellipsis: true }),
          enumColumn<AdminUserListItem, AdminUserListItem['status']>({
            title: '状态',
            dataIndex: 'status',
            map: USER_STATUS,
          }),
          enumColumn<AdminUserListItem, NonNullable<AdminUserListItem['registerSource']>>({
            title: '注册来源',
            dataIndex: 'registerSource',
            map: REGISTER_SOURCE,
            width: 120,
          }),
          {
            title: '分组 / 标签',
            key: 'taxonomy',
            width: 220,
            render: (_value: unknown, row: AdminUserListItem) =>
              row.groups.length + row.labels.length === 0 ? (
                <Typography.Text type="secondary">—</Typography.Text>
              ) : (
                <Space size={[0, 4]} wrap>
                  {row.groups.map((group) => (
                    <Tag key={`g${group.id}`} color="blue">
                      {group.name}
                    </Tag>
                  ))}
                  {row.labels.map((label) => (
                    <Tag key={`l${label.id}`}>{label.name}</Tag>
                  ))}
                </Space>
              ),
          },
          instantColumn<AdminUserListItem>({
            title: '最近登录',
            dataIndex: 'lastLoginAt',
            sortable: true,
          }),
          instantColumn<AdminUserListItem>({
            title: '注册时间',
            dataIndex: 'createdAt',
            sortable: true,
          }),
          actionsColumn<AdminUserListItem>({
            width: 250,
            render: (row) => (
              <>
                <Button type="link" size="small" onClick={() => setDetailId(row.id)}>
                  详情
                </Button>
                <Can permission="user:customer:write">
                  <Button type="link" size="small" onClick={() => edit.show(row)}>
                    编辑
                  </Button>
                </Can>
                <Can permission="user:customer:status">
                  <Button
                    type="link"
                    size="small"
                    danger={row.status === 'active'}
                    loading={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({
                        params: { id: row.id },
                        body: { status: row.status === 'active' ? 'disabled' : 'active' },
                      })
                    }
                  >
                    {row.status === 'active' ? '禁用' : '启用'}
                  </Button>
                </Can>
                <Can permission="user:customer:password">
                  <Button type="link" size="small" onClick={() => setResetting(row)}>
                    重置密码
                  </Button>
                </Can>
              </>
            ),
          }),
        ]}
      />

      <ModalForm
        {...edit.props}
        title={`编辑用户 ${edit.record?.account ?? ''}`}
        schema={adminUserForm}
        columns={2}
        fields={[
          { kind: 'text', name: 'nickname', label: '昵称' },
          { kind: 'text', name: 'realName', label: '真实姓名' },
          { kind: 'date', name: 'birthday', label: '生日' },
          {
            kind: 'select',
            name: 'groupIds',
            label: '分组',
            mode: 'multiple',
            options: groupOptions,
          },
          {
            kind: 'select',
            name: 'labelIds',
            label: '标签',
            mode: 'multiple',
            options: labelOptions,
          },
          { kind: 'textarea', name: 'adminRemark', label: '管理员备注', span: 24, rows: 2 },
        ]}
        initialValues={
          edit.record
            ? {
                ...(edit.record.nickname === null ? {} : { nickname: edit.record.nickname }),
                groupIds: edit.record.groups.map((group) => group.id),
                labelIds: edit.record.labels.map((label) => label.id),
              }
            : undefined
        }
        route={userAdminUpdate}
        toInput={(values) => ({ params: { id: edit.record?.id ?? '' }, body: values })}
        invalidate={[userAdminList]}
        successMessage="已保存"
      />

      <ResetPasswordModal record={resetting} onClose={() => setResetting(null)} />

      <CustomerDrawer id={detailId} onClose={() => setDetailId(null)} />
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// detail
// ---------------------------------------------------------------------------

/**
 * The detail drawer.
 *
 * Orders and coupons are deliberately *not* fetched here: they are the owning
 * domains' own admin lists filtered by `userId`, so this page never reads
 * another domain's tables and a change to the order list cannot break it.
 */
function CustomerDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useRouteQuery(userAdminDetail, id === null ? undefined : { params: { id } }, {
    enabled: id !== null,
  });
  const row = detail.data;

  return (
    <Drawer open={id !== null} onClose={onClose} width={720} title="用户详情" destroyOnHidden>
      <DescriptionsCard
        loading={detail.isLoading}
        column={2}
        items={[
          { label: 'ID', value: row?.id ?? '—' },
          { label: '账号', value: row?.account ?? '—' },
          { label: '手机号', value: row?.phone ?? '未绑定' },
          { label: '昵称', value: row?.nickname ?? '—' },
          { label: '真实姓名', value: row?.realName ?? '—' },
          {
            label: '状态',
            value: row ? <StatusTag value={row.status} map={USER_STATUS} /> : '—',
          },
          {
            label: '注册来源',
            value: row?.registerSource ? (
              <StatusTag value={row.registerSource} map={REGISTER_SOURCE} />
            ) : (
              '—'
            ),
          },
          { label: '登录密码', value: row?.hasPassword ? '已设置' : '未设置（仅验证码登录）' },
          {
            label: '微信绑定',
            value:
              row && row.boundWechat.length > 0
                ? row.boundWechat
                    .map((platform) => (platform === 'oa' ? '公众号' : '小程序'))
                    .join('、')
                : '未绑定',
          },
          { label: '收货地址', value: row ? `${row.addressCount} 条` : '—' },
          { label: '注册 IP', value: row?.registerIp ?? '—' },
          { label: '最近登录 IP', value: row?.lastLoginIp ?? '—' },
          { label: '最近登录', value: <InstantText value={row?.lastLoginAt ?? null} /> },
          { label: '注册时间', value: <InstantText value={row?.createdAt ?? null} /> },
          { label: '分组', value: row?.groups.map((group) => group.name).join('、') || '—' },
          { label: '标签', value: row?.labels.map((label) => label.name).join('、') || '—' },
          { label: '管理员备注', value: row?.adminRemark ?? '—', span: 2 },
          {
            label: '注销时间',
            value: <InstantText value={row?.deletedAt ?? null} />,
            hidden: !row?.deletedAt,
            span: 2,
          },
        ]}
      />
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

/**
 * 重置密码.
 *
 * The new password is typed by the operator and read out to the customer: it is
 * never mailed and never returned by the route. Every live session of that
 * account dies, which is the feature — a reset is what support does when an
 * account is suspected stolen.
 */
function ResetPasswordModal({
  record,
  onClose,
}: {
  record: AdminUserListItem | null;
  onClose: () => void;
}) {
  const [password, setPassword] = useState('');
  const reset = useRouteMutation(userAdminResetPassword, {
    onSuccess: (result) => {
      void message.success(`已重置，注销了 ${result.revokedSessions} 个登录态`);
      setPassword('');
      onClose();
    },
  });

  return (
    <Modal
      open={record !== null}
      title={`重置 ${record?.account ?? ''} 的登录密码`}
      okText="确认重置"
      okButtonProps={{ disabled: password.length < 6 }}
      confirmLoading={reset.isPending}
      destroyOnHidden
      onCancel={() => {
        setPassword('');
        onClose();
      }}
      onOk={() => {
        if (record) reset.mutate({ params: { id: record.id }, body: { password } });
      }}
    >
      <Typography.Paragraph type="secondary">
        重置后该用户的所有登录态立即失效，需要用新密码重新登录。密码请当面或电话告知本人，系统不会发送。
      </Typography.Paragraph>
      <Input.Password
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="6-64 位"
        maxLength={64}
      />
    </Modal>
  );
}

/** 批量设置分组 / 标签 for the ticked rows. */
function BatchPicker({
  label,
  noun,
  options,
  count,
  pending,
  onSubmit,
}: {
  label: string;
  noun: string;
  options: Array<{ value: string; label: string }>;
  count: number;
  pending: boolean;
  onSubmit: (selected: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <>
      <Button size="small" disabled={count === 0} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        title={`${label}（已选 ${count} 个用户）`}
        okText="覆盖设置"
        confirmLoading={pending}
        destroyOnHidden
        onCancel={() => setOpen(false)}
        onOk={() => {
          onSubmit(selected).then(
            () => {
              setSelected([]);
              setOpen(false);
            },
            () => {
              /* the global presenter already showed the failure */
            },
          );
        }}
      >
        <Typography.Paragraph type="secondary">
          覆盖设置：所选用户的{noun}将被替换为下面勾选的内容，全部不选即清空。
        </Typography.Paragraph>
        <Space size={[8, 8]} wrap>
          {options.map((option) => (
            <Tag.CheckableTag
              key={option.value}
              checked={selected.includes(option.value)}
              onChange={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...current, option.value]
                    : current.filter((value) => value !== option.value),
                )
              }
            >
              {option.label}
            </Tag.CheckableTag>
          ))}
          {options.length === 0 ? (
            <Typography.Text type="secondary">暂无可选项</Typography.Text>
          ) : null}
        </Space>
      </Modal>
    </>
  );
}
