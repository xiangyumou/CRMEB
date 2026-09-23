import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { admins } from '@shop/db/schema/auth';
import { products, productSkus } from '@shop/db/schema/catalog';
import { orderItems, orders, type OrderItemSnapshot } from '@shop/db/schema/order';
import { capitalFlows, paymentCallbacks } from '@shop/db/schema/payment';
import { refunds } from '@shop/db/schema/refund';
import { users } from '@shop/db/schema/user';
import {
  createTestCtx,
  flushTestRedis,
  forkTestCtx,
  startFakeWechatGateway,
  type FakeWechatGateway,
  type TestCtx,
} from '@shop/testing';
import { resetEffectHandlers } from '../effects';
import type { Actor, Ctx } from '../kernel/context';
import { installFulfilmentHooks } from '../order';
import { registerStockPort, resetOrderPorts } from '../order/ports';
import { handleTransactionNotify, paymentConfig, startPayment } from '../payment';
import { wechatConfig } from '../wechat';
import * as admin from './refund.admin';
import * as repo from './refund.repo';
import * as service from './refund.service';

/**
 * The two WeChat Pay webhooks, read as an attacker (K2, AUDIT.md K-SEC-P6,
 * K-SEC-P7, K-SEC-R6).
 *
 * Every notification here carries a *genuine* signature from the fake
 * gateway's platform key and a resource sealed with the shop's own APIv3 key —
 * so each case is one the verifier lets through, and the question is what the
 * code does with a well-signed body that is nonetheless wrong: meant for the
 * other endpoint, naming another merchant, or stating an amount that is not
 * the one we froze.
 *
 * The `it.fails` cases are the defects filed as CR-3-k2, CR-4-k2 and CR-5-k2.
 * They pass today *because* the assertion fails; each flips to a failure the
 * day the fix lands, which is the signal to turn it into a plain `it`.
 */

let harness: TestCtx;
let gateway: FakeWechatGateway;

const NOW = '2026-06-01T00:00:00.000Z';
const OTHER_MCH_ID = '1900000099';

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
  gateway = await startFakeWechatGateway({ now: () => harness.clock.now().getTime() });
}, 180_000);

afterAll(async () => {
  await gateway?.close();
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  // See refund.concurrency.int.test.ts: after a truncate the config cache
  // still holds the old keys, and `set` writes only what changed.
  await flushTestRedis(harness.redis);
  harness.clock.set(NOW);
  resetEffectHandlers();
  resetOrderPorts();
  installFulfilmentHooks();
  registerStockPort({
    async reserve() {
      return [];
    },
    async commit() {},
    async release() {},
  });
  gateway.transactions.clear();
  gateway.refunds.clear();
  gateway.calls.length = 0;
  gateway.behaviour.refundBalanceFen = null;
  gateway.behaviour.refundStatus = 'PROCESSING';
  gateway.behaviour.signResponsesWithWrongKey = false;
  gateway.behaviour.failNext = null;
  gateway.behaviour.dropNext = false;
  await configure();
});

afterEach(() => {
  resetEffectHandlers();
  resetOrderPorts();
  installFulfilmentHooks();
});

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const userActor = (id: number): Actor => ({ kind: 'user', id, permissions: [], isSuper: false });
const adminActor = (id: number): Actor => ({ kind: 'admin', id, permissions: [], isSuper: true });

function racer(actor?: Actor): Ctx {
  return forkTestCtx(harness, actor === undefined ? {} : { actor });
}

async function configure(): Promise<void> {
  await harness.ctx.config.set(paymentConfig, {
    mchId: gateway.keys.mchId,
    apiV3Key: gateway.keys.apiV3Key,
    certSerial: gateway.keys.merchantSerial,
    merchantPrivateKey: gateway.keys.merchantPrivateKeyPem,
    platformPublicKeyId: gateway.keys.platformSerial,
    platformPublicKey: gateway.keys.platformPublicKeyPem,
    notifyBaseUrl: 'https://shop.example.test',
    apiBaseUrl: gateway.url,
    payExpiryMinutes: 30,
  });
  await harness.ctx.config.set(wechatConfig, {
    miniAppId: gateway.keys.appId,
    oaAppId: gateway.keys.appId,
  });
}

let sequence = 0;

