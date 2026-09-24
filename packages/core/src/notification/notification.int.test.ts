import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { admins, adminRoles, rolePermissions, roles } from '@shop/db/schema/auth';
import { notificationMessages, notificationTemplates } from '@shop/db/schema/notification';
import { effects as effectsTable } from '@shop/db/schema/system';
import { users } from '@shop/db/schema/user';
import { createTestCtx, forkTestCtx, runConcurrently, type TestCtx } from '@shop/testing';
import { dispatchEffectsOnce, findEffect, listEffectsByStatus } from '../effects';
import { withTx } from '../kernel/tx';
import { registerBuiltInNotificationEvents } from './notification.registry';
import { registerSmsPort, resetNotificationPorts, type SmsPort } from './notification.ports';
import { adminChannel, subscribeToAdmin } from './notification.stream';
import { notify, NOTIFICATION_EVENT_TYPE, NOTIFICATION_SCOPE } from './notification.service';
// Imported for its side effect: the module registers the `notification.send`
// effect handler at import time, which is what the dispatcher looks up.
import './notification.effects';

/**
 * The three promises this domain makes to every other one.
 *
 * 1. A channel that fails never fails the business transaction, and is retried.
 * 2. The same event for the same aggregate notifies **once**, however many
 *    callers ask and however many dispatchers are running.
 * 3. An admin notification reaches the admins who may see it, over SSE, and
 *    only them.
 *
 * Everything here runs against the real PostgreSQL and the real Redis. The only
 * fake is the SMS port, a seam onto the `sms` domain — no test in this file
 * calls a WeChat or SMS endpoint, and the WeChat channels stay unconfigured so
 * they are skipped rather than attempted.
 */

let harness: TestCtx;
let sequence = 0;

beforeAll(async () => {
  harness = await createTestCtx();
  registerBuiltInNotificationEvents();
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  resetNotificationPorts();
});

afterEach(() => {
  resetNotificationPorts();
});

async function makeUser(): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(users)
    .values({ account: `notify-${sequence}` })
    .returning({ id: users.id });
  return row!.id;
}

async function makeAdmin(options: { permissions?: string[]; isSuper?: boolean } = {}) {
  sequence += 1;
  const [admin] = await harness.ctx.db
    .insert(admins)
    .values({
      account: `admin-${sequence}`,
      passwordHash: 'x',
      passwordAlgo: 'bcrypt',
      name: `管理员 ${sequence}`,
      isSuper: options.isSuper ?? false,
    })
    .returning({ id: admins.id });
  const adminId = admin!.id;

  if (options.permissions && options.permissions.length > 0) {
    const [role] = await harness.ctx.db
      .insert(roles)
      .values({ name: `role-${sequence}` })
      .returning({ id: roles.id });
    await harness.ctx.db.insert(adminRoles).values({ adminId, roleId: role!.id });
    await harness.ctx.db
      .insert(rolePermissions)
      .values(options.permissions.map((permission) => ({ roleId: role!.id, permission })));
  }
  return adminId;
}

/** `notify` as a domain calls it: inside a transaction that also does real work. */
async function record(input: {
  event: string;
  subject: { scope: string; id: string | number };
  userId?: number;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  return withTx(harness.ctx.db, (tx) => notify(tx, harness.ctx, input));
}

async function messagesFor(column: 'userId' | 'adminId', id: number) {
  return harness.ctx.db
    .select()
    .from(notificationMessages)
    .where(eq(notificationMessages[column], id));
}

/** Turns a channel on for one event, after the first fan-out seeded the row. */
async function enableSms(code: string, templateCode = 'SMS_1'): Promise<void> {
  const [row] = await harness.ctx.db
    .select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.code, code));
  await harness.ctx.db
    .update(notificationTemplates)
    .set({ channels: { ...row!.channels, sms: { enabled: true, templateCode } } })
    .where(eq(notificationTemplates.code, code));
}

function smsPort(
  behaviour: () => { ok: boolean; errorCode?: string },
): SmsPort & { calls: number } {
  const port = {
    calls: 0,
    async send() {
      port.calls += 1;
      return behaviour();
    },
  };
  return port;
}

