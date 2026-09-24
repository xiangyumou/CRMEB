import { Text, View } from '@tarojs/components';
import { useRouteMutation, useRouteQuery } from '@shop/api-client/react';
import { formatDateTime } from '@/lib/format';
import { navigate, useRouteParams } from '@/platform';
import { LoginGate } from '@/session/login-card';
import { useSignedIn } from '@/session/session';
import { Button } from '@/ui/button';
import { Cell, CellGroup } from '@/ui/cell';
import { Empty } from '@/ui/empty';
import { ErrorBlock } from '@/ui/error-block';
import { confirm, toast } from '@/ui/feedback';
import { PageShell } from '@/ui/page-shell';
import { Price } from '@/ui/price';
import { CellSkeleton } from '@/ui/skeleton';
import { Tag } from '@/ui/tag';
import { SubmitBar, errorMessage } from '../shared/form';
import {
  HEADER_TYPE_TEXT,
  INVOICE_STATUS_TEXT,
  INVOICE_TYPE_TEXT,
  orderSummaryText,
  type OrderInvoice,
} from '../shared/invoice';
import './index.scss';

/** One line under the state: what happens next, or what happened. */
function stateNote(invoice: OrderInvoice): string {
  switch (invoice.status) {
    case 'requested':
      return '已提交，商家开具后会通知你';
    case 'issued':
      return invoice.issuedAt ? `开具于 ${formatDateTime(invoice.issuedAt)}` : '发票已开具';
    case 'rejected':
      return invoice.remark ? `原因：${invoice.remark}` : '可以修改抬头后重新申请';
    case 'cancelled':
      return '申请已撤回，可以重新申请';
  }
}

/**
 * 发票详情 (`invoice { id }`, pages.md §2.6): the state, the 抬头 as it was frozen onto the
 * request, and the order. 待开票 can be 撤回; 未通过 and 已撤回 can be asked for again.
 */
export default function InvoicePage() {
  const { id } = useRouteParams('invoice');
  const signedIn = useSignedIn();
  return (
    <PageShell title="发票详情" withBar={signedIn}>
      {id ? (
        <LoginGate reason="登录后可以查看发票" redirect={{ route: 'invoice', params: { id } }}>
          <Invoice id={id} />
        </LoginGate>
      ) : (
        <Empty title="开票记录不存在" />
      )}
    </PageShell>
  );
}

function Invoice({ id }: { id: string }) {
  const signedIn = useSignedIn();
  const query = useRouteQuery('order.myInvoiceDetail', { params: { id } }, { enabled: signedIn });
  const cancel = useRouteMutation('order.cancelInvoice', {
    invalidate: ['order.myInvoices', 'order.myInvoiceDetail'],
  });
  if (query.isPending) return <CellSkeleton rows={6} />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;
  const invoice = query.data;
  const state = INVOICE_STATUS_TEXT[invoice.status];

  async function withdraw() {
    const ok = await confirm({
      title: '撤回开票申请',
      content: '撤回后可以重新申请。',
      confirmText: '撤回',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync({ params: { id }, body: {} });
      toast.success('已撤回');
    } catch (error) {
      toast.text(errorMessage(error));
    }
  }

  const optional = (title: string, value: string | null) =>
    value ? <Cell title={title} value={value} /> : null;

  return (
    <View className="account-page">
      <View className="invoice-state">
        <View className="invoice-state__head">
          <Text className="invoice-state__title">{state.text}</Text>
          <Tag tone={state.tone} size="sm">
            {INVOICE_TYPE_TEXT[invoice.invoiceType]}
          </Tag>
        </View>
        <Text className="invoice-state__note">{stateNote(invoice)}</Text>
      </View>
      <CellGroup title="发票信息">
        {invoice.invoiceNumber ? <Cell title="发票号码" value={invoice.invoiceNumber} /> : null}
        <Cell title="抬头类型" value={HEADER_TYPE_TEXT[invoice.headerType]} />
        <Cell title="抬头名称" value={invoice.name} />
        {optional('税号', invoice.dutyNumber)}
        {optional('注册地址', invoice.registeredAddress)}
        {optional('注册电话', invoice.registeredTel)}
        {optional('开户银行', invoice.bankName)}
        {optional('银行账号', invoice.bankAccount)}
        {optional('收票手机', invoice.drawerPhone)}
        {optional('收票邮箱', invoice.email)}
        <Cell title="开票金额" value={<Price value={invoice.amount} size="sm" tone="text" />} />
        <Cell title="申请时间" value={formatDateTime(invoice.createdAt)} />
        {invoice.status !== 'rejected' ? optional('备注', invoice.remark) : null}
      </CellGroup>
      <CellGroup title="订单">
        <Cell
          title={orderSummaryText(invoice)}
          description={`订单号 ${invoice.orderNo}`}
          label="查看订单"
          onClick={() => void navigate({ route: 'order', params: { id: invoice.orderId } })}
        />
      </CellGroup>
      {invoice.status === 'requested' ? (
        <SubmitBar>
          <Button
            size="lg"
            variant="outline"
            block
            loading={cancel.isPending}
            onClick={() => void withdraw()}
          >
            撤回申请
          </Button>
        </SubmitBar>
      ) : null}
      {invoice.status === 'rejected' || invoice.status === 'cancelled' ? (
        <SubmitBar>
          <Button
            size="lg"
            block
            onClick={() =>
              void navigate({ route: 'invoiceApply', params: { orderId: invoice.orderId } })
            }
          >
            重新申请
          </Button>
        </SubmitBar>
      ) : null}
    </View>
  );
}
