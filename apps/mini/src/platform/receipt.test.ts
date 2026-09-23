import { describe, expect, it } from 'vitest';
import { api as client } from '@/data/api';
import { serveApi } from '@/test/fake-api';
import { taroFake } from '@/test/taro-fake/taro';
import { confirmReceipt } from './receipt';

const received = { id: '9', status: 'received' };
const plain = { 'GET /api/v1/orders/9/wechat-receipt': () => ({ body: { receipt: null } }) };

describe('confirmReceipt', () => {
  it('asks first, then confirms with the plain call', async () => {
    const seen = serveApi({
      ...plain,
      'POST /api/v1/orders/9/receipt': () => ({ body: received }),
    });
    await expect(confirmReceipt(client, '9')).resolves.toEqual({
      kind: 'confirmed',
      order: received,
    });
    expect(taroFake.calls.map((call) => call.api)).toContain('showModal');
    expect(seen.map((request) => request.key)).toEqual([
      'GET /api/v1/orders/9/wechat-receipt',
      'POST /api/v1/orders/9/receipt',
    ]);
    expect(seen[1]?.body).toEqual({});
  });

  it('does nothing when the shopper backs out', async () => {
    const seen = serveApi(plain);
    taroFake.modalConfirm = false;
    await expect(confirmReceipt(client, '9')).resolves.toEqual({ kind: 'cancelled' });
    expect(seen.map((request) => request.key)).toEqual(['GET /api/v1/orders/9/wechat-receipt']);
  });

  it("reports the server's refusal as a message", async () => {
    serveApi({
      ...plain,
      'POST /api/v1/orders/9/receipt': () => ({
        status: 409,
        body: { code: 'ORDER_NOT_RECEIVABLE', message: '订单当前无法确认收货' },
      }),
    });
    await expect(confirmReceipt(client, '9')).resolves.toEqual({
      kind: 'failed',
      message: '订单当前无法确认收货',
    });
  });

  describe('a mini-program payment WeChat knows about', () => {
    const wechat = {
      'GET /api/v1/orders/9/wechat-receipt': () => ({
        body: { receipt: { transactionId: '4200' } },
      }),
    };

    it("opens WeChat's component instead of the dialog, then tells the server it was used", async () => {
      const seen = serveApi({
        ...wechat,
        'POST /api/v1/orders/9/receipt': () => ({ body: received }),
      });
      await expect(confirmReceipt(client, '9')).resolves.toMatchObject({ kind: 'confirmed' });
      expect(taroFake.calls.map((call) => call.api)).not.toContain('showModal');
      expect(taroFake.calls).toContainEqual({
        api: 'openBusinessView',
        args: { businessType: 'weappOrderConfirm', extraData: { transaction_id: '4200' } },
      });
      expect(seen[1]).toMatchObject({
        key: 'POST /api/v1/orders/9/receipt',
        body: { via: 'wechat-component' },
      });
    });

    it('leaves the order alone when the shopper closes the component', async () => {
      taroFake.businessViewStatus = 'cancel';
      const seen = serveApi(wechat);
      await expect(confirmReceipt(client, '9')).resolves.toEqual({ kind: 'cancelled' });
      expect(seen).toHaveLength(1);
    });

    it("passes on the server's 微信尚未确认收货", async () => {
      serveApi({
        ...wechat,
        'POST /api/v1/orders/9/receipt': () => ({
          status: 409,
          body: {
            code: 'ORDER_WECHAT_RECEIPT_UNCONFIRMED',
            message: '微信尚未确认收货，请稍后重试',
          },
        }),
      });
      await expect(confirmReceipt(client, '9')).resolves.toEqual({
        kind: 'failed',
        message: '微信尚未确认收货，请稍后重试',
      });
    });
  });
});
