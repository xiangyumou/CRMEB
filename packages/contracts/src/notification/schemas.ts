import { z } from 'zod';
import { id, instant, pageQuery, paged } from '../_conventions/common';

/**
 * Shapes shared by the notification routes.
 *
 * The model is one **registry of business events**, compiled into the code, and
 * one row of configuration per event. `notification_templates.code` is the
 * registry key; the row says which channels are on and what each one sends.
 *
 * A template is one row with one `channels` object, not a column per channel
 * setting, so adding a channel is not a migration. The operator screen is a
 * list of events with a switch per channel.
 */

// ---------------------------------------------------------------------------
// enums
// ---------------------------------------------------------------------------

export const notificationAudience = z.enum(['user', 'admin']);
export type NotificationAudience = z.infer<typeof notificationAudience>;

/**
 * The four surviving channels.
 *
 * Enterprise-WeChat group robots and native App push left with the features
 * that used them (scope guard), and 自建客服 was never a notification channel.
 */
export const notificationChannel = z.enum(['inApp', 'wechatOa', 'wechatMini', 'sms']);
export type NotificationChannel = z.infer<typeof notificationChannel>;

// ---------------------------------------------------------------------------
// per-channel configuration
// ---------------------------------------------------------------------------

/**
 * `{{orderNo}}` placeholders are substituted from the event's data. An unknown
 * placeholder renders as the empty string rather than as itself — a customer
 * reading "您的订单 {{orderNo}} 已发货" is worse than one reading "您的订单 已发货",
 * and the admin screen lists the variables each event provides.
 */
const template = z.string().max(500);

export const inAppChannelConfig = z.object({
  enabled: z.boolean().default(false),
  title: template.default(''),
  body: template.default(''),
});
export type InAppChannelConfig = z.infer<typeof inAppChannelConfig>;

/**
 * OA template message.
 *
 * `templateKey` is WeChat's 模板库编号 (`OPENTM…` / `TM…`), which is what an
 * operator can look up; `templateId` is the id their own account got when they
 * added it, which is what the API needs. Both are kept because only one of them
 * is transferable between shops.
 *
 * `fields` maps WeChat's positional field names (`first`, `keyword1`, `remark`)
 * onto our placeholder strings, so the same event feeds a template whose author
 * chose a different field order without a code change.
 */
export const wechatOaChannelConfig = z.object({
  enabled: z.boolean().default(false),
  templateKey: z.string().max(64).default(''),
  templateId: z.string().max(128).optional(),
  fields: z.record(z.string(), template).optional(),
  /** Where tapping the message goes. Absolute, on our own domain. */
  linkUrl: z.string().max(1024).optional(),
});
export type WechatOaChannelConfig = z.infer<typeof wechatOaChannelConfig>;

/**
 * Mini-program subscribe message.
 *
 * Its field names are typed (`thing1`, `character_string2`, `amount3`) and
 * WeChat validates the *value* against the type, so a field map is not optional
 * here — it is the only way the same event can feed two shops' templates.
 */
export const wechatMiniChannelConfig = z.object({
  enabled: z.boolean().default(false),
  templateKey: z.string().max(64).default(''),
  templateId: z.string().max(128).optional(),
  fields: z.record(z.string(), template).optional(),
  /**
   * **Deprecated.** The page an event opens is the event's route-catalogue
   * entry, rendered by `toMiniPath` (docs/mini/pages.md §3.4); this hand-typed
   * path is read only for an event without a route. Kept so saved templates
   * still parse.
   */
  page: z.string().max(256).optional(),
});
export type WechatMiniChannelConfig = z.infer<typeof wechatMiniChannelConfig>;

export const smsChannelConfig = z.object({
  enabled: z.boolean().default(false),
  /** The provider's own template code, e.g. `SMS_123456`. */
  templateCode: z.string().max(64).default(''),
  signName: z.string().max(64).optional(),
  /** For the operator's reference only; the provider holds the real text. */
  body: template.optional(),
});
export type SmsChannelConfig = z.infer<typeof smsChannelConfig>;

