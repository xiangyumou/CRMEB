import { describe, expect, it } from 'vitest';
import { api as client } from '@/data/api';
import { serveApi } from '@/test/fake-api';
import { taroFake } from '@/test/taro-fake/taro';
import { confirmReceipt } from './receipt';

const received = { id: '9', status: 'received' };

describe('confirmReceipt', () => {
  it('asks first, then confirms with the plain call', async () => {
    const seen = serveApi({ 'POST /api/v1/orders/9/receipt': () => ({ body: received }) });
    await expect(confirmReceipt(client, '9')).resolves.toEqual({
      kind: 'confirmed',
      order: received,
    });
    expect(taroFake.calls.map((call) => call.api)).toContain('showModal');
    expect(seen.map((request) => request.key)).toEqual(['POST /api/v1/orders/9/receipt']);
    expect(seen[0]?.body).toEqual({});
  });

  it('does nothing when the shopper backs out', async () => {
    const seen = serveApi({});
    taroFake.modalConfirm = false;
    await expect(confirmReceipt(client, '9')).resolves.toEqual({ kind: 'cancelled' });
    expect(seen).toHaveLength(0);
  });

  it("reports the server's refusal as a message", async () => {
    serveApi({
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
});
