import type { ApiClient, ResponseOf } from '@shop/api-client';
import { showModal } from './feedback';
import { platform } from './runtime';
import type { OrderConfirmTarget } from './types';

/**
 * 确认收货 (C07). The one place that calls `order.confirmReceipt` (a guard holds it).
 *
 * A mini-program payment that WeChat's 发货信息管理 covers is confirmed in WeChat's own
 * component (`openBusinessView`), which releases the frozen funds; the server then checks with
 * WeChat before the order moves. Every other order (paid elsewhere, or not covered) gets the
 * plain 「确认收货？」 dialog and the plain call.
 *
 * The client is a parameter, not `@/data/api`, because that module imports `@/platform`.
 * Call it from the tap: the component, like the dialog, must follow a user gesture.
 */
export type ReceiptOutcome =
  | { kind: 'confirmed'; order: ResponseOf<'order.confirmReceipt'> }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

/**
 * What WeChat's component needs for this order, or `null` for the plain dialog. The server
 * decides (`payment.wechatReceipt`): the order is the shopper's own, was paid in the mini
 * program, and WeChat has been told it is all out.
 */
async function wechatTarget(
  client: ApiClient,
  orderId: string,
): Promise<OrderConfirmTarget | null> {
  const { receipt } = await client.call('payment.wechatReceipt', { params: { id: orderId } });
  return receipt;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '确认收货失败，请稍后重试';
}

export async function confirmReceipt(client: ApiClient, orderId: string): Promise<ReceiptOutcome> {
  let target: OrderConfirmTarget | null;
  try {
    target = await wechatTarget(client, orderId);
  } catch (error) {
    return { kind: 'failed', message: messageOf(error) };
  }

  if (target) {
    const outcome = await platform.openOrderConfirm(target);
    // `cancel`: the shopper closed WeChat's page; nothing happened. `fail`: say so, the
    // button stays for another try.
    if (outcome.kind !== 'confirmed') return outcome;
  } else {
    const ok = await showModal({
      title: '确认收货',
      content: '请确认已收到全部商品。确认后订单完成，可以评价。',
      confirmText: '确认收货',
    });
    if (!ok) return { kind: 'cancelled' };
  }

  try {
    const order = await client.call('order.confirmReceipt', {
      params: { id: orderId },
      // The server asks WeChat before it believes the component (C07).
      body: target ? { via: 'wechat-component' } : {},
    });
    return { kind: 'confirmed', order };
  } catch (error) {
    return { kind: 'failed', message: messageOf(error) };
  }
}
