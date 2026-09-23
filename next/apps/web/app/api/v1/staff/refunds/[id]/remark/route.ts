import { staffRefundRemark } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../../src/server';

/**
 * `/api/v1/staff/refunds/:id/remark` — 售后备注.
 *
 * The note is appended to the refund's log rather than written over the
 * console's `adminRemark` column; the refund's status does not move.
 */
export const POST = handle(staffRefundRemark, async (ctx, { params, body }) => {
  const refund = await orderStaff.refundRemark(ctx, params, body);
  ctx.audit(`refund:${params.id}`);
  return refund;
});

export const dynamic = 'force-dynamic';
