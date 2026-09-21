import { staffOrderRemark } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../../src/server';

/** `/api/v1/staff/orders/:id/remark`. The timeline records `operator_kind: 'user'`. */
export const POST = handle(staffOrderRemark, async (ctx, { params, body }) => {
  const updated = await orderStaff.remark(ctx, params, body);
  ctx.audit(`order:${params.id}`);
  return updated;
});

export const dynamic = 'force-dynamic';
