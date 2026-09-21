'use client';

import { Space, Typography } from 'antd';
import Link from 'next/link';
import {
  invoiceAdminIssue,
  invoiceAdminList,
  invoiceAdminReject,
} from '@shop/contracts/order/order.invoice.contract';
import {
  invoiceIssueBody,
  invoiceRejectBody,
  type OrderInvoice,
} from '@shop/contracts/order/order.fulfil.schemas';

import { ModalForm, useFormModal } from '@/admin/kit/form/modal-form';
import { PageContainer } from '@/admin/kit/page-container';
import {
  actionsColumn,
  enumColumn,
  instantColumn,
  moneyColumn,
  textColumn,
} from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';
import { Can } from '@/admin/session';
import { Button } from 'antd';

import { INVOICE_HEADER_TYPE, INVOICE_STATUS, INVOICE_TYPE, optionsOf } from '../order-enums';

/**
 * 发票管理.
 *
 * Legacy's `store_order_invoice` was a second copy of the order and the two
 * drifted the moment anything was refunded; the row here carries only the
 * header the buyer froze at request time, so this table never has to reconcile
 * anything. The e-invoice provider is out of scope — finance types the number
 * from whatever system actually issued it.
 */
export function OrderInvoicesPage() {
  const issue = useFormModal<OrderInvoice>();
  const reject = useFormModal<OrderInvoice>();

  return (
    <PageContainer subTitle="买家的开票申请。一个订单同时只能有一条有效申请。">
      <CrudTable
        route={invoiceAdminList}
        scrollX={1400}
        filters={[
          { kind: 'text', name: 'keyword', label: '抬头 / 税号 / 订单号' },
          {
            kind: 'select',
            name: 'status',
            label: '状态',
            multiple: true,
            options: optionsOf(INVOICE_STATUS),
          },
          {
            kind: 'select',
            name: 'headerType',
            label: '抬头类型',
            options: optionsOf(INVOICE_HEADER_TYPE),
          },
          {
            kind: 'select',
            name: 'invoiceType',
            label: '发票类型',
            options: optionsOf(INVOICE_TYPE),
          },
          { kind: 'dateRange', names: ['createdFrom', 'createdTo'], label: '申请时间' },
        ]}
        columns={[
          {
            title: '订单号',
            key: 'orderNo',
            width: 200,
            render: (_value: unknown, row: OrderInvoice) => (
              <Link href={`/admin/orders/${row.orderId}`}>{row.orderNo}</Link>
            ),
          },
          textColumn<OrderInvoice>({ title: '抬头', dataIndex: 'name', ellipsis: true }),
          enumColumn<OrderInvoice, OrderInvoice['headerType']>({
            title: '抬头类型',
            dataIndex: 'headerType',
            map: INVOICE_HEADER_TYPE,
          }),
          enumColumn<OrderInvoice, OrderInvoice['invoiceType']>({
            title: '发票类型',
            dataIndex: 'invoiceType',
            map: INVOICE_TYPE,
          }),
          textColumn<OrderInvoice>({ title: '税号', dataIndex: 'dutyNumber' }),
          moneyColumn<OrderInvoice>({ title: '金额', dataIndex: 'amount', sortable: true }),
          enumColumn<OrderInvoice, OrderInvoice['status']>({
            title: '状态',
            dataIndex: 'status',
            map: INVOICE_STATUS,
          }),
          textColumn<OrderInvoice>({ title: '发票号', dataIndex: 'invoiceNumber' }),
          instantColumn<OrderInvoice>({
            title: '申请时间',
            dataIndex: 'createdAt',
            sortable: true,
          }),
          actionsColumn<OrderInvoice>({
            render: (row) =>
              row.status === 'requested' ? (
                <Can permission="order:invoice:write">
                  <Space size={0}>
                    <Button type="link" size="small" onClick={() => issue.show(row)}>
                      开票
                    </Button>
                    <Button type="link" size="small" danger onClick={() => reject.show(row)}>
                      驳回
                    </Button>
                  </Space>
                </Can>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              ),
          }),
        ]}
      />

      <ModalForm
        {...issue.props}
        title={`开票 · ${issue.record?.name ?? ''}`}
        schema={invoiceIssueBody}
        fields={[
          { kind: 'text', name: 'invoiceNumber', label: '发票号码', maxLength: 50 },
          { kind: 'textarea', name: 'remark', label: '备注', rows: 3, maxLength: 255 },
        ]}
        route={invoiceAdminIssue}
        toInput={(values) => ({ params: { id: issue.record?.id ?? '' }, body: values })}
        invalidate={[invoiceAdminList]}
        successMessage="已开票"
      />

      <ModalForm
        {...reject.props}
        title={`驳回 · ${reject.record?.name ?? ''}`}
        schema={invoiceRejectBody}
        fields={[
          {
            kind: 'textarea',
            name: 'reason',
            label: '驳回原因',
            rows: 3,
            maxLength: 255,
            help: '买家会看到这段文字，所以写清楚为什么。',
          },
        ]}
        route={invoiceAdminReject}
        toInput={(values) => ({ params: { id: reject.record?.id ?? '' }, body: values })}
        invalidate={[invoiceAdminList]}
        successMessage="已驳回"
      />
    </PageContainer>
  );
}
