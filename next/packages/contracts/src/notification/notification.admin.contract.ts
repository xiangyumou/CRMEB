import { z } from 'zod';
import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  adminNotificationMessageExample,
  markReadResult,
  notificationChannel,
  notificationChannelToggleBody,
  notificationLogExample,
  notificationLogListQuery,
  notificationLogRetryResult,
  notificationMessageListQuery,
  notificationTemplate,
  notificationTemplateExample,
  notificationTemplateForm,
  notificationTemplateListQuery,
  pagedNotificationLogs,
  pagedNotificationMessages,
  pagedNotificationTemplates,
  unreadCount,
} from './schemas';

/**
 * Three admin surfaces, and they answer three different questions.
 *
 * - **`/admin-api/notification-templates`** — "what does the shop send, and on
 *   which channels". One row per business event, from the compiled registry.
 * - **`/admin-api/notification-logs`** — "did it go out". Read from the effects
 *   ledger; see `notificationLog` for why there is no separate log table.
 * - **`/admin-api/notifications`** — the signed-in admin's own inbox, which the
 *   header bell reads. It is deliberately *not* a console: an admin sees their
 *   own messages and nobody else's, so it needs no permission beyond the one
 *   every admin holds implicitly.
 *
 * `GET /admin-api/notifications/stream` is the SSE endpoint the bell subscribes
 * to. It has no contract: a `RouteDef` describes one request and one response
 * body, and a stream is neither. It is a bare route handler, and the bell reads
 * it with a raw `EventSource`.
 */

const codeParams = z.object({ code: z.string().min(1).max(64) });
const messageParams = z.object({ id });

// ---------------------------------------------------------------------------
// templates
// ---------------------------------------------------------------------------

export const notificationAdminTemplateList = defineRoute({
  id: 'notification.adminTemplateList',
  method: 'GET',
  path: '/admin-api/notification-templates',
  auth: 'admin',
  permission: 'notification:template:read',
  summary: '通知模板列表',
  tags: ['notification'],
  query: notificationTemplateListQuery,
  response: pagedNotificationTemplates,
  examples: [
    {
      name: 'user-events',
      query: { page: 1, pageSize: 20, audience: 'user' },
      response: { items: [notificationTemplateExample], total: 1, page: 1, pageSize: 20 },
    },
  ],
});

export const notificationAdminTemplateDetail = defineRoute({
  id: 'notification.adminTemplateDetail',
  method: 'GET',
  path: '/admin-api/notification-templates/:code',
  auth: 'admin',
  permission: 'notification:template:read',
  summary: '通知模板详情',
  tags: ['notification'],
  params: codeParams,
  response: notificationTemplate,
  errors: ['NOTIFICATION_TEMPLATE_NOT_FOUND'],
  examples: [
    { name: 'ok', params: { code: 'order_shipped' }, response: notificationTemplateExample },
  ],
});

/**
 * Saves the wording and the switches.
 *
 * A channel switched on with nothing to send is refused
 * (`NOTIFICATION_CHANNEL_INCOMPLETE`) rather than accepted and silently skipped
 * at send time: the operator is looking at the form now, and will not be
 * looking at the ledger in three days when the first order ships.
 */
export const notificationAdminTemplateUpdate = defineRoute({
  id: 'notification.adminTemplateUpdate',
  method: 'PUT',
  path: '/admin-api/notification-templates/:code',
  auth: 'admin',
  permission: 'notification:template:write',
  summary: '保存通知模板',
  tags: ['notification'],
  params: codeParams,
  body: notificationTemplateForm,
  response: notificationTemplate,
  errors: [
    'NOTIFICATION_TEMPLATE_NOT_FOUND',
    'NOTIFICATION_CHANNEL_INCOMPLETE',
    'NOTIFICATION_CHANNEL_NOT_APPLICABLE',
  ],
  examples: [
    {
      name: 'enable-oa',
      params: { code: 'order_shipped' },
      body: {
        channels: notificationTemplateExample.channels,
        isEnabled: true,
      },
      response: notificationTemplateExample,
    },
  ],
});