const snapshot: OrderItemSnapshot = {
  productName: '测试商品',
  productImageUrl: 'https://cdn.example.test/p.jpg',
  productKind: 'physical',
  skuCode: 'SKU-1',
  specText: '默认',
  specValues: {},
};

interface StartedOrder {
  orderId: number;
  userId: number;
  adminId: number;
  itemId: number;
  outTradeNo: string;
}

/**
 * One order, two units at 50.00, with a payment attempt submitted to the fake
 * gateway and the money taken there — but no notification delivered yet.
 */
async function paidAtGateway(): Promise<StartedOrder> {
  sequence += 1;
  const n = sequence;
  const db = harness.ctx.db;

  const [user] = await db
    .insert(users)
    .values({ account: `webhook-user-${n}` })
    .returning({ id: users.id });
  const [operator] = await db
    .insert(admins)
    .values({
      account: `webhook-admin-${n}`,
      passwordHash: 'x'.repeat(60),
      name: `运营${n}`,
      isSuper: true,
    })
    .returning({ id: admins.id });
  const [product] = await db
    .insert(products)
    .values({
      name: `测试商品 ${n}`,
      imageUrl: 'https://cdn.example.test/p.jpg',
      status: 'on_shelf',
      freightMode: 'free',
      price: '50.00',
    })
    .returning({ id: products.id });
  const [sku] = await db
    .insert(productSkus)
    .values({ productId: product!.id, skuCode: `WSKU${n}`, price: '50.00', stock: 100 })
    .returning({ id: productSkus.id });
  const [order] = await db
    .insert(orders)
    .values({
      orderNo: `WO${String(n).padStart(10, '0')}`,
      userId: user!.id,
      platform: 'wechat_mini',
      status: 'pending_payment',
      totalQuantity: 2,
      itemsAmount: '100.00',
      payableAmount: '100.00',
      payExpiresAt: new Date(Date.parse(NOW) + 30 * 60_000),
      receiverName: '张三',
      receiverPhone: '13800000000',
      receiverProvince: '广东省',
      receiverCity: '深圳市',
      receiverDetail: '某路 1 号',
    })
    .returning({ id: orders.id });
  const [item] = await db
    .insert(orderItems)
    .values({
      orderId: order!.id,
      productId: product!.id,
      skuId: sku!.id,
      itemKey: 'L1',
      quantity: 2,
      unitPrice: '50.00',
      totalAmount: '100.00',
      snapshot,
    })
    .returning({ id: orderItems.id });

  const intent = await startPayment(racer(userActor(user!.id)), {
    orderId: order!.id,
    channel: 'wechat_mini',
    openid: 'oFakeOpenid',
  });
  gateway.markPaid(intent.outTradeNo);

  return {
    orderId: order!.id,
    userId: user!.id,
    adminId: operator!.id,
    itemId: item!.id,
    outTradeNo: intent.outTradeNo,
  };
}

/** The same, with the payment notification delivered: a genuinely paid order. */
async function paidOrder(): Promise<StartedOrder> {
  const started = await paidAtGateway();
  const ack = await handleTransactionNotify(
    racer(),
    gateway.signTransactionNotification({ outTradeNo: started.outTradeNo }),
  );
  expect(ack.status).toBe(200);
  expect((await orderRow(started.orderId)).status).toBe('paid');
  return started;
}

/** One unit refunded, approved and sent: `processing` at the gateway. */
async function processingRefund(order: StartedOrder): Promise<{ id: number; outRefundNo: string }> {
  const applied = await service.apply(racer(userActor(order.userId)), {
    orderId: String(order.orderId),
    kind: 'refund_only',
    lines: [{ orderItemId: String(order.itemId), quantity: 1 }],
    reason: '不想要了',
    images: [],
    includeFreight: false,
  });
  const id = Number(applied.id);
  await admin.adminApprove(racer(adminActor(order.adminId)), { id: String(id) });
  const result = await service.executeRefund(racer(), id);
  expect(result.status).toBe('processing');
  const row = await repo.findRefund(harness.ctx.db, id);
  return { id, outRefundNo: row!.outRefundNo };
}

