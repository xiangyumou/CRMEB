'use client';

import { Alert, Button, Input, Modal, Typography } from 'antd';
import { useState } from 'react';
import {
  userAdminApproveCancellation,
  userAdminCancellationList,
  userAdminRejectCancellation,
  userAdminRemarkCancellation,
} from '@shop/contracts/user/user.admin.contract';
import type { CancellationRequest } from '@shop/contracts/user/schemas';

import { useRouteMutation } from '@/admin/api/hooks';
import { PageContainer } from '@/admin/kit/page-container';
import { statusOptions } from '@/admin/kit/status-tag';
import {
  actionsColumn,
  enumColumn,
  idColumn,
  instantColumn,
  textColumn,
} from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';
import { Can } from '@/admin/session/can';

import { CANCELLATION_STATUS } from '../user-enums';

type Decision = 'approve' | 'reject' | 'remark';

/**
 * 注销申请.
 *
 * Approving is irreversible and is spelled out in the dialog: the account is
 * anonymised and every session ends, but the row stays, because orders, refunds
 * and invoices point at that id and a hard delete would either take a
 * customer's purchase history with it or fail on a foreign key at 2am.
 *
 * The nickname and phone shown here are the frozen copies taken when the
 * request was filed — after approval the `users` row no longer has them, and a
 * reviewer looking at last month's list would otherwise see only an id.
 */
export function CancellationsPage() {
  const [open, setOpen] = useState<{ row: CancellationRequest; decision: Decision } | null>(null);

  return (
    <PageContainer subTitle="用户在 App 内提交的账号注销申请；通过后账号会被匿名化且无法恢复">
      <CrudTable
        route={userAdminCancellationList}
        scrollX={1200}
        filters={[
          { kind: 'text', name: 'keyword', label: '昵称/手机号' },
          {
            kind: 'select',
            name: 'status',
            label: '状态',
            options: statusOptions(CANCELLATION_STATUS),
          },
        ]}
        columns={[
          idColumn<CancellationRequest>({ sortable: true }),
          textColumn<CancellationRequest>({ title: '用户 ID', dataIndex: 'userId', width: 100 }),
          textColumn<CancellationRequest>({ title: '昵称', dataIndex: 'nickname', ellipsis: true }),
          textColumn<CancellationRequest>({ title: '手机号', dataIndex: 'phone', width: 130 }),
          textColumn<CancellationRequest>({ title: '原因', dataIndex: 'reason', ellipsis: true }),
          enumColumn<CancellationRequest, CancellationRequest['status']>({
            title: '状态',
            dataIndex: 'status',
            map: CANCELLATION_STATUS,
          }),
          textColumn<CancellationRequest>({
            title: '审核备注',
            dataIndex: 'reviewRemark',
            ellipsis: true,
          }),
          instantColumn<CancellationRequest>({ title: '审核时间', dataIndex: 'reviewedAt' }),
          instantColumn<CancellationRequest>({
            title: '申请时间',
            dataIndex: 'createdAt',
            sortable: true,
          }),
          actionsColumn<CancellationRequest>({
            width: 190,
            render: (row) => (
              <Can permission="user:cancellation:review">
                {row.status === 'pending' ? (
                  <>
                    <Button
                      type="link"
                      size="small"
                      danger
                      onClick={() => setOpen({ row, decision: 'approve' })}
                    >
                      通过
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => setOpen({ row, decision: 'reject' })}
                    >
                      拒绝
                    </Button>
                  </>
                ) : null}
                <Button
                  type="link"
                  size="small"
                  onClick={() => setOpen({ row, decision: 'remark' })}
                >
                  备注
                </Button>
              </Can>
            ),
          }),
        ]}
      />

      <ReviewModal state={open} onClose={() => setOpen(null)} />
    </PageContainer>
  );
}

const COPY: Record<Decision, { title: string; ok: string; success: string; hint: string }> = {
  approve: {
    title: '通过注销申请',
    ok: '确认通过',
    success: '已通过',
    hint: '账号将被匿名化：账号名、手机号、昵称、头像、真实姓名与备注全部清空，所有登录态立即失效。历史订单会保留，但无法恢复该账号。',
  },
  reject: {
    title: '拒绝注销申请',
    ok: '确认拒绝',
    success: '已拒绝',
    hint: '用户可以重新提交申请。建议在备注里写明原因，客服会看到。',
  },
  remark: {
    title: '添加备注',
    ok: '保存备注',
    success: '已保存',
    hint: '只记录一条备注，不改变申请状态。',
  },
};

function ReviewModal({
  state,
  onClose,
}: {
  state: { row: CancellationRequest; decision: Decision } | null;
  onClose: () => void;
}) {
  const [remark, setRemark] = useState('');
  const decision = state?.decision ?? 'remark';
  const copy = COPY[decision];

  const options = {
    invalidate: [userAdminCancellationList],
    successMessage: copy.success,
    onSuccess: () => {
      setRemark('');
      onClose();
    },
  } as const;
  const approve = useRouteMutation(userAdminApproveCancellation, options);
  const reject = useRouteMutation(userAdminRejectCancellation, options);
  const remarkOnly = useRouteMutation(userAdminRemarkCancellation, options);
  const pending = approve.isPending || reject.isPending || remarkOnly.isPending;

  const submit = () => {
    if (!state) return;
    const params = { id: state.row.id };
    // `remark` is optional on the review bodies and required on the remark one,
    // and `exactOptionalPropertyTypes` means an empty string may not be sent as
    // `undefined` — so the key is omitted rather than nulled.
    const body = remark.trim() === '' ? {} : { remark: remark.trim() };
    if (decision === 'approve') approve.mutate({ params, body });
    else if (decision === 'reject') reject.mutate({ params, body });
    else remarkOnly.mutate({ params, body: { remark: remark.trim() } });
  };

  return (
    <Modal
      open={state !== null}
      title={copy.title}
      okText={copy.ok}
      okButtonProps={{
        danger: decision === 'approve',
        disabled: decision === 'remark' && remark.trim() === '',
      }}
      confirmLoading={pending}
      destroyOnHidden
      onCancel={() => {
        setRemark('');
        onClose();
      }}
      onOk={submit}
    >
      <Typography.Paragraph>
        用户 <Typography.Text strong>{state?.row.nickname ?? state?.row.userId}</Typography.Text>（
        {state?.row.phone ?? '无手机号'}）的申请
        {state?.row.reason ? `：${state.row.reason}` : ''}
      </Typography.Paragraph>
      <Alert
        type={decision === 'approve' ? 'warning' : 'info'}
        showIcon
        message={copy.hint}
        style={{ marginBottom: 12 }}
      />
      <Input.TextArea
        value={remark}
        onChange={(event) => setRemark(event.target.value)}
        placeholder={decision === 'remark' ? '备注内容' : '审核备注（可留空）'}
        maxLength={255}
        showCount
        rows={3}
      />
    </Modal>
  );
}
