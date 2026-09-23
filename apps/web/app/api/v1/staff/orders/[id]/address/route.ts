import { staffOrderAddress } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../../src/server';

/** `/api/v1/staff/orders/:id/address`. */
export const POST = handle(staffOrderAddress, async (ctx, { params, body }) => {
  const updated = await orderStaff.updateAddress(ctx, params, body);
  ctx.audit(`order:${params.id}`);
  return updated;
});

export const dynamic = 'force-dynamic';