/** The per-channel switch in the list, so a row can be toggled without opening the form. */
export const notificationAdminTemplateToggleChannel = defineRoute({
  id: 'notification.adminTemplateToggleChannel',
  method: 'POST',
  path: '/admin-api/notification-templates/:code/channels/:channel',
  auth: 'admin',
  permission: 'notification:template:write',
  summary: '启用/停用单个通知渠道',
  tags: ['notification'],
  params: codeParams.extend({ channel: notificationChannel }),
  body: notificationChannelToggleBody,
  response: notificationTemplate,
  errors: [
    'NOTIFICATION_TEMPLATE_NOT_FOUND',
    'NOTIFICATION_CHANNEL_INCOMPLETE',
    'NOTIFICATION_CHANNEL_NOT_APPLICABLE',
  ],
  examples: [
    {
      name: 'turn-off-oa',
      params: { code: 'order_shipped', channel: 'wechatOa' },
      body: { enabled: false },
      response: {
        ...notificationTemplateExample,
        channels: {
          ...notificationTemplateExample.channels,
          wechatOa: { ...notificationTemplateExample.channels.wechatOa, enabled: false },
        },
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// the send log
// ---------------------------------------------------------------------------

export const notificationAdminLogList = defineRoute({
  id: 'notification.adminLogList',
  method: 'GET',
  path: '/admin-api/notification-logs',
  auth: 'admin',
  permission: 'notification:log:read',
  summary: '通知发送记录',
  tags: ['notification'],
  query: notificationLogListQuery,
  response: pagedNotificationLogs,
  examples: [
    {
      name: 'needs-a-human',
      query: { page: 1, pageSize: 20, status: 'unknown' },
      response: { items: [notificationLogExample], total: 1, page: 1, pageSize: 20 },
    },
    {
      name: 'all-sent',
      query: { page: 1, pageSize: 20, status: 'done' },
      response: { items: [], total: 0, page: 1, pageSize: 20 },
    },
  ],
});

/**
 * Re-queues one parked send. The handler is **not** run inside this request —
 * it talks to WeChat, and an admin's browser is the wrong place to wait for
 * that. `succeeded: false` means the row had already left `unknown`.
 */
export const notificationAdminLogRetry = defineRoute({
  id: 'notification.adminLogRetry',
  method: 'POST',
  path: '/admin-api/notification-logs/:id/retry',
  auth: 'admin',
  permission: 'notification:log:handle',
  summary: '重试通知发送',
  tags: ['notification'],
  params: messageParams,
  body: z.object({}),
  response: notificationLogRetryResult,
  errors: ['NOTIFICATION_LOG_NOT_RETRYABLE', 'NOT_FOUND'],
  examples: [
    {
      name: 'requeued',
      params: { id: '9001' },
      body: {},
      response: {
        log: { ...notificationLogExample, status: 'pending', attempts: 8 },
        succeeded: true,
        message: '已重新排队，稍后自动执行',
      },
    },
    {
      name: 'already-running',
      params: { id: '9001' },
      body: {},
      response: {
        log: notificationLogExample,
        succeeded: false,
        message: '该发送记录当前无法重试',
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// the admin's own inbox
// ---------------------------------------------------------------------------

/**
 * `auth:profile:read`, not a notification atom.
 *
 * Every authenticated admin holds it implicitly (`IMPLICIT_ADMIN_PERMISSIONS`),
 * and the service scopes every query to `ctx.actor.id` — so the permission is
 * "you are signed in", which is exactly the requirement. *Which* events reach
 * an admin's inbox in the first place is a permission decision, and it is made
 * at fan-out time against the event's own atom, not here.
 */
export const notificationAdminInboxList = defineRoute({
  id: 'notification.adminInboxList',
  method: 'GET',
  path: '/admin-api/notifications',
  auth: 'admin',
  permission: 'auth:profile:read',
  summary: '我的后台通知',
  tags: ['notification'],
  query: notificationMessageListQuery,
  response: pagedNotificationMessages,
  examples: [
    {
      name: 'unread',
      query: { page: 1, pageSize: 20, unreadOnly: 'true' },
      response: { items: [adminNotificationMessageExample], total: 1, page: 1, pageSize: 20 },
    },
  ],
});

export const notificationAdminUnreadCount = defineRoute({
  id: 'notification.adminUnreadCount',
  method: 'GET',
  path: '/admin-api/notifications/unread-count',
  auth: 'admin',
  permission: 'auth:profile:read',
  summary: '后台未读通知数',
  tags: ['notification'],
  response: unreadCount,
  examples: [{ name: 'three', response: { unread: 3 } }],
});

/**
 * Reading is an explicit act.
 *
 * Nothing the bell does on its own mutates read state; only this route and
 * `read-all` do. Marking messages seen when the badge polls would lose the
 * badge in one of two open dashboard tabs.
 */
export const notificationAdminMarkRead = defineRoute({
  id: 'notification.adminMarkRead',
  method: 'POST',
  path: '/admin-api/notifications/:id/read',
  auth: 'admin',
  permission: 'auth:profile:read',
  summary: '标记后台通知已读',
  tags: ['notification'],
  params: messageParams,
  body: z.object({}),
  response: markReadResult,
  errors: ['NOTIFICATION_MESSAGE_NOT_FOUND'],
  examples: [
    { name: 'marked', params: { id: '5002' }, body: {}, response: { marked: 1 } },
    { name: 'already-read', params: { id: '5002' }, body: {}, response: { marked: 0 } },
  ],
});

export const notificationAdminMarkAllRead = defineRoute({
  id: 'notification.adminMarkAllRead',
  method: 'POST',
  path: '/admin-api/notifications/read-all',
  auth: 'admin',
  permission: 'auth:profile:read',
  summary: '全部标记为已读',
  tags: ['notification'],
  body: z.object({}),
  response: markReadResult,
  examples: [{ name: 'marked-three', body: {}, response: { marked: 3 } }],
});