/** The decrypted transaction resource WeChat would send, one field bent. */
function transactionResource(
  outTradeNo: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const transaction = gateway.transactions.get(outTradeNo)!;
  return {
    appid: gateway.keys.appId,
    mchid: gateway.keys.mchId,
    out_trade_no: outTradeNo,
    transaction_id: transaction.transactionId,
    trade_type: 'JSAPI',
    trade_state: 'SUCCESS',
    trade_state_desc: '支付成功',
    success_time: NOW,
    payer: { openid: 'oFakeOpenid' },
    amount: { total: 10000, payer_total: 10000, currency: 'CNY' },
    ...overrides,
  };
}

/** The decrypted refund resource WeChat would send, one field bent. */
function refundResource(
  outRefundNo: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const refund = gateway.refunds.get(outRefundNo)!;
  return {
    mchid: gateway.keys.mchId,
    out_trade_no: refund.outTradeNo,
    transaction_id: refund.transactionId,
    out_refund_no: refund.outRefundNo,
    refund_id: refund.refundId,
    refund_status: 'SUCCESS',
    success_time: NOW,
    user_received_account: '支付用户零钱',
    amount: {
      total: refund.totalFen,
      refund: refund.refundFen,
      payer_total: refund.totalFen,
      payer_refund: refund.refundFen,
    },
    ...overrides,
  };
}

const orderRow = (id: number) =>
  harness.ctx.db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .then((rows) => rows[0]!);

const refundRow = (id: number) =>
  harness.ctx.db
    .select()
    .from(refunds)
    .where(eq(refunds.id, id))
    .then((rows) => rows[0]!);

const callbackRows = () => harness.ctx.db.select().from(paymentCallbacks);
const flowRows = (kind: 'order_payment' | 'order_refund') =>
  harness.ctx.db.select().from(capitalFlows).where(eq(capitalFlows.kind, kind));

// ---------------------------------------------------------------------------
// K-SEC-P6 — an event delivered to the endpoint it was not meant for
// ---------------------------------------------------------------------------

describe('K-SEC-P6 — a signed event delivered to the other webhook', () => {
  it('books nothing when a refund notification reaches the payment endpoint', async () => {
    const order = await paidOrder();
    const refund = await processingRefund(order);
    gateway.markRefunded(refund.outRefundNo, 'SUCCESS');
    const signed = gateway.signRefundNotification({ outRefundNo: refund.outRefundNo });

    const result = await handleTransactionNotify(racer(), signed);

    // Acknowledged, because the resource has no `trade_state` — which is the
    // only reason nothing happened. The refund is still in flight, and no
    // second payment was booked for the order.
    expect(result.status).toBe(200);
    expect((await refundRow(refund.id)).status).toBe('processing');
    expect(await flowRows('order_payment')).toHaveLength(1);
    expect(await flowRows('order_refund')).toEqual([]);
    expect((await orderRow(order.orderId)).refundedAmount).toBe('0.00');
  });

  it('books nothing when a payment notification reaches the refund endpoint', async () => {
    const started = await paidAtGateway();
    const signed = gateway.signTransactionNotification({ outTradeNo: started.outTradeNo });

    const result = await service.handleRefundNotify(racer(), signed);

    // No `out_refund_no`, so the refund domain ignores it.
    expect(result.status).toBe(200);
    expect((await orderRow(started.orderId)).status).toBe('pending_payment');
    expect(await flowRows('order_payment')).toEqual([]);
  });

  // CR-3-k2. Both webhooks write into one `payment_callbacks` table keyed by
  // `(mch_id, provider_notify_id)`, and each inserts its row *before* it knows
  // whether the event is one it handles. So a misrouted delivery burns the
  // notification id, and the genuine delivery that follows is taken for a
  // WeChat retry and acknowledged without booking anything: money taken at
  // the gateway, an order still `pending_payment`, and the auto-cancel job on
  // its way.
  it.fails('lets the genuine delivery book the payment after a misrouted copy of it', async () => {
    const started = await paidAtGateway();
    const signed = gateway.signTransactionNotification({ outTradeNo: started.outTradeNo });

    await service.handleRefundNotify(racer(), signed);

    const genuine = await handleTransactionNotify(racer(), signed);
    expect(genuine.status).toBe(200);
    expect((await orderRow(started.orderId)).status).toBe('paid');
  });
});

// ---------------------------------------------------------------------------
// K-SEC-P7 — a notification that names another merchant
// ---------------------------------------------------------------------------

