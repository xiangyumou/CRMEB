import type { OrderListItem, StorefrontOrderItem } from '@shop/contracts/order/schemas';
import type { ButtonVariant } from './button';

/**
 * Which buttons an order offers, decided in one place (design.md §4.4: pages never work it
 * out themselves). Order detail and the list use the same answer.
 */
export type OrderActionKey =
  'cancel' | 'pay' | 'aftersale' | 'logistics' | 'confirm' | 'review' | 'rebuy' | 'delete';

export interface OrderAction {
  key: OrderActionKey;
  label: string;
  variant: ButtonVariant;
}

const LABEL: Record<OrderActionKey, string> = {
  cancel: '取消订单',
  pay: '立即付款',
  aftersale: '申请售后',
  logistics: '查看物流',
  confirm: '确认收货',
  review: '去评价',
  rebuy: '再次购买',
  delete: '删除订单',
};

type OrderShape = Pick<OrderListItem, 'status' | 'refundStatus' | 'fulfillmentStatus' | 'kind'> & {
  /**
   * The lines' review state (`storefrontOrderItem.reviewable`, ORDER-010): 去评价 and 待评价
   * only while some line can still be reviewed.
   */
  items: ReadonlyArray<Pick<StorefrontOrderItem, 'reviewable'>>;
};

/** Some line can be reviewed now (the order was received and the line has no review yet). */
export function awaitsReview(order: Pick<OrderShape, 'items'>): boolean {
  return order.items.some((item) => item.reviewable);
}

/** Left to right as shown; the last one is the primary action where there is one. */
export function orderActions(order: OrderShape): OrderAction[] {
  const keys: OrderActionKey[] = [];
  const refundable = order.refundStatus === 'none' || order.refundStatus === 'partially_refunded';
  switch (order.status) {
    case 'pending_payment':
      keys.push('cancel', 'pay');
      break;
    case 'paid':
      if (refundable) keys.push('aftersale');
      if (order.fulfillmentStatus === 'partially_fulfilled') keys.push('logistics');
      break;
    case 'shipped':
      if (refundable) keys.push('aftersale');
      keys.push('logistics', 'confirm');
      break;
    case 'received':
      if (refundable) keys.push('aftersale');
      keys.push('rebuy');
      if (awaitsReview(order)) keys.push('review');
      break;
    case 'completed':
      keys.push('delete', 'rebuy');
      if (awaitsReview(order)) keys.push('review');
      break;
    case 'cancelled':
    case 'refunded':
      keys.push('delete');
      if (order.kind === 'normal') keys.push('rebuy');
      break;
  }
  const primary = new Set<OrderActionKey>(['pay', 'confirm', 'review']);
  return keys.map((key) => ({
    key,
    label: LABEL[key],
    variant: primary.has(key) ? 'primary' : key === 'rebuy' ? 'outline-primary' : 'outline',
  }));
}

/**
 * The status line on a card: 待付款, 待发货, 部分发货, 待收货, 待评价, 已完成… A received or
 * completed order is 待评价 while a line awaits its review (the 待评价 tab), else 已完成.
 */
export function orderStatusText(order: OrderShape): string {
  switch (order.status) {
    case 'pending_payment':
      return '待付款';
    case 'paid':
      return order.fulfillmentStatus === 'partially_fulfilled' ? '部分发货' : '待发货';
    case 'shipped':
      return '待收货';
    case 'received':
    case 'completed':
      return awaitsReview(order) ? '待评价' : '已完成';
    case 'cancelled':
      return '已取消';
    case 'refunded':
      return '已退款';
  }
}