describe('notify', () => {
  it('writes an effect row inside the caller transaction and sends nothing yet', async () => {
    const userId = await makeUser();
    expect(await record({ event: 'order_paid', subject: { scope: 'order', id: 7 }, userId })).toBe(
      true,
    );

    const effect = await findEffect(harness.ctx.db, {
      scope: NOTIFICATION_SCOPE,
      scopeId: 'order_paid:order:7',
      eventType: NOTIFICATION_EVENT_TYPE,
    });
    expect(effect).toMatchObject({ status: 'pending' });
    expect(await messagesFor('userId', userId)).toHaveLength(0);
  });

  it('is rolled back with the business change it belongs to', async () => {
    const userId = await makeUser();
    await expect(
      withTx(harness.ctx.db, async (tx) => {
        await notify(tx, harness.ctx, {
          event: 'order_paid',
          subject: { scope: 'order', id: 8 },
          userId,
        });
        throw new Error('支付失败');
      }),
    ).rejects.toThrow('支付失败');
    expect(await listEffectsByStatus(harness.ctx.db, 'pending')).toHaveLength(0);
  });

  it('drops an event nobody registered rather than failing the order', async () => {
    const userId = await makeUser();
    expect(
      await record({ event: 'no_such_event', subject: { scope: 'order', id: 9 }, userId }),
    ).toBe(false);
    expect(await listEffectsByStatus(harness.ctx.db, 'pending')).toHaveLength(0);
  });

  it('records the same event for the same aggregate once, twice for two aggregates', async () => {
    const userId = await makeUser();
    expect(await record({ event: 'order_paid', subject: { scope: 'order', id: 1 }, userId })).toBe(
      true,
    );
    expect(await record({ event: 'order_paid', subject: { scope: 'order', id: 1 }, userId })).toBe(
      false,
    );
    expect(await record({ event: 'order_paid', subject: { scope: 'order', id: 2 }, userId })).toBe(
      true,
    );
    expect(await listEffectsByStatus(harness.ctx.db, 'pending')).toHaveLength(2);
  });
});

describe('fan-out', () => {
  it('seeds the template from the registry and writes the in-app message — NOTIF-006', async () => {
    const userId = await makeUser();
    await record({
      event: 'order_paid',
      subject: { scope: 'order', id: 11 },
      userId,
      data: { orderNo: 'SO11', amount: '99.00', orderId: 11 },
    });

    expect(await dispatchEffectsOnce(harness.ctx)).toMatchObject({ claimed: 1, done: 1 });

    const [template] = await harness.ctx.db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.code, 'order_paid'));
    expect(template?.channels.inApp?.enabled).toBe(true);
    // Everything that costs money or needs a credential is seeded off.
    expect(template?.channels.sms?.enabled).toBe(false);
    expect(template?.channels.wechatOa?.enabled).toBe(false);

    const [message] = await messagesFor('userId', userId);
    expect(message).toMatchObject({ code: 'order_paid', audience: 'user', title: '支付成功' });
    expect(message?.content).toBe('订单 SO11 已支付 ¥99.00，我们会尽快发货。');
    expect(message?.data).toMatchObject({ route: { route: 'order', params: { id: '11' } } });
    expect(message?.data).not.toHaveProperty('link');
    expect(message?.readAt).toBeNull();
  });

  it('sends in-app from a template shell the reference-data seed wrote with no channels', async () => {
    // The row `db:seed` writes on every deploy: code, name, audience and
    // variables, and `channels` left at its `{}` default.
    await harness.ctx.db.insert(notificationTemplates).values({
      code: 'order_paid',
      name: '支付成功提醒',
      audience: 'user',
      variables: ['orderNo', 'amount', 'productName'],
    });
    const userId = await makeUser();
    await record({
      event: 'order_paid',
      subject: { scope: 'order', id: 14 },
      userId,
      data: { orderNo: 'SO14', amount: '10.00', orderId: 14 },
    });

    expect(await dispatchEffectsOnce(harness.ctx)).toMatchObject({ claimed: 1, done: 1 });
    const [message] = await messagesFor('userId', userId);
    expect(message?.content).toBe('订单 SO14 已支付 ¥10.00，我们会尽快发货。');
  });

  it('does not send at all when the operator turned the event off', async () => {
    const userId = await makeUser();
    await record({ event: 'order_paid', subject: { scope: 'order', id: 12 }, userId });
    await dispatchEffectsOnce(harness.ctx);
    await harness.ctx.db
      .update(notificationTemplates)
      .set({ isEnabled: false })
      .where(eq(notificationTemplates.code, 'order_paid'));

    await record({ event: 'order_paid', subject: { scope: 'order', id: 13 }, userId });
    await dispatchEffectsOnce(harness.ctx);
    expect(await messagesFor('userId', userId)).toHaveLength(1);
  });

  it('delivers the same notification once when two dispatchers race it', async () => {
    const userIds = await Promise.all([1, 2, 3, 4].map(() => makeUser()));
    for (const [index, userId] of userIds.entries()) {
      await record({ event: 'order_paid', subject: { scope: 'order', id: 100 + index }, userId });
    }

    const second = forkTestCtx(harness);
    const report = await runConcurrently(2, (index) =>
      dispatchEffectsOnce(index === 0 ? harness.ctx : second, { batchSize: 4 }),
    );
    expect(report.rejected).toEqual([]);

    // Four notifications, four inboxes, one message each — whichever dispatcher
    // claimed which row.
    for (const userId of userIds) {
      expect(await messagesFor('userId', userId)).toHaveLength(1);
    }
    expect(await listEffectsByStatus(harness.ctx.db, 'pending')).toHaveLength(0);
  });
});

