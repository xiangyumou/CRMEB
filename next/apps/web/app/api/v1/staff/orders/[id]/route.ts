import { staffOrderDetailRoute } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../src/server';

/** `/api/v1/staff/orders/:id`. The phone has no business showing margin, so `costAmount` is gone. */
export const GET = handle(staffOrderDetailRoute, (ctx, { params }) =>
  orderStaff.orderDetail(ctx, params),
);

export const dynamic = 'force-dynamic';
