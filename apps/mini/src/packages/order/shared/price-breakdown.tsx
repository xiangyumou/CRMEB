import { Text, View } from '@tarojs/components';
import type { OrderListItem } from '@shop/contracts/order/schemas';
import { Price } from '@/ui/price';
import './price-breakdown.scss';

type Amounts = Pick<
  OrderListItem,
  'status' | 'itemsAmount' | 'freightAmount' | 'couponDiscount' | 'payableAmount' | 'paidAmount'
>;

function isZero(money: string): boolean {
  return Number(money) === 0;
}

/**
 * 金额明细 on 订单详情 (design.md `PriceSummary`): 商品金额, 运费, 优惠券, then 实付 (or 应付
 * while unpaid). Money strings are shown as they come, never recomputed here.
 */
export function PriceBreakdown({ order }: { order: Amounts }) {
  const unpaid = order.status === 'pending_payment' || order.paidAmount === null;
  return (
    <View className="order-price">
      <View className="order-price__row">
        <Text className="order-price__label">商品金额</Text>
        <Price value={order.itemsAmount} size="sm" tone="text" />
      </View>
      <View className="order-price__row">
        <Text className="order-price__label">运费</Text>
        {isZero(order.freightAmount) ? (
          <Text className="order-price__value">包邮</Text>
        ) : (
          <Price value={order.freightAmount} size="sm" tone="text" />
        )}
      </View>
      {isZero(order.couponDiscount) ? null : (
        <View className="order-price__row">
          <Text className="order-price__label">优惠券</Text>
          <Price value={order.couponDiscount} prefix="-" size="sm" />
        </View>
      )}
      <View className="order-price__row order-price__row--total">
        <Text className="order-price__label">{unpaid ? '应付款' : '实付款'}</Text>
        <Price value={unpaid ? order.payableAmount : (order.paidAmount ?? order.payableAmount)} />
      </View>
    </View>
  );
}