describe('a channel that fails', () => {
  it('retries the effect, keeps the message it already delivered, and never duplicates it', async () => {
    const userId = await makeUser();

    // Seed the template by running one notification through, then switch SMS on.
    await record({ event: 'order_paid', subject: { scope: 'order', id: 20 }, userId });
    await dispatchEffectsOnce(harness.ctx);
    await enableSms('order_paid');

    const failing = smsPort(() => ({ ok: false, errorCode: 'isv.BUSINESS_LIMIT_CONTROL' }));
    registerSmsPort(failing);

    // The business transaction commits regardless — `notify` only writes a row.
    await record({
      event: 'order_paid',
      subject: { scope: 'order', id: 21 },
      userId,
      data: { orderNo: 'SO21', amount: '10.00' },
    });

    const first = await dispatchEffectsOnce(harness.ctx);
    expect(first).toMatchObject({ claimed: 1, done: 0, retried: 1, parked: 0 });
    expect(failing.calls).toBe(1);

    const key = {
      scope: NOTIFICATION_SCOPE,
      scopeId: 'order_paid:order:21',
      eventType: NOTIFICATION_EVENT_TYPE,
    };
    const parked = await findEffect(harness.ctx.db, key);
    expect(parked).toMatchObject({ status: 'pending', attempts: 1 });
    expect(parked?.lastError ?? '').toContain('sms');

    // The in-app copy went out on the first attempt and must not go out again.
    expect(await messagesFor('userId', userId)).toHaveLength(2);

    const working = smsPort(() => ({ ok: true }));
    registerSmsPort(working);
    harness.clock.advance(60_000);

    const second = await dispatchEffectsOnce(harness.ctx);
    expect(second).toMatchObject({ claimed: 1, done: 1 });
    expect(working.calls).toBe(1);
    expect((await findEffect(harness.ctx.db, key))?.status).toBe('done');
    // Still two: the retry re-sent only the channel that had not claimed.
    expect(await messagesFor('userId', userId)).toHaveLength(2);
  });

  it('skips, rather than fails, a channel no provider is wired for', async () => {
    const userId = await makeUser();
    await record({ event: 'order_paid', subject: { scope: 'order', id: 22 }, userId });
    await dispatchEffectsOnce(harness.ctx);
    await enableSms('order_paid');

    // No `registerSmsPort` at all — a shop with no SMS account is normal.
    await record({ event: 'order_paid', subject: { scope: 'order', id: 23 }, userId });
    expect(await dispatchEffectsOnce(harness.ctx)).toMatchObject({ done: 1, retried: 0 });
  });

  it('skips a channel the operator left unconfigured', async () => {
    const userId = await makeUser();
    await record({ event: 'order_paid', subject: { scope: 'order', id: 24 }, userId });
    await dispatchEffectsOnce(harness.ctx);
    await enableSms('order_paid', '');
    registerSmsPort(smsPort(() => ({ ok: false })));

    await record({ event: 'order_paid', subject: { scope: 'order', id: 25 }, userId });
    expect(await dispatchEffectsOnce(harness.ctx)).toMatchObject({ done: 1, retried: 0 });
  });
});

