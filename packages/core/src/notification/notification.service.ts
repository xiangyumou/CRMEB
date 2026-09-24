import type { NotificationChannel } from '@shop/contracts/notification/schemas';
import type { Tx } from '@shop/db';
import { recordEffect, type Effect } from '../effects';
import type { Ctx } from '../kernel/context';
import * as repo from './notification.repo';
import type { NotificationChannels } from './notification.repo';
import { findNotificationEvent, type NotificationEvent } from './notification.registry';
import {
  renderInApp,
  sendSms,
  sendWechatMini,
  sendWechatOa,
  toTemplateData,
  type ChannelOutcome,
} from './notification.send';
import { publishToAdmin, type AdminStreamEvent } from './notification.stream';
import { placeholdersIn, render, renderRoute } from './notification.render';

/**
 * One entry point for every domain: `notify(tx, ctx, input)`.
 *
 * ## Why it records an effect and sends nothing
 *
 * Anything that calls a third party happens after commit, via the effects
 * ledger, and a notification is the purest case of that rule. If sending were
 * inline:
 *
 * - a WeChat timeout would roll back the payment that triggered it;
 * - a customer who turned the template off would fail somebody's refund;
 * - and the send would happen before the transaction committed, so a rollback
 *   would leave a "your order shipped" message about an order that was never
 *   shipped.
 *
 * So `notify` writes one row in the caller's transaction and returns. The
 * dispatcher runs `fanOut` afterwards.
 *
 * ## Exactly once, in three layers
 *
 * 1. **Recording** is exactly-once: `effects` has `UNIQUE (scope, scope_id,
 *    event_type)`, so two racing dispatchers, two racing webhooks or a replayed
 *    payment notification all produce one row. The scope id carries the event
 *    code *and* the aggregate (`order_paid:order:1024`), which is what makes
 *    two different notifications about the same order two rows and the same
 *    notification twice one row.
 * 2. **Delivery** is at-least-once, because the ledger retries. So each channel
 *    claims a Redis key before it sends and keeps it if it succeeds; a replay
 *    re-sends only the channels that have not claimed.
 * 3. **The in-app copy** is written inside the same short transaction that
 *    claims its key, so a crash between the two cannot duplicate a message in
 *    somebody's inbox.
 */

export const NOTIFICATION_SCOPE = 'notification';
export const NOTIFICATION_EVENT_TYPE = 'notification.send';

export interface NotifyInput {
  /** A code from the registry. An unknown code is logged and dropped, never thrown. */
  event: string;
  /**
   * What the notification is about. Becomes part of the effect key, so the same
   * event for the same aggregate is recorded once however many times it is
   * called.
   */
  subject: { scope: string; id: string | number };
  /** The recipient, for `audience: 'user'` events. Admin events resolve their own. */
  userId?: number;
  /** Everything the templates may substitute. Flattened to strings at send time. */
  data?: Record<string, unknown>;
}

/** The scope id: `<event>:<subject.scope>:<subject.id>`. */
export function notificationKey(input: NotifyInput): string {
  return `${input.event}:${input.subject.scope}:${input.subject.id}`;
}

/**
 * Records the intent to notify. Call it inside the business transaction.
 *
 * Returns whether this call created the row. Useful for a log line; never
 * branch on it for correctness — `false` only means somebody already asked for
 * the same notification, which is the outcome either way.
 */
export async function notify(tx: Tx, ctx: Ctx, input: NotifyInput): Promise<boolean> {
  const event = findNotificationEvent(input.event);
  if (!event) {
    // A domain asking for an event nobody declared is a bug, but it is not
    // worth failing an order over: the log line names it and the order ships.
    ctx.logger.warn({ event: input.event }, 'notify: unknown notification event');
    return false;
  }
  return recordEffect(tx, ctx, {
    scope: NOTIFICATION_SCOPE,
    scopeId: notificationKey(input),
    eventType: NOTIFICATION_EVENT_TYPE,
    payload: {
      event: input.event,
      subject: { scope: input.subject.scope, id: String(input.subject.id) },
      ...(input.userId === undefined ? {} : { userId: input.userId }),
      data: input.data ?? {},
    },
  });
}

