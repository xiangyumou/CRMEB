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
 * The catalog seam, as B1 needs it.
 *
 * `order/ports.ts` is frozen and owned by the orchestrator; it declares the
 * `StockPort` but not the *read* side of the catalog, which cart and checkout
 * cannot do without. So this file is the narrow interface B1 codes against
 * until stream A lands, written from A's brief ("Exports other streams rely
 * on": price, stock, product status, kind, freight template id, weight/volume,
 * snapshot payload).
 *
 * When A ships:
 *  1. A calls `registerCatalogPort(...)` and `registerStockPort(...)` from
 *     `core/src/catalog/index.ts`;
 *  2. `catalog.repo.ts` — B1's repo-backed stand-in — is deleted;
 *  3. this file either moves into `ports.ts` or becomes a re-export of A's
 *     types. Nothing in the services changes.
 *
 * Until then `resolveCatalogPort()` / `resolveStockPort()` fall back to B1's
 * own adapters, which read the same tables A owns. That is a deliberate,
 * time-boxed overstep, recorded in `docs/rewrite/status/b1.md`.
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

/** Test helper; also what stream A's merge uses to prove the fallback is gone. */
export function peekCatalogPort(): CatalogPort | undefined {
  return registered;
}

export function resetCatalogPort(): void {
  registered = undefined;
}

let fallbackCatalog: CatalogPort | undefined;
let fallbackStock: StockPort | undefined;

/** Installed by `catalog.repo.ts` at import time. Never call this from a service. */
export function setCatalogFallbacks(catalog: CatalogPort, stock: StockPort): void {
  fallbackCatalog = catalog;
  fallbackStock = stock;
}

export function resolveCatalogPort(): CatalogPort {
  if (registered) return registered;
  if (!fallbackCatalog) throw new Error('CatalogPort 未注册，且 B1 的兜底适配器未加载');
  return fallbackCatalog;
}

/**
 * `getStockPort()` throws until somebody registers one, and stream A has not
 * shipped yet — so B1 catches that and uses its own adapter. The moment A
 * registers the real port this returns it instead, with no other change.
 */
export function resolveStockPort(): StockPort {
  try {
    return getStockPort();
  } catch {
    if (!fallbackStock) throw new Error('StockPort 未注册，且 B1 的兜底适配器未加载');
    return fallbackStock;
  }
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
