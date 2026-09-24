import { beforeAll, describe, expect, it } from 'vitest';
import { registerGroupbuyNotificationEvents } from '../groupbuy/groupbuy.notifications';
import { registerPaymentNotificationEvents } from '../payment/payment.notifications';
import { registerPresaleNotificationEvents } from '../presale/presale.notifications';
import { registerRefundNotificationEvents } from '../refund/refund.notifications';
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