/** A channel absent from the object is not configured at all, which is not the same as disabled. */
export const notificationChannels = z.object({
  inApp: inAppChannelConfig.optional(),
  wechatOa: wechatOaChannelConfig.optional(),
  wechatMini: wechatMiniChannelConfig.optional(),
  sms: smsChannelConfig.optional(),
});
export type NotificationChannels = z.infer<typeof notificationChannels>;

// ---------------------------------------------------------------------------
// admin: templates
// ---------------------------------------------------------------------------

export const notificationTemplate = z.object({
  /** The registry key, e.g. `order_paid`. Stable, and it is the route parameter. */
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  audience: notificationAudience,
  channels: notificationChannels,
  /** Placeholder names this event provides, for the form's hint line. */
  variables: z.array(z.string()),
  /**
   * Channels this event may use at all. A user event cannot send to an admin
   * inbox, and an admin event has no openid to send an OA message to — so the
   * screen renders switches only for these.
   */
  supportedChannels: z.array(notificationChannel),
  isEnabled: z.boolean(),
  updatedAt: instant,
});
export type NotificationTemplate = z.infer<typeof notificationTemplate>;

export const notificationTemplateListQuery = pageQuery.extend({
  audience: notificationAudience.optional(),
  keyword: z.string().max(64).optional(),
});
export type NotificationTemplateListQuery = z.infer<typeof notificationTemplateListQuery>;

export const pagedNotificationTemplates = paged(notificationTemplate);

/**
 * The edit form.
 *
 * `code` and `audience` are absent on purpose: both come from the compiled
 * registry, and an operator who could rename an event code would silently stop
 * every send of it. Only the wording and the switches are data.
 */
export const notificationTemplateForm = z.object({
  channels: notificationChannels,
  isEnabled: z.boolean(),
});
export type NotificationTemplateForm = z.infer<typeof notificationTemplateForm>;

/** The per-channel switch in the list, so a row can be toggled without opening the form. */
export const notificationChannelToggleBody = z.object({ enabled: z.boolean() });
export type NotificationChannelToggleBody = z.infer<typeof notificationChannelToggleBody>;

export const notificationTemplateExample = {
  code: 'order_shipped',
  name: '订单发货通知',
  description: '订单发货后通知买家',
  audience: 'user',
  channels: {
    inApp: {
      enabled: true,
      title: '您的订单已发货',
      body: '订单 {{orderNo}} 已由 {{company}} 发出，运单号 {{trackingNo}}。',
    },
    wechatOa: {
      enabled: true,
      templateKey: 'OPENTM207791277',
      templateId: 'ZCQ1oT0cD2mYy1Q-kLJbo2kQ3s6cxJ5Zx9pLb-7xQ1A',
      fields: { first: '您的订单已发货', keyword1: '{{orderNo}}', keyword2: '{{company}}' },
      linkUrl: 'https://shop.example.com/orders/{{orderId}}',
    },
    wechatMini: {
      enabled: false,
      templateKey: '',
      fields: { character_string1: '{{orderNo}}', thing2: '{{company}}' },
    },
    sms: { enabled: false, templateCode: '' },
  },
  variables: ['orderId', 'orderNo', 'company', 'trackingNo'],
  supportedChannels: ['inApp', 'wechatOa', 'wechatMini', 'sms'],
  isEnabled: true,
  updatedAt: '2026-01-06T09:00:00+08:00',
} satisfies z.input<typeof notificationTemplate>;

// ---------------------------------------------------------------------------
// admin: the send log
// ---------------------------------------------------------------------------

/**
 * One row of 通知发送记录, read from the effects ledger.
 *
 * A notification is one ledger row per (event, aggregate), so the ledger
 * already answers "did the 发货通知 for order 123 go out, and if not why" with
 * the attempt count and the last error. A parallel `notification_logs` table
 * would be a second copy of that truth that could disagree with it.
 *
 * `channels` is what the handler managed to send on, filled in as it goes, so a
 * row can read "in-app yes, OA no" — which is exactly the question support asks.
 */
export const notificationLogStatus = z.enum(['pending', 'done', 'unknown']);
export type NotificationLogStatus = z.infer<typeof notificationLogStatus>;

