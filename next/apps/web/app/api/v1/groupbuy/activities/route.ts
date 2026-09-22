import { groupbuyList } from '@shop/contracts/groupbuy/groupbuy.storefront.contract';
import * as groupbuy from '@shop/core/groupbuy';
import { handle } from '../../../../../src/server';

/** `/api/v1/groupbuy/activities` — the 拼团 channel list. */
export const GET = handle(groupbuyList, (ctx, { query }) => groupbuy.list(ctx, query));

export const dynamic = 'force-dynamic';