// ---------------------------------------------------------------------------
// the per-channel claim
// ---------------------------------------------------------------------------

/**
 * Long enough to outlive the ledger's whole retry schedule (8 attempts, backoff
 * capped at 30 minutes ≈ 2 hours) with room for a parked row an operator
 * re-queues the next morning.
 */
const CLAIM_TTL_SECONDS = 7 * 24 * 3600;

function claimKey(scopeId: string, channel: NotificationChannel, recipient: number | null): string {
  return `notify:sent:${scopeId}:${channel}:${recipient ?? 'none'}`;
}

/**
 * `SET key 1 NX EX` — true when this attempt is the one that may send.
 *
 * A Redis outage makes every claim succeed (`claim` returns `true` on error),
 * which risks a duplicate message rather than losing one. That is the right way
 * round for a notification: a customer who gets "your order shipped" twice is
 * annoyed, one who never gets it phones support.
 */
async function claim(ctx: Ctx, key: string): Promise<boolean> {
  try {
    const result = await ctx.redis.set(key, '1', 'EX', CLAIM_TTL_SECONDS, 'NX');
    return result === 'OK';
  } catch (error) {
    ctx.logger.warn({ err: error, key }, 'notification claim failed, sending anyway');
    return true;
  }
}

/** Hands the claim back so the next attempt may try again. */
async function release(ctx: Ctx, key: string): Promise<void> {
  try {
    await ctx.redis.del(key);
  } catch {
    // The key expires on its own; a failed delete costs one lost retry at worst.
  }
}

