import { groupbuyAdminGroupComplete } from '@shop/contracts/groupbuy/groupbuy.admin.contract';
import * as groupbuy from '@shop/core/groupbuy';
import { handle } from '../../../../../src/server';

/**
 * `/admin-api/groupbuy-groups/:id/completion` — 立即成团.
 *
 * Its own permission atom (`groupbuy:group:complete`) and, inside the service,
 * the shop-wide 虚拟成团 switch: an operator may not fake a team in a shop that
 * has decided not to fake teams, and having the 拼团 menu is not enough.
 */
export const POST = handle(groupbuyAdminGroupComplete, async (ctx, { params, body }) => {
  const group = await groupbuy.adminGroupComplete(ctx, params, body);
  ctx.audit(`groupbuy-group:${params.id}`);
  return group;
});

export const dynamic = 'force-dynamic';
