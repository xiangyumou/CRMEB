import { groupbuyList } from '@shop/contracts/groupbuy/groupbuy.storefront.contract';
import * as groupbuy from '@shop/core/groupbuy';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/groupbuy/activities` — the 拼团 channel list, and a DIY 拼团
 * component's picked activities when `ids` is given (in that order, the
 * invisible skipped; `groupbuy.cardsFor`, as the page resolver uses).
 */
export const GET = handle(groupbuyList, async (ctx, { query }) => {
  if (!query.ids) return groupbuy.list(ctx, query);
  const cards = await groupbuy.cardsFor(ctx, query.ids);
  const from = (query.page - 1) * query.pageSize;
  return {
    items: cards.slice(from, from + query.pageSize),
    total: cards.length,
    page: query.page,
    pageSize: query.pageSize,
  };
});

export const dynamic = 'force-dynamic';
