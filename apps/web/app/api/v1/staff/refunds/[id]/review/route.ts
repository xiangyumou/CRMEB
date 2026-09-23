import { staffRefundReview } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../../src/server';

/**
 * `/api/v1/staff/refunds/:id/review` — 同意 / 拒绝.
 *
 * One route with a `decision` rather than two sub-resources, because that is
 * the single button pair the uni-app screen has. It delegates to the refund
 * domain's `approve` / `reject`, which own every refusal listed in the contract.
 */
export const POST = handle(staffRefundReview, async (ctx, { params, body }) => {
  const refund = await orderStaff.refundReview(ctx, params, body);
  ctx.audit(`refund:${params.id}`);
  return refund;
});

export const dynamic = 'force-dynamic';
