import { staffOrderTimeline } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../../src/server';

/** `/api/v1/staff/orders/:id/status-logs`. */
export const GET = handle(staffOrderTimeline, (ctx, { params }) =>
  orderStaff.orderTimeline(ctx, params),
);

export const dynamic = 'force-dynamic';
