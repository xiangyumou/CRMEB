'use client';

import { Alert, Button, Drawer, Space, Table, Tag, Timeline, Typography } from 'antd';
import { useState } from 'react';
import {
  refundAdminApprove,
  refundAdminDetail,
  refundAdminList,
  refundAdminReceiveReturn,
  refundAdminReject,
  refundAdminRemark,
  refundAdminRetry,
} from '@shop/contracts/refund/refund.admin.contract';
import {
  refundApproveBody,
  refundRejectBody,
  refundRemarkBody,
  type AdminRefundListItem,
  type RefundItem,
} from '@shop/contracts/refund/schemas';

import { useRouteQuery } from '@/admin/api/hooks';
import { ConfirmButton } from '@/admin/kit/confirm-button';
import { DescriptionsCard } from '@/admin/kit/descriptions-card';
import { ModalForm, useFormModal } from '@/admin/kit/form/modal-form';
import { InstantText } from '@/admin/kit/instant-text';
import { MoneyText } from '@/admin/kit/money-text';
import { PageContainer } from '@/admin/kit/page-container';
import { StatusTag } from '@/admin/kit/status-tag';
import {
  actionsColumn,
  enumColumn,
  idColumn,
  instantColumn,
  moneyColumn,
  textColumn,
} from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';
import { Can } from '@/admin/session/can';

import { REFUND_KIND, REFUND_RETURN_STAGE, REFUND_STATUS, optionsOf } from '../trade-enums';

/**
 * 售后单 — the review desk.
 *
 * The order of the buttons is the order of the decisions, and they are
 * deliberately different decisions with different permissions:
 *
 *  - **同意 / 拒绝** (`refund:request:review`) say whether the customer is owed
 *    money. Approving a 仅退款 queues the gateway call immediately; approving a
 *    退货退款 only asks the buyer to ship the goods back.
 *  - **确认收货** (`refund:request:execute`) says the goods arrived, and *that*
 *    is what releases the money on a 退货退款.
 *  - **重试** (`refund:request:execute`) re-drives a refund that failed or came
 *    back unknown. It asks WeChat about the **frozen** `outRefundNo` and never
 *    mints a new one — a retry with a fresh number is how a buyer is refunded
 *    twice (REFUND-005).
 *
 * In a shop where customer service approves and finance pays, that split is the
 * control. In a small shop one person holds both atoms, which is a grant, not a
 * code change.
 *
 * There is no amount field anywhere on this page. The amount was computed from
 * the frozen order lines when the request was made and is never recomputed; an
 * operator typing one is how a shop refunds more than it was paid
 * (`REFUND_EXCEEDS_PAID` exists because the database refuses it too).
 *
 * The return address shown to the buyer comes from 售后设置, not from this
 * form: `refunds` has nowhere to store a per-request address yet, and an
 * approval that recorded one in the timeline while the buyer's screen showed
 * another would be worse than one source of truth. `CR-5-c` asks for the column.
 */