describe('K-SEC-P7 — a well-signed notification naming another merchant', () => {
  // CR-4-k2. `mchid` is read from the resource, compared with the configured
  // merchant, logged when it differs — and then settled anyway, with the
  // foreign merchant written onto the capital flow. The AEAD key is the only
  // thing binding the body to this shop; the merchant number is the second
  // lock, and it is not turned.
  it.fails('never marks an order paid on a transaction another merchant collected', async () => {
    const started = await paidAtGateway();
    const signed = gateway.signTransactionNotification({
      outTradeNo: started.outTradeNo,
      resource: transactionResource(started.outTradeNo, { mchid: OTHER_MCH_ID }),
    });

    const result = await handleTransactionNotify(racer(), signed);

    expect(result.status).toBe(200);
    expect((await orderRow(started.orderId)).status).toBe('pending_payment');
    expect(await flowRows('order_payment')).toEqual([]);
  });

  it.fails('never settles a refund on a notification from another merchant', async () => {
    const order = await paidOrder();
    const refund = await processingRefund(order);
    gateway.markRefunded(refund.outRefundNo, 'SUCCESS');
    const signed = gateway.signRefundNotification({
      outRefundNo: refund.outRefundNo,
      resource: refundResource(refund.outRefundNo, { mchid: OTHER_MCH_ID }),
    });

    const result = await service.handleRefundNotify(racer(), signed);

    expect(result.status).toBe(200);
    expect((await refundRow(refund.id)).status).toBe('processing');
    expect((await orderRow(order.orderId)).refundedAmount).toBe('0.00');
  });

  it('records the merchant it was told on the callback row, so the mismatch is at least visible', async () => {
    const started = await paidAtGateway();
    const signed = gateway.signTransactionNotification({
      outTradeNo: started.outTradeNo,
      resource: transactionResource(started.outTradeNo, { mchid: OTHER_MCH_ID }),
    });

    await handleTransactionNotify(racer(), signed);

    const [row] = await callbackRows();
    expect(row!.mchId).toBe(OTHER_MCH_ID);
  });
});

// ---------------------------------------------------------------------------
// K-SEC-R6 — the amount a refund notification states
// ---------------------------------------------------------------------------

describe('K-SEC-R6 — the amount inside a refund notification', () => {
  it('can never change the amount booked: settlement uses the frozen amount', async () => {
    const order = await paidOrder();
    const refund = await processingRefund(order);
    gateway.markRefunded(refund.outRefundNo, 'SUCCESS');
    // A signed body that claims WeChat gave back all 100.00, not the 50.00 we sent.
    const signed = gateway.signRefundNotification({
      outRefundNo: refund.outRefundNo,
      resource: refundResource(refund.outRefundNo, {
        amount: { total: 10000, refund: 10000, payer_total: 10000, payer_refund: 10000 },
      }),
    });

    await service.handleRefundNotify(racer(), signed);

    const row = await refundRow(refund.id);
    expect(row.refundedAmount).toBe('50.00');
    expect((await orderRow(order.orderId)).refundedAmount).toBe('50.00');
  });

  // CR-5-k2. The notified `amount.refund` is never read, so a gateway that
  // gave back one fen against the 50.00 we asked for is booked as a 50.00
  // refund — the shopper is owed 49.99 and every ledger says they were paid.
  // The payment webhook refuses a disagreeing amount into an exception
  // (GATEWAY-001); the refund webhook should not be the softer of the two.
  it.fails(
    'does not book a refund whose notified amount disagrees with the frozen one',
    async () => {
      const order = await paidOrder();
      const refund = await processingRefund(order);
      gateway.markRefunded(refund.outRefundNo, 'SUCCESS');
      const signed = gateway.signRefundNotification({
        outRefundNo: refund.outRefundNo,
        resource: refundResource(refund.outRefundNo, {
          amount: { total: 10000, refund: 1, payer_total: 10000, payer_refund: 1 },
        }),
      });

      const result = await service.handleRefundNotify(racer(), signed);

      expect(result.status).toBe(200);
      expect((await refundRow(refund.id)).status).not.toBe('succeeded');
      expect((await orderRow(order.orderId)).refundedAmount).toBe('0.00');
      expect(await flowRows('order_refund')).toEqual([]);
    },
  );
});
