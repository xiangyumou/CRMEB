import type { ResponseOf } from '@shop/api-client';
import { couponShort } from '@/features/product/product-coupons';
import { fromCents, toCents } from '@/lib/money';

export type CartList = ResponseOf<'cart.list'>;
export type CartItem = CartList['items'][number];
export type ApplicableCoupons = ResponseOf<'coupon.applicableList'>;

/** The cart page reads the whole cart at once: the contract's page-size ceiling. */
export const CART_QUERY = { query: { pageSize: 100 } } as const;

/** The rows that can be checked out, and the greyed-out rest (失效商品). */
export function splitCart(items: readonly CartItem[]): {
  available: CartItem[];
  unavailable: CartItem[];
} {
  return {
    available: items.filter((item) => item.available),
    unavailable: items.filter((item) => !item.available),
  };
}

/** Why a row cannot be checked out, in the shopper's words. */
export function unavailableReason(item: CartItem): string {
  switch (item.state) {
    case 'deleted':
      return '商品已不存在';
    case 'off_shelf':
      return '商品已下架';
    case 'out_of_stock':
      return item.stock > 0 ? `库存不足，仅剩 ${item.stock} 件` : '已售罄';
    case 'quantity_not_allowed':
      return '该商品每次只能购买 1 件';
    default:
      return '暂不可购买';
  }
}

/**
 * A greyed row the shopper can still rescue by lowering the quantity: live, but short of stock
 * (or a card that may only be bought one at a time). The quantity it can go down to.
 */
export function rescueQuantity(item: CartItem): number | null {
  if (item.state === 'out_of_stock' && item.stock > 0) return item.stock;
  if (item.state === 'quantity_not_allowed') return 1;
  return null;
}

/** 全选's state: every available row ticked, some of them, or none. */
export function selectionOf(list: CartList): {
  all: boolean;
  some: boolean;
  ids: string[];
} {
  const { available } = splitCart(list.items);
  const ids = available.filter((item) => item.isSelected).map((item) => item.id);
  return {
    all: available.length > 0 && ids.length === available.length,
    some: ids.length > 0,
    ids,
  };
}

/** `coupon.applicableList`'s lines for the ticked, available rows; `null` when there are none. */
export function couponLines(list: CartList): { productId: string; amount: string }[] | null {
  const lines = list.items
    .filter((item) => item.available && item.isSelected)
    .map((item) => ({ productId: item.productId, amount: item.subtotal }));
  return lines.length > 0 ? lines : null;
}

/**
 * The coupon line above 结算: the best coupon the ticked rows already qualify for, or how much
 * more would unlock the nearest one (「再买 ¥9.00 可用满99减10」). `null` when the shopper holds
 * no coupon that could apply.
 */
export function couponHint(
  result: ApplicableCoupons | undefined,
  lines: readonly { amount: string }[] | null,
): { text: string; ready: boolean } | null {
  if (!result || !lines) return null;
  const usable = result.items.find((row) => row.usable);
  if (usable) {
    return {
      text: `结算时可用「${couponShort(usable.coupon)}」，省 ¥${usable.discount}`,
      ready: true,
    };
  }
  let nearest: { need: number; label: string } | null = null;
  for (const row of result.items) {
    if (row.reason !== 'COUPON_MIN_SPEND_NOT_MET' || row.eligibleLineIndexes.length === 0) continue;
    const eligible = row.eligibleLineIndexes.reduce(
      (sum, index) => sum + toCents(lines[index]?.amount ?? '0'),
      0,
    );
    const need = toCents(row.coupon.minSpend) - eligible;
    if (need > 0 && (!nearest || need < nearest.need)) {
      nearest = { need, label: couponShort(row.coupon) };
    }
  }
  if (!nearest) return null;
  return { text: `再买 ¥${fromCents(nearest.need)} 可用「${nearest.label}」`, ready: false };
}
