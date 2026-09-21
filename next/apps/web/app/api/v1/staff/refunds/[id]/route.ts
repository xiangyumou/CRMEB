import { staffRefundDetail } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../src/server';

/** `/api/v1/staff/refunds/:id` — C's `adminRefundDetail`, passed through unchanged. */
export const GET = handle(staffRefundDetail, (ctx, { params }) =>
  orderStaff.refundDetail(ctx, params),
);

export const dynamic = 'force-dynamic';
