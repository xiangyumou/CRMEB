import { staffStatisticsRoute } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../src/server';

/** `/api/v1/staff/statistics` — the phone's home screen. No cost, no margin. */
export const GET = handle(staffStatisticsRoute, (ctx) => orderStaff.statistics(ctx));

export const dynamic = 'force-dynamic';
