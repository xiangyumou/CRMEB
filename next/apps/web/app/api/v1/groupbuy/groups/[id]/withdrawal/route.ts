import { groupbuyWithdraw } from '@shop/contracts/groupbuy/groupbuy.storefront.contract';
import * as groupbuy from '@shop/core/groupbuy';
import { handle } from '../../../../../../../src/server';

/**
 * `/api/v1/groupbuy/groups/:id/withdrawal` — legacy `combination/remove`.
 *
 * The leader abandoning a team nobody has paid into. It is not an order cancel:
 * cancelling the *order* is B1's `POST /api/v1/orders/:id/cancel`, which
 * unwinds the membership through `onOrderCancelled`.
 */
export const POST = handle(groupbuyWithdraw, (ctx, { params }) => groupbuy.withdraw(ctx, params));

export const dynamic = 'force-dynamic';
