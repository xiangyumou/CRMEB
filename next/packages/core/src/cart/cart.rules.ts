import type { CartItemState } from '@shop/contracts/cart/schemas';
import type { SkuForSale } from '../order';

/**
 * What a cart row is allowed to be, as pure functions.
 *
 * The rule the whole file exists for: **a cart row is never silently deleted**.
 * Legacy's `getUserProductCartList` dropped unsellable rows from the response,
 * which is how a shopper ends up asking support where their basket went. Here
 * a dead row comes back with a `state` and `available: false`, greyed out, with
 * a 清空失效商品 button next to it.
 */

/** The most units one cart row may ever hold, whatever the shopper types. */
export const MAX_CART_QUANTITY = 9999;

/** How many rows one cart may hold. Beyond this the storefront stops paging. */
export const MAX_CART_ROWS = 300;

export function stateOf(sku: SkuForSale | undefined, quantity: number): CartItemState {
  if (!sku || sku.deleted) return 'deleted';
  if (!sku.onSale) return 'off_shelf';
  // `product_virtual_cards_order_item_uq`: one card key binds to one order
  // item, so a card variant can never be checked out more than one at a time.
  if (sku.productKind === 'virtual_card' && quantity > 1) return 'quantity_not_allowed';
  if (quantity < sku.minPurchaseQuantity) return 'quantity_not_allowed';
  if (sku.purchaseLimitMode === 'per_order' && sku.purchaseLimitQuantity !== null) {
    if (quantity > sku.purchaseLimitQuantity) return 'quantity_not_allowed';
  }
  if (sku.stock < quantity) return 'out_of_stock';
  return 'ok';
}

export const isAvailable = (state: CartItemState): boolean => state === 'ok';

/**
 * The quantity checks for a *write* — adding to the cart, or setting an
 * absolute quantity. These throw, because the shopper asked for something the
 * cart cannot hold, unlike `stateOf`, which only describes what is already
 * there.
 */
export interface QuantityRefusal {
  code:
    | 'CART_SKU_NOT_AVAILABLE'
    | 'CART_OUT_OF_STOCK'
    | 'CART_VIRTUAL_CARD_QUANTITY'
    | 'CART_PURCHASE_LIMIT_REACHED'
    | 'CART_BELOW_MIN_PURCHASE';
  details?: Record<string, unknown>;
}

/** `null` when the quantity is fine. Never throws — the service maps and throws. */
export function refuseQuantity(
  sku: SkuForSale | undefined,
  quantity: number,
): QuantityRefusal | null {
  if (!sku || sku.deleted || !sku.onSale) return { code: 'CART_SKU_NOT_AVAILABLE' };
  if (sku.productKind === 'virtual_card' && quantity > 1) {
    return { code: 'CART_VIRTUAL_CARD_QUANTITY' };
  }
  if (quantity < sku.minPurchaseQuantity) {
    return { code: 'CART_BELOW_MIN_PURCHASE', details: { minimum: sku.minPurchaseQuantity } };
  }
  const limit = sku.purchaseLimitQuantity;
  if (sku.purchaseLimitMode !== 'none' && limit !== null && quantity > limit) {
    return { code: 'CART_PURCHASE_LIMIT_REACHED', details: { limit } };
  }
  if (sku.stock < quantity) return { code: 'CART_OUT_OF_STOCK', details: { stock: sku.stock } };
  return null;
}

/**
 * The quantity an add may reach: never past the shop's cap or the variant's.
 *
 * It is both the clamp `addUnits` applies and the `cap` the storefront's
 * stepper is told about, so a kind that `refuseQuantity` would refuse has to
 * be capped here too — otherwise the stepper offers a number the next request
 * answers with a 422.
 */
export function capFor(sku: SkuForSale): number {
  // `product_virtual_cards_order_item_uq`: one card key per order item, so the
  // stepper on a 卡密 product does not go past 1 (CR-3-b2).
  if (sku.productKind === 'virtual_card') return 1;
  const limit =
    sku.purchaseLimitMode !== 'none' && sku.purchaseLimitQuantity !== null
      ? sku.purchaseLimitQuantity
      : MAX_CART_QUANTITY;
  return Math.max(1, Math.min(MAX_CART_QUANTITY, limit));
}
