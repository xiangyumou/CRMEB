import { beforeAll, describe, expect, it } from 'vitest';
// Test-only: each domain's event declarations, without the domain itself (its
// `index.ts` would pull in its services and repositories for a pure check).
/* eslint-disable boundaries/core-cross-domain */
import { registerGroupbuyNotificationEvents } from '../groupbuy/groupbuy.notifications';
import { registerPaymentNotificationEvents } from '../payment/payment.notifications';
import { registerPresaleNotificationEvents } from '../presale/presale.notifications';
import { registerRefundNotificationEvents } from '../refund/refund.notifications';
/* eslint-enable boundaries/core-cross-domain */
import { allNotificationEvents, registerBuiltInNotificationEvents } from './notification.registry';
import { placeholdersIn } from './notification.render';

beforeAll(() => {
  registerBuiltInNotificationEvents();
  registerGroupbuyNotificationEvents();
  registerPresaleNotificationEvents();
  registerPaymentNotificationEvents();
  registerRefundNotificationEvents();
});

describe('NOTIF-007 — an event’s wording names only the variables it declares', () => {
  it('declares every placeholder its default title, body, link and route use', () => {
    const undeclared = allNotificationEvents().flatMap((event) => {
      const wording = [
        event.defaults.title,
        event.defaults.body,
        event.link ?? '',
        ...Object.values(event.route?.params ?? {}),
      ].join(' ');
      return placeholdersIn(wording)
        .filter((name) => !event.variables.includes(name))
        .map((name) => `${event.code}: {{${name}}}`);
    });
    expect(undeclared).toEqual([]);
  });
});

describe('NOTIF-009 — an event offers only the variables its senders fill', () => {
  it('lists no nickname, no amount where the hook carries none, and no event nothing sends', () => {
    const events = new Map(allNotificationEvents().map((event) => [event.code, event]));
    expect(
      [...events.values()]
        .filter((event) => event.variables.includes('nickname'))
        .map((e) => e.code),
    ).toEqual([]);
    expect(events.get('order_cancelled')?.variables).toEqual(['orderId', 'orderNo', 'reason']);
    expect(events.get('order_completed')?.variables).toEqual(['orderId', 'orderNo']);
    expect(events.has('order_unpaid_reminder')).toBe(false);
    // 用户确认收货提醒 is sent now, from the fulfilment notifier.
    expect(events.get('admin_order_received')?.variables).toEqual(['orderId', 'orderNo', 'amount']);
  });
});
