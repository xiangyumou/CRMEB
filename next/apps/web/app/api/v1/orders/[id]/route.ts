import { orderGetDetail } from '@shop/contracts/order/order.checkout.contract';
import * as order from '@shop/core/order';
import { handle } from '../../../../../src/server';

/** `/api/v1/orders/:id` — 订单详情. A stranger and an unknown id get the same 404. */
export const GET = handle(orderGetDetail, (ctx, { params }) => order.detail(ctx, params));

export const dynamic = 'force-dynamic';
