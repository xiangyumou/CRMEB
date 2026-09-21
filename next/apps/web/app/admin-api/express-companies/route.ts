import { orderAdminExpressCompanies } from '@shop/contracts/order/order.admin.contract';
import { listExpressCompanies } from '@shop/core/order';
import { handle } from '../../../src/server';

/**
 * `/admin-api/express-companies` — the picker on the 发货 form.
 *
 * Reference data that belongs to stream F2's `shipping` domain; B2 owns it
 * until F2 lands, at which point F2 takes the route over with the same path
 * and the same shape (CR-1-b2, settled in `docs/rewrite/STATUS.md`).
 */
export const GET = handle(orderAdminExpressCompanies, (ctx) => listExpressCompanies(ctx));

export const dynamic = 'force-dynamic';