export const notificationLog = z.object({
  id,
  code: z.string(),
  /** The event's own name from the registry, so the operator does not read raw codes. */
  name: z.string(),
  audience: notificationAudience,
  /** `order:1024`, `refund:77` — which aggregate this notification belongs to. */
  subject: z.string(),
  status: notificationLogStatus,
  attempts: z.number().int().min(0),
  /** Channels that reported success on the last attempt. */
  sentChannels: z.array(notificationChannel),
  /** Channels that were enabled and did not succeed. */
  failedChannels: z.array(notificationChannel),
  lastError: z.string().nullable(),
  nextRunAt: instant,
  createdAt: instant,
  updatedAt: instant,
});
export type NotificationLog = z.infer<typeof notificationLog>;

export const notificationLogListQuery = pageQuery.extend({
  status: notificationLogStatus.default('unknown'),
  code: z.string().max(64).optional(),
});
export type NotificationLogListQuery = z.infer<typeof notificationLogListQuery>;

export const pagedNotificationLogs = paged(notificationLog);

export const notificationLogRetryResult = z.object({
  log: notificationLog,
  /** `false` when the row had already left `unknown`. The message says which. */
  succeeded: z.boolean(),
  message: z.string(),
});
export type NotificationLogRetryResult = z.infer<typeof notificationLogRetryResult>;

export const notificationLogExample = {
  id: '9001',
  code: 'order_shipped',
  name: '订单发货通知',
  audience: 'user',
  subject: 'order:1024',
  status: 'unknown',
  attempts: 8,
  sentChannels: ['inApp'],
  failedChannels: ['wechatOa'],
  lastError: 'wechat 40001: invalid credential',
  nextRunAt: '2026-01-06T09:30:00+08:00',
  createdAt: '2026-01-06T09:00:00+08:00',
  updatedAt: '2026-01-06T09:28:00+08:00',
} satisfies z.input<typeof notificationLog>;

// ---------------------------------------------------------------------------
// messages (both inboxes)
// ---------------------------------------------------------------------------

export const notificationMessage = z.object({
  id,
  /** The event that produced it. `null` for a free-form broadcast. */
  code: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  /**
   * Whatever the client needs to deep-link, e.g. `{ orderId: '1024' }` plus a
   * `link` the admin bell can navigate to and, on a customer event, the
   * mini-program `route` (`{ route, params }` from the route catalogue).
   */
  data: z.record(z.string(), z.unknown()).nullable(),
  readAt: instant.nullable(),
  createdAt: instant,
});
export type NotificationMessage = z.infer<typeof notificationMessage>;

export const notificationMessageListQuery = pageQuery.extend({
  /** `true` narrows to unread. Absent means both. */
  unreadOnly: z.stringbool().optional(),
  code: z.string().max(64).optional(),
});
export type NotificationMessageListQuery = z.infer<typeof notificationMessageListQuery>;

export const pagedNotificationMessages = paged(notificationMessage);

export const unreadCount = z.object({ unread: z.number().int().min(0) });
export type UnreadCount = z.infer<typeof unreadCount>;

/** `marked` is how many rows this call actually changed, so a double tap reads `0`. */
export const markReadResult = z.object({ marked: z.number().int().min(0) });
export type MarkReadResult = z.infer<typeof markReadResult>;

export const notificationMessageExample = {
  id: '5001',
  code: 'order_shipped',
  title: '您的订单已发货',
  content: '订单 20260106000000000000001 已由 顺丰速运 发出，运单号 SF1234567890。',
  data: {
    orderId: '1024',
    link: '/orders/1024',
    route: { route: 'order', params: { id: '1024' } },
  },
  readAt: null,
  createdAt: '2026-01-06T09:00:00+08:00',
} satisfies z.input<typeof notificationMessage>;

export const adminNotificationMessageExample = {
  id: '5002',
  code: 'admin_order_paid',
  title: '新的已付款订单',
  content: '订单 20260106000000000000001 已付款，金额 ¥128.00。',
  data: { orderId: '1024', link: '/admin/orders/1024' },
  readAt: null,
  createdAt: '2026-01-06T09:00:05+08:00',
} satisfies z.input<typeof notificationMessage>;
