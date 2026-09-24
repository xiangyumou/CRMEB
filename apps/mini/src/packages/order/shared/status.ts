import type { OrderDetail } from '@shop/contracts/order/schemas';
import { awaitsReview } from '@/ui/order-actions';

/** The status header's title and the line under it on 订单详情. */
export function statusHeadline(
  order: Pick<
    OrderDetail,
    'status' | 'fulfillmentStatus' | 'refundStatus' | 'cancelReason' | 'items'
  >,
): { title: string; note: string | null } {
  const refunding = order.refundStatus === 'requested' ? '售后处理中' : null;
  switch (order.status) {
    case 'pending_payment':
      return { title: '等待付款', note: null };
    case 'paid':
      return order.fulfillmentStatus === 'partially_fulfilled'
        ? { title: '部分发货', note: refunding ?? '其余商品正在准备中' }
        : { title: '等待发货', note: refunding ?? '商家正在准备商品，将以保密包装发出' };
    case 'shipped':
      return { title: '已发货', note: refunding ?? '收到商品后请确认收货' };
    case 'received':
      return {
        title: '已收货',
        note: refunding ?? (awaitsReview(order) ? '感谢购买，欢迎评价' : '感谢购买'),
      };
    case 'completed':
      return { title: '交易完成', note: refunding };
    case 'cancelled':
      return { title: '已取消', note: order.cancelReason };
    case 'refunded':
      return { title: '已退款', note: '款项已原路退回' };
  }
}
