import { staffRefundList } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/staff/refunds` — the order domain owns the surface, the refund
 * domain owns the money.
 *
 * Straight through the `StaffRefundPort` to the refund service, so the phone can
 * never diverge from the web after-sales screen and no code here touches a
 * gateway, a `refunds` row or `orders.refunded_amount`.
 */
export const GET = handle(staffRefundList, (ctx, { query }) => orderStaff.refundList(ctx, query));

export const dynamic = 'force-dynamic';
