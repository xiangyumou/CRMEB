import { staffExpressCompanies } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../src/server';

/** `/api/v1/staff/express-companies` — B2's until F2's `shipping` lands (CR-1-b2). */
export const GET = handle(staffExpressCompanies, (ctx) => orderStaff.expressCompanies(ctx));

export const dynamic = 'force-dynamic';