export function RefundRequestsPage() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const approveModal = useFormModal<AdminRefundListItem>();
  const rejectModal = useFormModal<AdminRefundListItem>();
  const remarkModal = useFormModal<AdminRefundListItem>();

  return (
    <PageContainer subTitle="买家发起的退款与退货退款；金额在申请时已冻结，这里只决定同不同意">
      <CrudTable
        route={refundAdminList}
        scrollX={1700}
        filters={[
          { kind: 'text', name: 'keyword', label: '售后单号 / 订单号', width: 240 },
          {
            kind: 'select',
            name: 'status',
            label: '状态',
            multiple: true,
            options: optionsOf(REFUND_STATUS),
          },
          { kind: 'select', name: 'kind', label: '类型', options: optionsOf(REFUND_KIND) },
          {
            kind: 'select',
            name: 'returnStage',
            label: '退货进度',
            options: optionsOf(REFUND_RETURN_STAGE),
          },
          { kind: 'number', name: 'userId', label: '用户 ID' },
          { kind: 'dateRange', names: ['createdFrom', 'createdTo'], label: '申请时间' },
        ]}
        columns={[
          idColumn<AdminRefundListItem>({ sortable: true }),
          {
            title: '售后单号',
            dataIndex: 'refundNo',
            key: 'refundNo',
            width: 200,
            render: (value: unknown, row: AdminRefundListItem) => (
              <Typography.Text copyable={{ text: String(value) }}>
                {String(value)}
                {row.isAutomatic ? (
                  <Tag color="gold" bordered={false} style={{ marginLeft: 6 }}>
                    系统
                  </Tag>
                ) : null}
              </Typography.Text>
            ),
          },
          textColumn<AdminRefundListItem>({
            title: '订单号',
            dataIndex: 'orderNo',
            ellipsis: true,
          }),
          {
            title: '买家',
            key: 'user',
            width: 150,
            render: (_value: unknown, row: AdminRefundListItem) => (
              <Typography.Text>
                {row.userNickname ?? '—'}
                <Typography.Text type="secondary"> #{row.userId}</Typography.Text>
              </Typography.Text>
            ),
          },
          enumColumn<AdminRefundListItem, AdminRefundListItem['kind']>({
            title: '类型',
            dataIndex: 'kind',
            map: REFUND_KIND,
            width: 110,
          }),
          moneyColumn<AdminRefundListItem>({
            title: '申请金额',
            dataIndex: 'amount',
            sortable: true,
          }),
          moneyColumn<AdminRefundListItem>({ title: '已退', dataIndex: 'refundedAmount' }),
          enumColumn<AdminRefundListItem, AdminRefundListItem['status']>({
            title: '状态',
            dataIndex: 'status',
            map: REFUND_STATUS,
            width: 110,
          }),
          enumColumn<AdminRefundListItem, AdminRefundListItem['returnStage']>({
            title: '退货进度',
            dataIndex: 'returnStage',
            map: REFUND_RETURN_STAGE,
            width: 130,
          }),
          textColumn<AdminRefundListItem>({
            title: '最后错误',
            dataIndex: 'lastError',
            ellipsis: true,
          }),
          instantColumn<AdminRefundListItem>({
            title: '申请时间',
            dataIndex: 'createdAt',
            sortable: true,
          }),
          actionsColumn<AdminRefundListItem>({
            width: 260,
            render: (row) => (
              <>
                <Button type="link" size="small" onClick={() => setDetailId(row.id)}>
                  详情
                </Button>
                <Can permission="refund:request:review">
                  {row.status === 'applied' ? (
                    <>
                      <Button type="link" size="small" onClick={() => approveModal.show(row)}>
                        同意
                      </Button>
                      <Button type="link" size="small" danger onClick={() => rejectModal.show(row)}>
                        拒绝
                      </Button>
                    </>
                  ) : null}
                </Can>
                <Can permission="refund:request:execute">
                  {row.returnStage === 'shipped_back' ? (
                    <ConfirmButton
                      route={refundAdminReceiveReturn}
                      input={{ params: { id: row.id }, body: {} }}
                      title="确认已收到退货？"
                      description="确认后立即向微信发起退款。"
                      invalidate={[refundAdminList]}
                      successMessage="已确认收货"
                      buttonProps={{ type: 'link', size: 'small' }}
                    >
                      确认收货
                    </ConfirmButton>
                  ) : null}
                  {canRetry(row.status) ? (
                    <ConfirmButton
                      route={refundAdminRetry}
                      input={{ params: { id: row.id } }}
                      title="重新处理这笔退款？"
                      description="使用原有的商户退款单号，不会重复退款。"
                      invalidate={[refundAdminList]}
                      successMessage="已重新处理"
                      buttonProps={{ type: 'link', size: 'small' }}
                    >
                      重试
                    </ConfirmButton>
                  ) : null}
                </Can>
                <Can permission="refund:request:write">
                  <Button type="link" size="small" onClick={() => remarkModal.show(row)}>
                    备注
                  </Button>
                </Can>
              </>
            ),
          }),
        ]}
      />

      <RefundDrawer id={detailId} onClose={() => setDetailId(null)} />

      <ModalForm
        {...approveModal.props}
        title={`同意退款：${approveModal.record?.refundNo ?? ''}`}
        width={560}
        schema={refundApproveBody}
        fields={[
          {
            kind: 'textarea',
            name: 'remark',
            label: '备注',
            rows: 3,
            maxLength: 255,
            help: '会写进售后单的处理记录，买家可以看到。',
          },
        ]}
        route={refundAdminApprove}
        toInput={(values) => ({ params: { id: approveModal.record?.id ?? '' }, body: values })}
        invalidate={[refundAdminList]}
        successMessage="已同意"
        okText="确认同意"
        header={
          approveModal.record ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                approveModal.record.kind === 'refund_only' ? (
                  <>
                    同意后立即退回 <MoneyText value={approveModal.record.amount} />。
                  </>
                ) : (
                  <>
                    同意后买家按「售后设置」里的退货地址寄回，确认收货时才退款
                    <MoneyText value={approveModal.record.amount} />。
                  </>
                )
              }
            />
          ) : null
        }
      />

      <ModalForm
        {...rejectModal.props}
        title={`拒绝退款：${rejectModal.record?.refundNo ?? ''}`}
        width={560}
        schema={refundRejectBody}
        fields={[
          {
            kind: 'textarea',
            name: 'rejectReason',
            label: '拒绝原因',
            rows: 3,
            maxLength: 255,
            required: true,
            help: '必填，买家会原样看到这句话。',
          },
        ]}
        route={refundAdminReject}
        toInput={(values) => ({ params: { id: rejectModal.record?.id ?? '' }, body: values })}
        invalidate={[refundAdminList]}
        successMessage="已拒绝"
        okText="确认拒绝"
      />

      <ModalForm
        {...remarkModal.props}
        title={`备注：${remarkModal.record?.refundNo ?? ''}`}
        width={560}
        schema={refundRemarkBody}
        fields={[
          {
            kind: 'textarea',
            name: 'adminRemark',
            label: '内部备注',
            rows: 3,
            maxLength: 255,
            help: '只在后台可见。',
          },
        ]}
        initialValues={
          remarkModal.record?.adminRemark === null || remarkModal.record === undefined
            ? undefined
            : { adminRemark: remarkModal.record.adminRemark ?? '' }
        }
        route={refundAdminRemark}
        toInput={(values) => ({ params: { id: remarkModal.record?.id ?? '' }, body: values })}
        invalidate={[refundAdminList]}
        successMessage="已保存"
      />
    </PageContainer>
  );
}

