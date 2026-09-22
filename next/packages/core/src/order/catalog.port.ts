import type { DbOrTx } from '@shop/db';
import {
  getFreightPort,
  getPaymentPort,
  getStockPort,
  type FreightPort,
  type PaymentPort,
  type StockPort,
} from './ports';

/**
 * The catalog seam, as the order domain needs it.
 *
 * `order/ports.ts` declares the `StockPort` (the *write* side of inventory);
 * this file declares the *read* side — the batch variant read the cart and
 * checkout price against — because it was written by stream B1 before stream
 * A existed, and A then implemented it (`catalog/catalog.sale.ts`). B1's own
 * repo-backed stand-in and the fallback resolution that used it were retired
 * at merge: every `resolve*()` below now fails closed, and the domain bucket
 * (`@shop/core/domains`) is what registers the real ports.
 */

export type ProductKind = 'physical' | 'virtual_card' | 'virtual_coupon' | 'virtual_manual';
export type FreightMode = 'free' | 'fixed' | 'template';
export type PurchaseLimitMode = 'none' | 'per_order' | 'lifetime';

/** Structural copy of `products.custom_form`'s element, so this file needs no `@shop/db` import. */
export interface CustomFormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'image';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

/**
 * Everything checkout needs to know about one variant, in one row.
 *
 * Money stays a `numeric(12,2)` string all the way down — never a float — and
 * is parsed into `Money` at the edge of the pricing pipeline.
 */
export interface SkuForSale {
  skuId: number;
  productId: number;
  productName: string;
  productImageUrl: string;
  productKind: ProductKind;
  /** `true` only when the product is `on_shelf`, undeleted, and the variant is visible. */
  onSale: boolean;
  /** The product row or the variant row is gone. The cart shows `deleted`, not `off_shelf`. */
  deleted: boolean;
  skuCode: string;
  specText: string;
  specValues: Record<string, string>;
  skuImageUrl: string | null;
  unitName: string | null;
  barCode: string | null;
  unitPrice: string;
  originalUnitPrice: string | null;
  costUnitPrice: string | null;
  stock: number;
  /** Kilograms, as stored. */
  weight: string | null;
  /** Cubic metres, as stored. */
  volume: string | null;
  freightMode: FreightMode;
  fixedFreight: string | null;
  shippingTemplateId: number | null;
  purchaseLimitMode: PurchaseLimitMode;
  purchaseLimitQuantity: number | null;
  minPurchaseQuantity: number;
  /** For the coupon domain's scope matching. */
  categoryIds: number[];
  customForm: CustomFormField[] | null;
}

export interface CatalogPort {
  /**
   * Variants by id. An id with no row is simply absent from the map; a
   * soft-deleted one comes back with `deleted: true`, because the cart has to
   * render the row in order to let the shopper remove it.
   */
  getSkusForSale(db: DbOrTx, skuIds: readonly number[]): Promise<Map<number, SkuForSale>>;
}

let registered: CatalogPort | undefined;

export function registerCatalogPort(port: CatalogPort): void {
  registered = port;
}

/** Test helper: the buckets test asserts the catalog domain registered itself. */
export function peekCatalogPort(): CatalogPort | undefined {
  return registered;
}

export function resetCatalogPort(): void {
  registered = undefined;
}

export function resolveCatalogPort(): CatalogPort {
  if (!registered)
    throw new Error('CatalogPort 未注册：请先加载 @shop/core/domains 或 @shop/core/catalog');
  return registered;
}

/** The stock port, as registered by the catalog domain; throws until it is. */
export function resolveStockPort(): StockPort {
  return getStockPort();
}

/**
 * `null` until stream C registers a `PaymentPort`.
 *
 * The cancel path treats `null` as `closed` — with a log line — and that is
 * sound rather than optimistic: if no payment domain is loaded at all, no
 * attempt can be in flight and no money can arrive. The moment C registers a
 * port the real three-way answer (`closed` / `paid` / `unknown`) is used and
 * nothing else changes.
 */
export function resolvePaymentPort(): PaymentPort | null {
  try {
    return getPaymentPort();
  } catch {
    return null;
  }
}

/**
 * `null` until stream F2 registers a `FreightPort`. The checkout service then
 * quotes freight from `products.freight_mode` alone
 * (`fallbackFreightQuote` in `order.pricing.ts`) instead of inventing template
 * rules it does not own.
 */
export function resolveFreightPort(): FreightPort | null {
  try {
    return getFreightPort();
  } catch {
    return null;
  }
}
