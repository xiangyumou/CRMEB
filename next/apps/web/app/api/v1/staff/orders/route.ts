import { staffOrderList } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../src/server';

/** `/api/v1/staff/orders` — the web console's list minus the soft-delete column. */
export const GET = handle(staffOrderList, (ctx, { query }) => orderStaff.orderList(ctx, query));

export const dynamic = 'force-dynamic';
