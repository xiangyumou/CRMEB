import { staffMe } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/staff/me` — does this shopper see the 商家管理 entry?
 *
 * `auth: 'user'`, not `'staff'`, so an ordinary shopper gets `isStaff: false`
 * rather than a 403 the app would have to special-case.
 */
export const GET = handle(staffMe, (ctx) => orderStaff.me(ctx));

export const dynamic = 'force-dynamic';
