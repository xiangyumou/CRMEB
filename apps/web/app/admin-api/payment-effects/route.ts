import { paymentAdminEffectList } from '@shop/contracts/payment/payment.admin.contract';
import * as payment from '@shop/core/payment';
import { handle } from '../../../src/server';

/**
 * `/admin-api/payment-effects` — 需人工处理.
 *
 * The parked rows of the effects ledger, scoped to payment, refund and order.
 * The table is platform-owned, so one domain does not claim the whole resource.
 */
export const GET = handle(paymentAdminEffectList, (ctx, { query }) =>
  payment.adminListEffects(ctx, query),
);

export const dynamic = 'force-dynamic';
