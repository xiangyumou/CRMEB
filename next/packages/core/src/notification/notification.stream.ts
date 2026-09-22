import type Redis from 'ioredis';
import type { Ctx } from '../kernel/context';

/**
 * The SSE producer.
 *
 * P0-b's header bell already listens on `/admin-api/notifications/stream` with
 * a raw `EventSource`; this is the other half. The route handler subscribes to
 * one Redis channel per admin and forwards whatever arrives; the fan-out
 * publishes to it **after** the transaction that wrote the row has committed.
 *
 * ## Why a channel per admin, and not one channel with a recipient field
 *
 * A shared channel would deliver every admin's notifications to every connected
 * node, which then filters — so the filter is what enforces "an operator who
 * cannot see refunds is not told about one", and a filter is a thing you can
 * forget. Per-admin channels push that decision to the one place that already
 * makes it: the recipient query in `findAdminRecipients`. Redis handles tens of
 * thousands of channels without noticing.
 *
 * ## Why Pub/Sub and not a stream
 *
 * Pub/Sub is fire-and-forget: an admin with no browser open misses the push,
 * and that is correct, because the durable copy is the `notification_messages`
 * row the bell reads on connect. Making the push durable would give us two
 * sources of truth for the same badge.
 *
 * ## Why this file talks to Redis directly
 *
 * It is not a `*.repo.ts`, so it may not touch Drizzle — and it does not. Redis
 * is on `Ctx` for exactly this kind of use (the rate limiter and the config
 * cache do the same).
 */

/** Matches `adminNotification` in `apps/web/src/admin/notifications/types.ts`. */
export interface AdminStreamEvent {
  id: string;
  /** Domain-ish discriminator the bell uses for the icon, e.g. `admin_order_paid`. */
  type: string;
  title: string;
  body: string;
  link?: string;
  createdAt: string;
}

export function adminChannel(adminId: number): string {
  return `notifications:admin:${adminId}`;
}

/**
 * Publishes one event to one admin.
 *
 * Never throws. A Redis hiccup must not fail the effect that wrote the durable
 * message: the bell re-reads the inbox on its next connect, so a dropped push
 * costs a few seconds of latency and nothing else. Failing the effect would
 * instead re-run the whole fan-out and risk a second WeChat message for a
 * notification that was already delivered.
 */
export async function publishToAdmin(
  ctx: Ctx,
  adminId: number,
  event: AdminStreamEvent,
): Promise<void> {
  try {
    await ctx.redis.publish(adminChannel(adminId), JSON.stringify(event));
  } catch (error) {
    ctx.logger.warn({ err: error, adminId }, 'notification stream publish failed');
  }
}

/**
 * Subscribes to one admin's channel on a **dedicated** connection.
 *
 * ioredis puts a connection into subscriber mode, where ordinary commands are
 * refused, so this duplicates the shared client rather than borrowing it — the
 * one mistake that turns a notification bell into an outage of everything else
 * that uses Redis.
 *
 * Returns an unsubscribe function; the route handler calls it when the response
 * stream is cancelled, which Next signals through `request.signal`.
 */
export async function subscribeToAdmin(
  redis: Redis,
  adminId: number,
  onEvent: (raw: string) => void,
): Promise<() => Promise<void>> {
  const subscriber = redis.duplicate();
  const channel = adminChannel(adminId);

  subscriber.on('message', (incoming: string, payload: string) => {
    if (incoming === channel) onEvent(payload);
  });
  await subscriber.subscribe(channel);

  return async () => {
    try {
      await subscriber.unsubscribe(channel);
    } finally {
      subscriber.disconnect();
    }
  };
}
