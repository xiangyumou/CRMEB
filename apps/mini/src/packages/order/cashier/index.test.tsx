import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppConfigStore } from '@/app-config';
import { useSession } from '@/session/session';
import { appConfigFixture } from '@/test/app-config-fixture';
import { orderFixture } from '@/test/checkout-fixture';
import { serveApi, type FakeReply, type SeenRequest } from '@/test/fake-api';
import { renderPage } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import CashierPage from './index';

type Routes = Record<string, (body: unknown) => FakeReply>;

const intent = (alreadyPaid: boolean) => ({
  attemptId: '1',
  orderId: '9',
  outTradeNo: 'P9',
  channel: 'wechat_mini',
  amount: '116.00',
  status: alreadyPaid ? 'paid' : 'submitted',
  alreadyPaid,
  jsapi: alreadyPaid
    ? null
    : {
        appId: 'wxmini',
        timeStamp: '1',
        nonceStr: 'n',
        package: 'prepay_id=wx9',
        signType: 'RSA',
        paySign: 's',
      },
  h5Url: null,
  expiresAt: '2099-01-01T00:00:00+08:00',
});

async function renderCashier(alreadyPaid = false, overrides: Routes = {}): Promise<SeenRequest[]> {
  const seen = serveApi({
    'GET /api/v1/orders/9': () => ({ body: orderFixture() }),
    'POST /api/v1/orders/9/payments': () => ({ status: 201, body: intent(alreadyPaid) }),
    ...overrides,
  });
  await renderPage(<CashierPage />);
  return seen;
}

const toResult = {
  api: 'redirectTo',
  args: { url: '/packages/order/pay-result/index?orderId=9&outTradeNo=P9' },
};

describe('收银台', () => {
  beforeEach(() => {
    taroFake.routerParams = { orderId: '9' };
    useSession.setState({ session: { status: 'signed-in', token: 't' } });
    useAppConfigStore.setState({ config: appConfigFixture, source: 'network' });
  });

  it('shows the amount and the time left, pays with wechat_mini and goes on to the result', async () => {
    const seen = await renderCashier();
    expect(await screen.findByLabelText('价格 116 元')).toBeTruthy();
    expect(screen.getByText('支付剩余时间')).toBeTruthy();
    expect(screen.getByText('订单编号 202609230000000000000009')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '微信支付' }));

    await waitFor(() => expect(taroFake.calls).toContainEqual(toResult));
    expect(seen.find((r) => r.key === 'POST /api/v1/orders/9/payments')?.body).toEqual({
      channel: 'wechat_mini',
    });
    expect(taroFake.calls.some((call) => call.api === 'requestPayment')).toBe(true);
  });

  it('stays when the shopper closes the payment sheet', async () => {
    taroFake.paymentError = 'requestPayment:fail cancel';
    await renderCashier();
    fireEvent.click(await screen.findByRole('button', { name: '微信支付' }));

    await screen.findByText('已取消支付，订单会为你保留一段时间');
    expect(taroFake.calls.some((call) => call.api === 'redirectTo')).toBe(false);
  });

  it('asks the server after a failed payment, then offers 重新支付', async () => {
    taroFake.paymentError = 'requestPayment:fail 余额不足';
    const seen = await renderCashier(false, {
      'GET /api/v1/payments/P9': () => ({
        body: { outTradeNo: 'P9', orderId: '9', status: 'failed', paid: false, paidAt: null },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: '微信支付' }));

    expect(await screen.findByText(/支付没有完成/)).toBeTruthy();
    expect(seen.some((r) => r.key === 'GET /api/v1/payments/P9')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '重新支付' }));
    await waitFor(() =>
      expect(seen.filter((r) => r.key === 'POST /api/v1/orders/9/payments')).toHaveLength(2),
    );
  });

  it('goes on to the result when the server says a failed sheet was paid after all', async () => {
    taroFake.paymentError = 'requestPayment:fail 网络异常';
    await renderCashier(false, {
      'GET /api/v1/payments/P9': () => ({
        body: { outTradeNo: 'P9', orderId: '9', status: 'paid', paid: true, paidAt: null },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: '微信支付' }));
    await waitFor(() => expect(taroFake.calls).toContainEqual(toResult));
  });

  it('skips the sheet when the order is already paid', async () => {
    await renderCashier(true);
    fireEvent.click(await screen.findByRole('button', { name: '微信支付' }));

    await waitFor(() => expect(taroFake.calls).toContainEqual(toResult));
    expect(taroFake.calls.some((call) => call.api === 'requestPayment')).toBe(false);
  });

  it('says a closed order is closed', async () => {
    await renderCashier(false, {
      'GET /api/v1/orders/9': () => ({
        body: orderFixture({ status: 'cancelled', payExpiresAt: null }),
      }),
    });
    expect(await screen.findByText('订单已关闭')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看订单' }));
    expect(taroFake.calls).toContainEqual({
      api: 'redirectTo',
      args: { url: '/packages/order/detail/index?id=9' },
    });
  });

  it('closes itself when the order expired at the gateway', async () => {
    await renderCashier(false, {
      'POST /api/v1/orders/9/payments': () => ({
        status: 409,
        body: { code: 'PAYMENT_ORDER_EXPIRED', message: '订单已过期' },
      }),
    });
    fireEvent.click(await screen.findByRole('button', { name: '微信支付' }));
    expect(await screen.findByText('订单已关闭')).toBeTruthy();
  });
});
