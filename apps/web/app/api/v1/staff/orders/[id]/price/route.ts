import { staffOrderPrice } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../../src/server';

/** `/api/v1/staff/orders/:id/price` — off unless `order-staff.allowStaffRepricing` is on. */
export const POST = handle(staffOrderPrice, async (ctx, { params, body }) => {
  const updated = await orderStaff.adjustPrice(ctx, params, body);
  ctx.audit(`order:${params.id}`);
  return updated;
});

export const dynamic = 'force-dynamic';
