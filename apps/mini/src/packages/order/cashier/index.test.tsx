import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiClientProvider } from '@shop/api-client/react';
import { api } from '@/data/api';
import { useSession } from '@/features/session/session';
import { serveApi, type SeenRequest } from '@/test/fake-api';
import { renderWithQuery } from '@/test/render';
import { taroFake } from '@/test/taro-fake/taro';
import CashierPage from './index';

const order = {
  id: '9',
  orderNo: '202609230000000000000009',
  status: 'pending_payment',
  payableAmount: '59.00',
};
const intent = (alreadyPaid: boolean) => ({
  attemptId: '1',
  orderId: '9',
  outTradeNo: 'P9',
  channel: 'wechat_mini',
  amount: '59.00',
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
  expiresAt: '2026-09-23T12:00:00.000Z',
});

function renderCashier(alreadyPaid = false): SeenRequest[] {
  const seen = serveApi({
    'GET /api/v1/orders/9': () => ({ body: order }),
    'POST /api/v1/orders/9/payments': () => ({ status: 201, body: intent(alreadyPaid) }),
  });
  renderWithQuery(
    <ApiClientProvider client={api}>
      <CashierPage />
    </ApiClientProvider>,
  );
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
  });

  it('pays with wechat_mini and goes on to the result page', async () => {
    const seen = renderCashier();
    await screen.findByText('¥59.00');
    fireEvent.click(screen.getByRole('button', { name: '微信支付' }));

    await waitFor(() => expect(taroFake.calls).toContainEqual(toResult));
    expect(seen.find((r) => r.key === 'POST /api/v1/orders/9/payments')?.body).toEqual({
      channel: 'wechat_mini',
    });
    expect(taroFake.calls.some((call) => call.api === 'requestPayment')).toBe(true);
  });

  it('stays when the shopper closes the payment sheet', async () => {
    taroFake.paymentError = 'requestPayment:fail cancel';
    renderCashier();
    fireEvent.click(await screen.findByRole('button', { name: '微信支付' }));

    await screen.findByText('已取消支付，订单会为你保留一段时间');
    expect(taroFake.calls.some((call) => call.api === 'redirectTo')).toBe(false);
  });

  it('skips the sheet when the order is already paid', async () => {
    renderCashier(true);
    fireEvent.click(await screen.findByRole('button', { name: '微信支付' }));

    await waitFor(() => expect(taroFake.calls).toContainEqual(toResult));
    expect(taroFake.calls.some((call) => call.api === 'requestPayment')).toBe(false);
  });
});