describe('admin fan-out and the SSE bell', () => {
  /** Collects what one admin's channel receives, the way the route handler does. */
  async function listen(adminId: number) {
    const received: string[] = [];
    const unsubscribe = await subscribeToAdmin(harness.redis, adminId, (raw) => {
      received.push(raw);
    });
    return { received, unsubscribe };
  }

  it('reaches every admin who may see the event, over SSE, and nobody else', async () => {
    // Sequentially: the seed counter that keeps the accounts' names unique is
    // not itself concurrency-safe, and this test is not about that.
    const orders1 = await makeAdmin({ permissions: ['order:order:read'] });
    const orders2 = await makeAdmin({ permissions: ['order:order:read'] });
    const warehouse = await makeAdmin({ permissions: ['catalog:product:read'] });

    const listeners = await Promise.all([listen(orders1), listen(orders2), listen(warehouse)]);

    await record({
      event: 'admin_order_paid',
      subject: { scope: 'order', id: 30 },
      data: { orderNo: 'SO30', amount: '5.00', orderId: 30 },
    });
    expect(await dispatchEffectsOnce(harness.ctx)).toMatchObject({ done: 1 });

    // Pub/Sub delivery is asynchronous; give the subscriber connections a turn.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(listeners[0]!.received).toHaveLength(1);
    expect(listeners[1]!.received).toHaveLength(1);
    // The atom is what decides. 库存 has no business being woken by an order.
    expect(listeners[2]!.received).toEqual([]);

    const payload = JSON.parse(listeners[0]!.received[0]!) as Record<string, unknown>;
    expect(payload).toMatchObject({
      type: 'admin_order_paid',
      title: '新的已付款订单',
      link: '/admin/orders/30',
    });
    expect(payload['body']).toBe('订单 SO30 已付款，金额 ¥5.00。');
    // The id is the durable row's, so the bell and the inbox agree.
    const stored = await messagesFor('adminId', orders1);
    expect(payload['id']).toBe(String(stored[0]!.id));

    expect(await messagesFor('adminId', warehouse)).toHaveLength(0);

    await Promise.all(listeners.map((listener) => listener.unsubscribe()));
  });

  it('reaches a super admin without any explicit grant', async () => {
    const superAdmin = await makeAdmin({ isSuper: true });
    await record({ event: 'admin_order_paid', subject: { scope: 'order', id: 31 } });
    await dispatchEffectsOnce(harness.ctx);
    expect(await messagesFor('adminId', superAdmin)).toHaveLength(1);
  });

  it('leaves a disabled account out, so a departed colleague stops accruing 站内信', async () => {
    const leaver = await makeAdmin({ permissions: ['order:order:read'] });
    await harness.ctx.db.update(admins).set({ status: 0 }).where(eq(admins.id, leaver));
    await makeAdmin({ permissions: ['order:order:read'] });

    await record({ event: 'admin_order_paid', subject: { scope: 'order', id: 32 } });
    await dispatchEffectsOnce(harness.ctx);
    expect(await messagesFor('adminId', leaver)).toHaveLength(0);
  });

  it('is done, not failed, when no account holds the event’s atom', async () => {
    await makeAdmin({ permissions: ['catalog:product:read'] });
    await record({ event: 'admin_refund_applied', subject: { scope: 'refund', id: 33 } });
    expect(await dispatchEffectsOnce(harness.ctx)).toMatchObject({ done: 1, retried: 0 });
    const rows = await harness.ctx.db.select().from(effectsTable);
    expect(rows[0]).toMatchObject({ status: 'done' });
  });

  it('publishes on one channel per admin', () => {
    expect(adminChannel(42)).toBe('notifications:admin:42');
  });
});
