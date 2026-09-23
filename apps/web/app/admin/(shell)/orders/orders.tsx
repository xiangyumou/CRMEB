'use client';

import { useState } from 'react';
import { Button, Card, Col, Row, Space, Statistic, Tabs, Typography, message } from 'antd';
import Link from 'next/link';
import {
  orderAdminDeleteMany,
  orderAdminExport,
  orderAdminList,
  orderAdminStatistics,
} from '@shop/contracts/order/order.admin.contract';
import type { AdminOrderListItem } from '@shop/contracts/order/order.fulfil.schemas';

import { callRoute, useRouteQuery } from '@/admin/api';
import { MoneyText } from '@/admin/kit/money-text';
import { PageContainer } from '@/admin/kit/page-container';
import { StatusTag } from '@/admin/kit/status-tag';
import { actionsColumn, enumColumn, instantColumn, moneyColumn } from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';
import { ConfirmButton } from '@/admin/kit/confirm-button';
import { Can } from '@/admin/session';

import {
  FULFILLMENT_STATUS,
  ORDER_KIND,
  ORDER_STATUS,
  REFUND_STATUS,
  optionsOf,
} from './order-enums';

/**
 * 订单列表.
 *
 * The tab bar is a *preset over the filters*, not a separate query parameter.
 * Packing 待发货 / 待收货 / 已完成 into one `status` integer would mix four
 * different columns together, and 已退款 and 待收货 could never be asked for
 * at once; here each tab just sets the filters it means and the
 * filter bar underneath stays usable on top of it.
 */

type TabKey = 'all' | 'unpaid' | 'unshipped' | 'unreceived' | 'finished' | 'refunding' | 'deleted';

const TABS: { key: TabKey; label: string; query: Record<string, unknown> }[] = [
  { key: 'all', label: '全部', query: {} },
  { key: 'unpaid', label: '待付款', query: { status: 'pending_payment' } },
  {
    key: 'unshipped',
    label: '待发货',
    query: { status: 'paid', fulfillmentStatus: ['unfulfilled', 'partially_fulfilled'] },
  },
  { key: 'unreceived', label: '待收货', query: { status: 'shipped' } },
  { key: 'finished', label: '已完成', query: { status: ['received', 'completed'] } },
  {
    key: 'refunding',
    label: '退款中',
    query: { refundStatus: ['requested', 'partially_refunded'] },
  },
  { key: 'deleted', label: '回收站', query: { deleted: true } },
];

