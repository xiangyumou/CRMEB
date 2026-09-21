import { paymentAdminExceptionList } from '@shop/contracts/payment/payment.admin.contract';
import * as payment from '@shop/core/payment';
import { handle } from '../../../src/server';

/**
 * `/admin-api/payment-exceptions` — 异常支付.
 *
 * Money that arrived but could not be booked against an order. Every row here
 * is a thing the legacy system logged and forgot.
 */
export const GET = handle(paymentAdminExceptionList, (ctx, { query }) =>
  payment.adminListExceptions(ctx, query),
);

export const dynamic = 'force-dynamic';
