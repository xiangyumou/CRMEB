import type { StatusMap } from '@/admin/kit/status-tag';

/**
 * Labels shared by the two notification pages.
 *
 * They live in one file rather than next to each page because the send log and
 * the template list name the same things, and two lists of Chinese labels for
 * one enum drift within a month.
 */

export const NOTIFICATION_AUDIENCE: StatusMap<'user' | 'admin'> = {
  user: { label: '顾客', color: 'blue' },
  admin: { label: '管理员', color: 'purple' },
};

export const NOTIFICATION_CHANNEL: StatusMap<'inApp' | 'wechatOa' | 'wechatMini' | 'sms'> = {
  inApp: { label: '站内信', color: 'default' },
  wechatOa: { label: '公众号', color: 'green' },
  wechatMini: { label: '小程序', color: 'cyan' },
  sms: { label: '短信', color: 'orange' },
};

/**
 * The three states a send can be in, as the ledger reports them.
 *
 * `pending` covers "queued" and "waiting for its next attempt" on purpose: the
 * difference is a timestamp the operator can read in the row, and two tags for
 * one situation invite the question "which one is bad?".
 */
export const NOTIFICATION_LOG_STATUS: StatusMap<'pending' | 'done' | 'unknown'> = {
  pending: { label: '待发送', color: 'processing' },
  done: { label: '已发送', color: 'success' },
  unknown: { label: '需要处理', color: 'error' },
};
