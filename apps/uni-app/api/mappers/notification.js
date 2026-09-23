// 站内信 DTOs → what `pages/users/message_center` renders.
//
// Contract: packages/contracts/src/notification/notification.storefront.contract.ts
//
// The page has two kinds of row in this list: 系统通知 and 客服会话. Self-hosted
// customer service is retired, so the 会话 tab is permanently empty (the page's own
// `getList` already returns nothing) and only the notification half is mapped here.

import { toId, toInt, text, mapList, pageDateTime } from './_shared.js';

/**
 * `notificationMessage` → one row of the 消息中心.
 *
 * `look` is the page's read flag, and it is derived from `readAt` rather than stored:
 * the row remembers *when* it was read, which is what makes 全部已读 able to say
 * how many rows it actually changed.
 */
export function toPageMessage(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    // `type: 1` is 系统通知; the page picks the icon off it.
    type: 1,
    code: text(dto.code),
    title: text(dto.title),
    content: text(dto.content),
    look: dto.readAt ? 1 : 0,
    add_time: pageDateTime(dto.createdAt),
    // `data` carries whatever the template was rendered with — an order id, a link.
    // The page does not read it yet; it is kept so a tap-through can be added without
    // another contract change.
    data: dto.data && typeof dto.data === 'object' ? dto.data : {},
  };
}

/** `pagedNotificationMessages` → `{list, count}`; the page concats `data.list`. */
export function toPageMessageList(dto) {
  return {
    list: mapList(dto && dto.items, toPageMessage),
    count: toInt(dto && dto.total, 0),
  };
}

/** `markReadResult` → `{marked}`; a double tap answers 0, which is not a failure. */
export function toPageMarkRead(dto) {
  return { marked: toInt(dto && dto.marked, 0) };
}
