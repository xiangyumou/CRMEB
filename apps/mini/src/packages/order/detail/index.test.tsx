import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '@/session/session';
import { serveApi } from '@/test/fake-api';
import { orderDetail, orderItem, shipment } from '@/test/order-fixtures';
import { renderPage } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import OrderDetailPage from './index';

describe('订单详情', () => {
  beforeEach(() => {
    useSession.setState({ session: { status: 'signed-in', token: 't' } });
  });

  it('shows an unpaid order with its time left, the amounts and 立即付款', async () => {
    taroFake.routerParams = { id: '9001' };
    serveApi({
      'GET /api/v1/orders/9001': () => ({
        body: orderDetail({
          status: 'pending_payment',
          paidAmount: null,
          paidAt: null,
          payExpiresAt: '2099-01-01T00:00:00+08:00',
          itemsAmount: '120.00',
          freightAmount: '8.00',
          couponDiscount: '10.00',
          payableAmount: '118.00',
          items: [orderItem('7001', { productName: '按摩精油' })],
        }),
      }),
    });
    await renderPage(<OrderDetailPage />);

    await screen.findByText('等待付款');
    expect(screen.getByText(/未付款将自动取消/)).toBeTruthy();
    expect(screen.getByText('按摩精油')).toBeTruthy();
    expect(screen.getByLabelText('价格 118 元')).toBeTruthy();
    expect(screen.getByText('应付款')).toBeTruthy();
    expect(screen.getByText('138****8000', { exact: false })).toBeTruthy();
    // No 发票 before paying.
    expect(screen.queryByText('申请开票')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '立即付款' }));
    expect(taroFake.calls).toContainEqual({
      api: 'navigateTo',
      args: { url: '/packages/order/cashier/index?orderId=9001' },
    });
  });

  it('opens by the payment number from a WeChat message', async () => {
    taroFake.routerParams = { outTradeNo: 'P123' };
    const seen = serveApi({
      'GET /api/v1/payments/P123': () => ({
        body: { outTradeNo: 'P123', orderId: '9001', status: 'paid', paid: true, paidAt: null },
      }),
      'GET /api/v1/orders/9001': () => ({ body: orderDetail() }),
    });
    await renderPage(<OrderDetailPage />);
    await screen.findByText('等待发货');
    expect(seen.map((r) => r.key)).toEqual([
      'GET /api/v1/payments/P123',
      'GET /api/v1/orders/9001',
    ]);
  });

  it('shows the parcels of a shipped order and confirms receipt from the bar', async () => {
    taroFake.routerParams = { id: '9001' };
    const shipped = orderDetail({
      status: 'shipped',
      fulfillmentStatus: 'fulfilled',
      shippedAt: '2026-02-02T09:00:00+08:00',
    });
    const seen = serveApi({
      'GET /api/v1/orders/9001': () => ({ body: shipped }),
      'GET /api/v1/orders/9001/shipments': () => ({ body: { items: [shipment('4001')] } }),
      'GET /api/v1/orders/9001/wechat-receipt': () => ({ body: { receipt: null } }),
      'POST /api/v1/orders/9001/receipt': () => ({ body: { ...shipped, status: 'received' } }),
    });
    await renderPage(<OrderDetailPage />);

    await screen.findByText('顺丰速运 SF4001');
    fireEvent.click(screen.getByRole('link', { name: '查看物流' }));
    expect(taroFake.calls).toContainEqual({
      api: 'navigateTo',
      args: { url: '/packages/order/logistics/index?orderId=9001' },
    });
    // 查看物流 is the parcel row, not a second button in the bar.
    expect(screen.queryByRole('button', { name: '查看物流' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '申请售后' }));
    expect(taroFake.calls).toContainEqual({
      api: 'navigateTo',
      args: { url: '/packages/aftersale/apply/index?orderId=9001' },
    });

    fireEvent.click(screen.getByRole('button', { name: '确认收货' }));
    await waitFor(() =>
      expect(seen.map((r) => r.key)).toContain('POST /api/v1/orders/9001/receipt'),
    );
  });

  it('goes back after deleting a finished order', async () => {
    taroFake.routerParams = { id: '9001' };
    taroFake.pageStackDepth = 2;
    const seen = serveApi({
      'GET /api/v1/orders/9001': () => ({
        body: orderDetail({ status: 'cancelled', paidAmount: null, cancelReason: '超时未支付' }),
      }),
      'DELETE /api/v1/orders/9001': () => ({ body: { hidden: true } }),
      'GET /api/v1/orders': () => ({ body: { items: [], total: 0, page: 1, pageSize: 10 } }),
    });
    await renderPage(<OrderDetailPage />);
    await screen.findByText('超时未支付');

    fireEvent.click(screen.getByRole('button', { name: '删除订单' }));
    await waitFor(() => expect(taroFake.calls.some((c) => c.api === 'navigateBack')).toBe(true));
    expect(seen.map((r) => r.key)).toContain('DELETE /api/v1/orders/9001');
  });

  it('copies the order number', async () => {
    taroFake.routerParams = { id: '9001' };
    serveApi({ 'GET /api/v1/orders/9001': () => ({ body: orderDetail() }) });
    await renderPage(<OrderDetailPage />);
    fireEvent.click(await screen.findByRole('button', { name: '复制订单编号' }));
    expect(taroFake.calls).toContainEqual({
      api: 'setClipboardData',
      args: { data: '202602011000000010123456' },
    });
  });
});
