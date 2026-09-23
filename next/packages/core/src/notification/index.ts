/**
 * The `notification` domain's public surface.
 *
 * **One function is the whole contract for other domains:**
 *
 * ```ts
 * await notify(tx, ctx, {
 *   event: 'order_shipped',
 *   subject: { scope: 'order', id: orderId },
 *   userId,
 *   data: { orderNo, company, trackingNo },
 * });
 * ```
 *
 * Call it inside the business transaction. It writes one effect row and
 * returns; the dispatcher fans out to whichever channels the operator switched
 * on, after the commit. A failing channel therefore cannot fail an order, a
 * payment or a refund, and the ledger's `UNIQUE (scope, scope_id, event_type)`
 * means calling it twice for the same event and the same aggregate notifies
 * once.
 *
 * `registerNotificationEvents` is exported for the same reason the permission
 * registry is: a domain that owns an event owns its wording. Stream D's
 * group-buy notifications belong in D's `index.ts`, not in this file's table.
 */

export {
  notify,
  notificationKey,
  NOTIFICATION_SCOPE,
  type NotifyInput,
} from './notification.service';

export {
  registerNotificationEvents,
  findNotificationEvent,
  allNotificationEvents,
  type NotificationEvent,
  type NotificationAudience,
} from './notification.registry';

export { registerSmsPort, type SmsPort, type SmsSendResult } from './notification.ports';

export { notificationConfig, type NotificationConfig } from './notification.config';
export { notificationPermissions } from './permissions';

/** The SSE endpoint's half; `apps/web` owns the route, this owns the subscription. */
export {
  subscribeToAdmin,
  adminChannel,
  openAdminStreams,
  AdminStreamLimitError,
  MAX_STREAMS_PER_ADMIN,
  type AdminStreamEvent,
} from './notification.stream';

// The two read surfaces the route files call.
export * as notificationAdmin from './notification.admin.service';
export * as notificationInbox from './notification.inbox.service';

import { registerBuiltInNotificationEvents } from './notification.registry';
import { installNotificationHooks } from './notification.effects';

/**
 * Idempotent, and the only place registration happens.
 *
 * `@shop/core/domains` calls it once per app at bootstrap. Registering from a
 * job or a route file is what left `refund.execute` parked as `unknown`
 * (CR-8-c): the registration then depends on which module a request happened to
 * load first.
 */
export function registerNotificationDomain(): void {
  registerBuiltInNotificationEvents();
  installNotificationHooks();
}
