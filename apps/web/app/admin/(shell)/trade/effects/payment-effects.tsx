'use client';

import { Alert, Typography } from 'antd';
import {
  paymentAdminEffectList,
  paymentAdminEffectRetry,
} from '@shop/contracts/payment/payment.admin.contract';
import type { PaymentEffectListItem } from '@shop/contracts/payment/schemas';

import { ConfirmButton } from '@/admin/kit/confirm-button';
import { PageContainer } from '@/admin/kit/page-container';
import {
  actionsColumn,
  enumColumn,
  idColumn,
  instantColumn,
  textColumn,
} from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';

import { EFFECT_STATUS, optionsOf } from '../trade-enums';

/**
 * 待处理任务 — the side effects that gave up.
 *
 * Every third-party call in the system happens *after* its transaction commits,
 * through the effects ledger: the database row and the money move together, and
 * the WeChat call follows. Delivery is at-least-once and handlers are
 * idempotent, so a transient failure costs a retry and nothing else.
 *
 * A row reaches 需人工处理 only after the ledger's own retries ran out. That is
 * what this screen lists, and the one that matters most is
 * `refund.execute` — the effect that sends money back to a buyer. A parked
 * `refund.execute` is somebody waiting for a refund that will never leave on
 * its own.
 *
 * 重试 does not run the handler here. It puts the row back to 待执行 with
 * `next_run_at = now`, and the dispatcher picks it up within five seconds — a
 * handler that calls WeChat has no business on an admin request thread, where
 * a slow gateway would look like a broken console. The update is conditional on
 * the row still being parked, so two operators pressing it at the same time
 * produce one re-queue and one 该任务当前状态无法重试.
 *
 * The list is scoped to `payment`, `refund` and `order`. The effects table is
 * platform-owned and this console is not everybody's.
 */
export function PaymentEffectsPage() {
  return (
    <PageContainer subTitle="重试用尽后停下来的异步任务；重试只是重新排队，真正的执行由后台完成">
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="这里的每一条都意味着某个动作没有做完——退款没发出、通知没送达。先看错误信息，修好外部原因再重试。"
      />
      <CrudTable
        route={paymentAdminEffectList}
        scrollX={1300}
        defaultPageSize={20}
        filters={[
          {
            kind: 'select',
            name: 'status',
            label: '状态',
            allowClear: false,
            options: optionsOf(EFFECT_STATUS),
          },
          {
            kind: 'select',
            name: 'scope',
            label: '范围',
            options: [
              { value: 'payment', label: '支付' },
              { value: 'refund', label: '退款' },
              { value: 'order', label: '订单' },
            ],
          },
          { kind: 'text', name: 'eventType', label: '事件', width: 200 },
        ]}
        columns={[
          idColumn<PaymentEffectListItem>(),
          textColumn<PaymentEffectListItem>({ title: '范围', dataIndex: 'scope', width: 90 }),
          {
            title: '事件',
            key: 'event',
            width: 260,
            render: (_value: unknown, row: PaymentEffectListItem) => (
              <Typography.Text>
                {row.eventType}
                <Typography.Text type="secondary"> #{row.scopeId}</Typography.Text>
              </Typography.Text>
            ),
          },
          enumColumn<PaymentEffectListItem, PaymentEffectListItem['status']>({
            title: '状态',
            dataIndex: 'status',
            map: EFFECT_STATUS,
            width: 120,
          }),
          {
            title: '已尝试',
            dataIndex: 'attempts',
            key: 'attempts',
            width: 90,
            align: 'right' as const,
          },
          textColumn<PaymentEffectListItem>({
            title: '错误信息',
            dataIndex: 'lastError',
            ellipsis: true,
          }),
          instantColumn<PaymentEffectListItem>({ title: '下次执行', dataIndex: 'nextRunAt' }),
          instantColumn<PaymentEffectListItem>({ title: '更新时间', dataIndex: 'updatedAt' }),
          actionsColumn<PaymentEffectListItem>({
            width: 110,
            render: (row) =>
              row.status === 'unknown' ? (
                <ConfirmButton
                  route={paymentAdminEffectRetry}
                  input={{ params: { id: row.id } }}
                  title="重新排队执行这个任务？"
                  description="任务会在几秒内由后台执行；重复执行是安全的。"
                  invalidate={[paymentAdminEffectList]}
                  successMessage="已重新排队"
                  permission="payment:effect:handle"
                  buttonProps={{ type: 'link', size: 'small' }}
                >
                  重试
                </ConfirmButton>
              ) : null,
          }),
        ]}
      />
    </PageContainer>
  );
}
