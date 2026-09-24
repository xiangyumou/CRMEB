import { presaleList } from '@shop/contracts/presale/presale.storefront.contract';
import * as presale from '@shop/core/presale';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/presale/activities` — the 预售频道 list, and a DIY 预售 component's
 * picked activities when `ids` is given (in that order, the invisible skipped;
 * `presale.cardsFor`, as the page resolver uses).
 *
 * Public: nothing here is personalised, so the same response serves every
 * visitor. There is no "buy" endpoint next to it — buying a presale item is
 * `POST /api/v1/orders` with `kind: 'presale'` and `kindMeta: { activityId }`.
 */
export const GET = handle(presaleList, async (ctx, { query }) => {
  if (!query.ids) return presale.list(ctx, query);
  const cards = await presale.cardsFor(ctx, query.ids);
  const from = (query.page - 1) * query.pageSize;
  return {
    items: cards.slice(from, from + query.pageSize),
    total: cards.length,
    page: query.page,
    pageSize: query.pageSize,
  };
});

export const dynamic = 'force-dynamic';
