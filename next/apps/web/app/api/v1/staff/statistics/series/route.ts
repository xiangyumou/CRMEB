import { staffStatisticsSeriesRoute } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../src/server';

/** `/api/v1/staff/statistics/series` — 统计明细, one row per Asia/Shanghai day (CR-4-h §1). */
export const GET = handle(staffStatisticsSeriesRoute, (ctx, { query }) =>
  orderStaff.statisticsSeries(ctx, query),
);

export const dynamic = 'force-dynamic';
