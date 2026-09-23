import { z } from 'zod';

import { blockStyle } from './common';
import { ui } from './meta';

/** 商品网格 — DRAFT, moves to `@shop/contracts` in stream F1. */

const id = z.string().regex(/^[1-9]\d*$/);

/**
 * Where the products come from (plan §2.1: declarative data sources). The
 * server resolves it into `ProductSummary[]` with the page, so the block never
 * fetches.
 */
export const productSource = z
  .discriminatedUnion('mode', [
    z.object({
      mode: z.literal('manual'),
      ids: z.array(id).max(20),
    }),
    z.object({
      mode: z.literal('category'),
      categoryId: id,
      sort: z.enum(['default', 'sales', 'newest', 'priceAsc']).default('default'),
      limit: z.number().int().min(1).max(20).default(6),
    }),
  ])
  .meta(ui({ label: '商品来源', field: 'productSource' }));

export type ProductSource = z.infer<typeof productSource>;

export const PRODUCT_SORT = {
  default: '默认',
  sales: '销量',
  newest: '最新',
  priceAsc: '价格从低到高',
} as const;

export const productGridProps = z.object({
  source: productSource
    .default({ mode: 'manual', ids: [] })
    .meta(ui({ label: '商品来源', field: 'productSource', group: '内容' })),
  titleLines: z
    .union([z.literal(1), z.literal(2)])
    .default(2)
    .meta(
      ui({ label: '标题行数', field: 'radio', options: { 1: '一行', 2: '两行' }, group: '展示' }),
    ),
  showMarketPrice: z
    .boolean()
    .default(true)
    .meta(ui({ label: '显示划线价', group: '展示' })),
  showTag: z
    .boolean()
    .default(true)
    .meta(ui({ label: '显示角标', group: '展示' })),
  style: blockStyle.prefault({}),
});

export type ProductGridProps = z.infer<typeof productGridProps>;
