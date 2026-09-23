'use client';

import { catalogAdminProductList } from '@shop/contracts/catalog/catalog.product.admin.contract';
import type { AdminProductListItem } from '@shop/contracts/catalog/schemas';
import type { DataNeed, ProductSource, ProductSummary } from '@shop/contracts/decor/sources';
import { useQueries } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';

import { callRoute } from '../api';

/**
 * The data a block does not carry, for the editor canvas.
 *
 * A block stores *where* its records come from (`DataNeed`s, declared by the
 * block's `defineBlock({ data })`); on the storefront the page resolver answers
 * them. The canvas answers them through this port, one need at a time, so a
 * product grid shows real products while it is being edited.
 *
 * `resolve` returns what the storefront resolver would put in the slot, or
 * `null` for a need the canvas does not preview (the block then draws its
 * empty state). The admin implementation (`createAdminCanvasData`) previews
 * products only; coupons, campaigns and articles are resolved on the
 * storefront and show in the H5 preview and the 体验版, not in the canvas.
 */
export interface DecorCanvasData {
  resolve(need: DataNeed): Promise<unknown>;
}

const NO_DATA: DecorCanvasData = { resolve: () => Promise.resolve(null) };

const DecorCanvasDataContext = createContext<DecorCanvasData>(NO_DATA);

export function DecorCanvasDataProvider({
  value,
  children,
}: {
  value: DecorCanvasData;
  children: ReactNode;
}) {
  return <DecorCanvasDataContext value={value}>{children}</DecorCanvasDataContext>;
}

/**
 * A block's slots, resolved: `{ products: [...] }` for a product grid. A slot
 * still loading, failed or not previewed is absent. Each need is cached by its
 * value, so an unrelated edit does not refetch.
 */
export function useCanvasSlots(needs: Readonly<Record<string, DataNeed>>): Record<string, unknown> {
  const source = useContext(DecorCanvasDataContext);
  const entries = Object.entries(needs);
  const results = useQueries({
    queries: entries.map(([, need]) => ({
      queryKey: ['decor.canvas', source === NO_DATA ? 'none' : 'live', need],
      queryFn: async () => (await source.resolve(need)) ?? null,
      staleTime: 60_000,
      retry: false,
      // A canvas that cannot preview a slot draws the block's empty state;
      // a toast per block on every edit would only be noise.
      meta: { presentError: false },
    })),
  });
  const slots: Record<string, unknown> = {};
  entries.forEach(([slot], index) => {
    const data = results[index]?.data;
    if (data !== undefined && data !== null) slots[slot] = data;
  });
  return slots;
}

// ---------------------------------------------------------------------------
// the admin's implementation
// ---------------------------------------------------------------------------

/** As `toProductSummary` in the core resolver, from the admin product row. */
export function adminProductSummary(row: AdminProductListItem): ProductSummary {
  const summary: ProductSummary = {
    id: row.id,
    title: row.name,
    image: row.imageUrl,
    price: row.price,
  };
  if (row.originalPrice !== null && Number(row.originalPrice) > Number(row.price)) {
    summary.marketPrice = row.originalPrice;
  }
  const tag = row.labels[0]?.name;
  if (tag) summary.tag = [...tag].slice(0, 8).join('');
  if (row.stock <= 0) summary.soldOut = true;
  return summary;
}

const SORTS = {
  default: {},
  sales: { sortBy: 'sales', sortOrder: 'desc' },
  newest: { sortBy: 'createdAt', sortOrder: 'desc' },
  priceAsc: { sortBy: 'price', sortOrder: 'asc' },
  priceDesc: { sortBy: 'price', sortOrder: 'desc' },
} as const;

/**
 * Products for a source, the way the storefront resolver picks them
 * (DECOR-013): a manual list in its order, on-shelf only, sold-out kept; a
 * category or label rule on-shelf *with stock*, sorted, at most `limit`.
 */
export async function previewProducts(source: ProductSource): Promise<ProductSummary[]> {
  if (source.mode === 'manual') {
    const ids = source.ids.filter((id) => /^[1-9]\d*$/.test(id));
    if (ids.length === 0) return [];
    const page = await callRoute(catalogAdminProductList, {
      query: { page: 1, pageSize: ids.length, tab: 'on_shelf', ids: ids.join(',') },
    });
    const byId = new Map(page.items.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [adminProductSummary(row)] : [];
    });
  }
  const page = await callRoute(catalogAdminProductList, {
    query: {
      page: 1,
      pageSize: Math.min(100, source.limit * 2 + 10),
      tab: 'on_shelf',
      ...(source.mode === 'category'
        ? { categoryId: source.categoryId }
        : { labelId: source.labelId }),
      ...SORTS[source.sort],
    },
  });
  return page.items
    .filter((row) => row.stock > 0)
    .slice(0, source.limit)
    .map(adminProductSummary);
}

export function createAdminCanvasData(): DecorCanvasData {
  return {
    async resolve(need) {
      if (need.kind !== 'products') return null;
      // A rule still being set up (no category picked yet) previews nothing.
      if (need.source.mode === 'category' && !need.source.categoryId) return [];
      if (need.source.mode === 'label' && !need.source.labelId) return [];
      return previewProducts(need.source);
    },
  };
}