/** Retrying is for a refund that tried and did not land. */
function canRetry(status: AdminRefundListItem['status']): boolean {
  return status === 'failed' || status === 'unknown' || status === 'processing';
}

/**
 * The drawer answers the two questions the list cannot: *what* is being
 * refunded, and *what happened so far*. The timeline is the refund's log table,
 * which is written in the same transaction as every status change — so it can
 * never disagree with the status next to it.
 */
function RefundDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useRouteQuery(refundAdminDetail, id === null ? undefined : { params: { id } }, {
    enabled: id !== null,
  });
  const row = detail.data;

  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      width={860}
      title={`售后单 ${row?.refundNo ?? ''}`}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <DescriptionsCard
          title="基本信息"
          loading={detail.isPending}
          column={2}
          items={
            row
              ? [
                  { label: '状态', value: <StatusTag value={row.status} map={REFUND_STATUS} /> },
                  { label: '类型', value: <StatusTag value={row.kind} map={REFUND_KIND} /> },
                  {
                    label: '退货进度',
                    value: <StatusTag value={row.returnStage} map={REFUND_RETURN_STAGE} />,
                  },
                  { label: '含运费', value: row.includesFreight ? '是' : '否' },
                  { label: '申请金额', value: <MoneyText value={row.amount} /> },
                  { label: '已退金额', value: <MoneyText value={row.refundedAmount} /> },
                  { label: '订单号', value: row.orderNo },
                  { label: '买家', value: `${row.userNickname ?? '—'} #${row.userId}` },
                  { label: '商户退款单号', value: row.outRefundNo, span: 2 },
                  { label: '微信退款单号', value: row.gatewayRefundId ?? '—', span: 2 },
                  { label: '申请原因', value: row.reason ?? '—', span: 2 },
                  { label: '补充说明', value: row.explanation ?? '—', span: 2 },
                  {
                    label: '拒绝原因',
                    value: row.rejectReason ?? '—',
                    span: 2,
                    hidden: row.rejectReason === null,
                  },
                  { label: '内部备注', value: row.adminRemark ?? '—', span: 2 },
                  {
                    label: '最后错误',
                    value: row.lastError ?? '—',
                    span: 2,
                    hidden: row.lastError === null,
                  },
                  { label: '申请时间', value: <InstantText value={row.createdAt} /> },
                  {
                    label: '退款成功时间',
                    value: <InstantText value={row.succeededAt ?? undefined} />,
                  },
                ]
              : []
          }
        />

        {row && row.kind === 'return_and_refund' ? (
          <DescriptionsCard
            title="退货物流"
            column={2}
            items={[
              { label: '快递公司', value: row.returnExpressCompanyName ?? '—' },
              { label: '运单号', value: row.returnTrackingNo ?? '—' },
              { label: '联系电话', value: row.returnPhone ?? '—' },
            ]}
          />
        ) : null}

        <Table<RefundItem>
          size="small"
          rowKey={(item) => item.orderItemId}
          pagination={false}
          loading={detail.isPending}
          dataSource={row?.items ?? []}
          columns={[
            { title: '商品', dataIndex: 'productName', key: 'productName', ellipsis: true },
            { title: '规格', dataIndex: 'skuName', key: 'skuName', width: 160, ellipsis: true },
            { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' },
            {
              title: '金额',
              dataIndex: 'amount',
              key: 'amount',
              width: 120,
              align: 'right',
              render: (value: unknown) =>
                typeof value === 'string' ? <MoneyText value={value} /> : '—',
            },
          ]}
        />

        <Timeline
          mode="left"
          items={(row?.logs ?? []).map((log) => ({
            color: timelineColour(log.toStatus),
            children: (
              <Space direction="vertical" size={0}>
                <Typography.Text>
                  <StatusTag value={log.toStatus} map={REFUND_STATUS} /> {log.message ?? ''}
                </Typography.Text>
                <Typography.Text type="secondary">
                  <InstantText value={log.createdAt} format="datetime" />
                </Typography.Text>
              </Space>
            ),
          }))}
        />
      </Space>
    </Drawer>
  );
}

function timelineColour(status: AdminRefundListItem['status']): string {
  if (status === 'succeeded') return 'green';
  if (status === 'failed' || status === 'unknown') return 'red';
  if (status === 'rejected' || status === 'cancelled') return 'gray';
  return 'blue';
}