/** Which channels of one fan-out have already gone out. Drives the send log. */
export async function readClaimedChannels(
  ctx: Ctx,
  scopeId: string,
  recipients: readonly (number | null)[],
  channels: readonly NotificationChannel[],
): Promise<NotificationChannel[]> {
  const keys = channels.flatMap((channel) =>
    recipients.map((recipient) => ({ channel, key: claimKey(scopeId, channel, recipient) })),
  );
  if (keys.length === 0) return [];
  try {
    const values = await ctx.redis.mget(keys.map((entry) => entry.key));
    const sent = new Set<NotificationChannel>();
    values.forEach((value, index) => {
      if (value !== null) sent.add(keys[index]!.channel);
    });
    return [...sent];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// fan-out
// ---------------------------------------------------------------------------

interface FanOutPayload {
  event: string;
  subject: { scope: string; id: string };
  userId?: number;
  data: Record<string, unknown>;
}

export interface FanOutReport {
  event: string;
  recipients: number;
  sent: NotificationChannel[];
  skipped: NotificationChannel[];
  failed: { channel: NotificationChannel; reason: string }[];
}

const ALL_CHANNELS: readonly NotificationChannel[] = ['inApp', 'wechatOa', 'wechatMini', 'sms'];

/**
 * Runs one notification. Called by the effect handler and, in tests, directly.
 *
 * Throws only when at least one channel **failed** in a way that retrying could
 * fix, because that is the only signal the ledger understands. Everything that
 * merely did not apply — no openid, no SMS provider, a template the operator
 * left blank — comes back as `skipped` and the effect is done.
 */
export async function fanOut(ctx: Ctx, effect: Effect): Promise<FanOutReport> {
  const payload = effect.payload as FanOutPayload | null;
  const code = payload?.event ?? '';
  const event = findNotificationEvent(code);
  const report: FanOutReport = { event: code, recipients: 0, sent: [], skipped: [], failed: [] };

  if (!event) {
    ctx.logger.warn({ code, effectId: effect.id }, 'fanOut: event no longer registered');
    return report;
  }

  const template = await ensureTemplate(ctx, event);
  if (!template.isEnabled) {
    report.skipped.push(...ALL_CHANNELS);
    return report;
  }
  const channels = template.channels;

  const data = toTemplateData(payload?.data ?? {});
  const recipients =
    event.audience === 'admin'
      ? (await repo.findAdminRecipients(ctx.db, event.permission ?? '')).map((row) => row.id)
      : [payload?.userId ?? 0].filter((id) => id > 0);
  report.recipients = recipients.length;

  if (recipients.length === 0) {
    // Nobody to tell. For an admin event that means no account holds the atom,
    // which is a configuration statement, not a failure.
    report.skipped.push(...ALL_CHANNELS);
    return report;
  }

  // -- in-app, per recipient ------------------------------------------------
  const inApp = channels.inApp;
  if (inApp?.enabled) {
    await deliverInApp(ctx, { effect, event, channels, data, recipients, report });
  } else {
    report.skipped.push('inApp');
  }

  // -- the outbound channels, user audience only ----------------------------
  if (event.audience === 'user') {
    const userId = recipients[0] ?? null;
    for (const channel of ['wechatOa', 'wechatMini', 'sms'] as const) {
      if (!event.channels.includes(channel)) {
        report.skipped.push(channel);
        continue;
      }
      const key = claimKey(effect.scopeId, channel, userId);
      if (!(await claim(ctx, key))) {
        report.skipped.push(channel);
        continue;
      }
      const outcome = await runChannel(ctx, channel, { event, channels, userId, data });
      if (outcome.kind === 'sent') {
        report.sent.push(channel);
      } else {
        await release(ctx, key);
        if (outcome.kind === 'failed') report.failed.push({ channel, reason: outcome.reason });
        else report.skipped.push(channel);
      }
    }
  } else {
    report.skipped.push('wechatOa', 'wechatMini', 'sms');
  }

  if (report.failed.length > 0) {
    throw new Error(
      `通知发送失败：${report.failed.map((f) => `${f.channel} ${f.reason}`).join('；')}`,
    );
  }
  return report;
}

async function runChannel(
  ctx: Ctx,
  channel: 'wechatOa' | 'wechatMini' | 'sms',
  input: {
    event: NotificationEvent;
    channels: NotificationChannels;
    userId: number | null;
    data: Record<string, string>;
  },
): Promise<ChannelOutcome> {
  try {
    if (channel === 'wechatOa') return await sendWechatOa(ctx, input);
    if (channel === 'wechatMini') return await sendWechatMini(ctx, input);
    return await sendSms(ctx, input);
  } catch (error) {
    // A transport failure (DNS, TLS, timeout) is the one thing worth retrying,
    // and it is the one thing the clients do throw for.
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Writes the in-app copies and pushes them to any connected bell.
 *
 * The claim is taken per recipient, so an admin who joined after the first
 * attempt still gets the message on the retry, and one who already has it does
 * not get a second copy. The insert and the claim are ordered claim-then-insert
 * so a crash in between loses a message rather than duplicating one — the
 * ledger will not re-send a claimed channel, but the operator can see the
 * parked row, and a duplicated 新订单 badge is the failure people actually
 * complain about.
 */
async function deliverInApp(
  ctx: Ctx,
  args: {
    effect: Effect;
    event: NotificationEvent;
    channels: NotificationChannels;
    data: Record<string, string>;
    recipients: readonly number[];
    report: FanOutReport;
  },
): Promise<void> {
  const { event, channels, data, recipients, report } = args;
  const claimed: number[] = [];
  for (const recipient of recipients) {
    const key = claimKey(args.effect.scopeId, 'inApp', recipient);
    if (await claim(ctx, key)) claimed.push(recipient);
  }
  if (claimed.length === 0) {
    report.skipped.push('inApp');
    return;
  }

  const { title, content } = renderInApp(event, channels, data);
  // A placeholder with nothing behind it renders empty (NOTIF-005), which keeps
  // the message readable but hides the sender's bug: say so where an operator
  // looking at a half-empty 站内信 will find it (NOTIF-007).
  const blank = placeholdersIn(
    `${channels.inApp?.title || event.defaults.title} ${channels.inApp?.body || event.defaults.body}`,
  ).filter((name) => (data[name] ?? '') === '');
  if (blank.length > 0) {
    ctx.logger.warn({ event: event.code, blank }, 'notification rendered with blank variables');
  }
  // The in-app link stays a **path**: the bell and the message centre are both
  // inside the app, and an absolute URL there would send the operator on a
  // round trip through the public origin. Only the WeChat channels absolutise.
  const link = render(event.link ?? '', data);
  // The mini program opens `data.route` (docs/mini/pages.md §3.4).
  const route = event.route ? renderRoute(event.route, data) : null;
  if (event.route && route === null) {
    ctx.logger.warn({ event: event.code }, 'notification route did not render to a valid route');
  }
  const now = ctx.clock.now();

  const rows = await ctx.withTx((tx) =>
    repo.insertMessages(
      tx,
      claimed.map((recipient) => ({
        code: event.code,
        audience: event.audience,
        ...(event.audience === 'user' ? { userId: recipient } : { adminId: recipient }),
        title,
        content,
        data: { ...data, ...(link === '' ? {} : { link }), ...(route ? { route } : {}) },
      })),
      now,
    ),
  );
  report.sent.push('inApp');

  if (event.audience !== 'admin') return;
  const createdAt = now.toISOString();
  for (const row of rows) {
    if (row.adminId === null) continue;
    const streamEvent: AdminStreamEvent = {
      id: String(row.id),
      type: event.code,
      title,
      body: content,
      ...(link === '' ? {} : { link }),
      createdAt,
    };
    await publishToAdmin(ctx, row.adminId, streamEvent);
  }
}

/**
 * Reads the template row, seeding it from the registry when it is missing.
 *
 * Seeding on read rather than in a migration means a new event ships with the
 * code that sends it and needs no data change; `ON CONFLICT DO UPDATE` makes
 * two dispatchers doing it at once harmless.
 */
export async function ensureTemplate(
  ctx: Ctx,
  event: NotificationEvent,
): Promise<{ channels: NotificationChannels; isEnabled: boolean }> {
  const existing = await repo.findTemplate(ctx.db, event.code);
  if (existing) {
    return { channels: effectiveChannels(event, existing.channels), isEnabled: existing.isEnabled };
  }

  const seeded = defaultChannels(event);
  await ctx.withTx((tx) =>
    repo.upsertTemplates(tx, [
      {
        code: event.code,
        name: event.name,
        description: event.description,
        audience: event.audience,
        channels: seeded,
        variables: [...event.variables],
      },
    ]),
  );
  return { channels: seeded, isEnabled: true };
}

/**
 * What a freshly seeded template looks like: in-app on with the registry's
 * wording, everything else present but off and unconfigured.
 *
 * In-app is the only channel that can be on by default, because it is the only
 * one that needs no credential, cannot cost money and cannot reach somebody who
 * did not ask to hear from us.
 */
export function defaultChannels(event: NotificationEvent): NotificationChannels {
  const channels: NotificationChannels = {
    inApp: { enabled: true, title: event.defaults.title, body: event.defaults.body },
  };
  if (event.channels.includes('wechatOa')) channels.wechatOa = { enabled: false, templateKey: '' };
  if (event.channels.includes('wechatMini')) {
    channels.wechatMini = { enabled: false, templateKey: '' };
  }
  if (event.channels.includes('sms')) channels.sms = { enabled: false, templateCode: '' };
  return channels;
}

/**
 * The row's channels laid over the event's defaults.
 *
 * A row can exist without naming every channel its event supports. The
 * reference-data seed writes template shells — code, name, variables — with
 * `channels = {}`, so that 通知管理 lists them before anything has been sent;
 * and an event can gain a channel after its row was written. A channel the row
 * does not mention takes its default (in-app on with the registry's wording,
 * the outbound ones off) instead of reading as "switched off", which would
 * silence the event with no switch in the admin to turn it back on. A channel
 * the row does name is the operator's, and wins whole.
 */
export function effectiveChannels(
  event: NotificationEvent,
  stored: NotificationChannels | undefined,
): NotificationChannels {
  return { ...defaultChannels(event), ...stored };
}