export function OrdersPage() {
  const [tab, setTab] = useState<TabKey>('all');
  const stats = useRouteQuery(orderAdminStatistics, {});
  const preset = TABS.find((entry) => entry.key === tab)?.query ?? {};

  return (
    <PageContainer subTitle="发货、改价、备注与导出。拆单已经取消，部分发货只是多一张发货单。">
      <WorkQueue
        pendingShipment={stats.data?.pendingShipment ?? 0}
        pendingReceipt={stats.data?.pendingReceipt ?? 0}
        refunding={stats.data?.refunding ?? 0}
        pendingInvoice={stats.data?.pendingInvoice ?? 0}
        paidAmount={stats.data?.paidAmount ?? null}
        loading={stats.isPending}
      />

      <Tabs
        activeKey={tab}
        onChange={(key) => setTab(key as TabKey)}
        items={TABS.map((entry) => ({ key: entry.key, label: entry.label }))}
      />

      <CrudTable
        key={tab}
        route={orderAdminList}
        scrollX={1600}
        fixedQuery={preset}
        toolbar={<ExportButton preset={preset} />}
        batchActions={({ selectedRowKeys, clear }) => (
          <Can permission="order:order:delete">
            <ConfirmButton
              route={orderAdminDeleteMany}
              input={{ body: { ids: selectedRowKeys.map(String) } }}
              title={`确认删除选中的 ${selectedRowKeys.length} 个订单？`}
              description="只有已完成、已取消或已退款的订单会被删除，其余会被跳过。"
              invalidate={[orderAdminList, orderAdminStatistics]}
              successMessage="已删除"
              onSuccess={clear}
              buttonProps={{ danger: true }}
            >
              批量删除
            </ConfirmButton>
          </Can>
        )}
        filters={[
          { kind: 'text', name: 'keyword', label: '关键词' },
          {
            kind: 'select',
            name: 'status',
            label: '订单状态',
            multiple: true,
            options: optionsOf(ORDER_STATUS),
          },
          {
            kind: 'select',
            name: 'fulfillmentStatus',
            label: '发货状态',
            multiple: true,
            options: optionsOf(FULFILLMENT_STATUS),
          },
          {
            kind: 'select',
            name: 'refundStatus',
            label: '售后状态',
            multiple: true,
            options: optionsOf(REFUND_STATUS),
          },
          { kind: 'select', name: 'kind', label: '订单类型', options: optionsOf(ORDER_KIND) },
          { kind: 'number', name: 'userId', label: '用户 ID' },
          { kind: 'dateRange', names: ['createdFrom', 'createdTo'], label: '下单时间' },
          { kind: 'dateRange', names: ['paidFrom', 'paidTo'], label: '支付时间' },
        ]}
        columns={[
          {
            title: '订单号',
            dataIndex: 'orderNo',
            key: 'orderNo',
            width: 210,
            render: (_value: unknown, row: AdminOrderListItem) => (
              <Link href={`/admin/orders/${row.id}`}>{row.orderNo}</Link>
            ),
          },
          {
            title: '买家',
            key: 'user',
            width: 150,
            render: (_value: unknown, row: AdminOrderListItem) => (
              <Typography.Text ellipsis>
                {row.user.nickname}
                <Typography.Text type="secondary"> #{row.user.id}</Typography.Text>
              </Typography.Text>
            ),
          },
          {
            title: '收货人',
            key: 'receiver',
            width: 170,
            render: (_value: unknown, row: AdminOrderListItem) => (
              <Typography.Text ellipsis>
                {row.receiver.name} {row.receiver.phone}
              </Typography.Text>
            ),
          },
          {
            title: '商品',
            key: 'items',
            width: 220,
            render: (_value: unknown, row: AdminOrderListItem) => (
              <Typography.Text type="secondary" ellipsis>
                {row.items[0]?.productName ?? '—'}
                {row.items.length > 1 ? ` 等 ${row.items.length} 件` : ''}
              </Typography.Text>
            ),
          },
          moneyColumn<AdminOrderListItem>({
            title: '应付',
            dataIndex: 'payableAmount',
            sortable: true,
          }),
          moneyColumn<AdminOrderListItem>({ title: '实付', dataIndex: 'paidAmount' }),
          moneyColumn<AdminOrderListItem>({ title: '已退款', dataIndex: 'refundedAmount' }),
          enumColumn<AdminOrderListItem, AdminOrderListItem['status']>({
            title: '状态',
            dataIndex: 'status',
            map: ORDER_STATUS,
          }),
          {
            title: '发货 / 售后',
            key: 'progress',
            width: 170,
            render: (_value: unknown, row: AdminOrderListItem) => (
              <Space size={4}>
                <StatusTag value={row.fulfillmentStatus} map={FULFILLMENT_STATUS} />
                {row.refundStatus === 'none' ? null : (
                  <StatusTag value={row.refundStatus} map={REFUND_STATUS} />
                )}
              </Space>
            ),
          },
          instantColumn<AdminOrderListItem>({
            title: '下单时间',
            dataIndex: 'createdAt',
            sortable: true,
          }),
          actionsColumn<AdminOrderListItem>({
            render: (row) => (
              <Link href={`/admin/orders/${row.id}`}>
                <Button type="link" size="small">
                  {row.status === 'paid' && row.fulfillmentStatus !== 'fulfilled'
                    ? '去发货'
                    : '详情'}
                </Button>
              </Link>
            ),
          }),
        ]}
      />
    </PageContainer>
  );
}

function WorkQueue(props: {
  pendingShipment: number;
  pendingReceipt: number;
  refunding: number;
  pendingInvoice: number;
  paidAmount: string | null;
  loading: boolean;
}) {
  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      {[
        { title: '待发货', value: props.pendingShipment },
        { title: '待收货', value: props.pendingReceipt },
        { title: '退款中', value: props.refunding },
        { title: '待开票', value: props.pendingInvoice },
      ].map((entry) => (
        <Col key={entry.title} span={5}>
          <Card size="small">
            <Statistic title={entry.title} value={entry.value} loading={props.loading} />
          </Card>
        </Col>
      ))}
      <Col span={4}>
        <Card size="small">
          <Statistic
            title="近 30 天实付"
            loading={props.loading}
            valueRender={() => <MoneyText value={props.paidAmount} strong />}
          />
        </Card>
      </Col>
    </Row>
  );
}

/**
 * 导出.
 *
 * The response is CSV *text* in the JSON envelope — `handle()` validates every
 * response against its contract, so a route cannot answer with a binary stream.
 * The download is assembled here, with a BOM so Excel reads UTF-8.
 */
function ExportButton({ preset }: { preset: Record<string, unknown> }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const result = await callRoute(orderAdminExport, {
        query: { ...preset, kindOfExport: 'orders' } as never,
      });
      const blob = new Blob(['﻿', result.content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      if (result.truncated) {
        message.warning(`导出已截断到 ${result.rowCount} 行，请缩小筛选范围`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Can permission="order:order:export">
      <Button onClick={download} loading={busy}>
        导出 CSV
      </Button>
    </Can>
  );
}
