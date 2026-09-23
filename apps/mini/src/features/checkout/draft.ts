import { create } from 'zustand';

/**
 * What 立即购买 (or, later, the cart) hands the checkout page. In memory, never in the URL:
 * the checkout page is not linkable (docs/mini/pages.md §2.3).
 *
 * TODO(stream B): the cart source, `kind`/`kindMeta` for group buy and presale, the coupon.
 */
export interface CheckoutDraft {
  source: 'buy-now';
  skuId: string;
  quantity: number;
}

export const useCheckoutDraft = create<{
  draft: CheckoutDraft | null;
  setDraft: (draft: CheckoutDraft | null) => void;
}>()((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
}));

/** Client-generated, unique per submit attempt (`checkoutCreateBody.idempotencyKey`). */
export function newIdempotencyKey(): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `mini-${Date.now().toString(36)}-${random}`;
}
