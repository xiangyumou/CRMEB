import { expressCompanyPicker } from '@shop/contracts/shipping/shipping.express.contract';
import { expressCompanies } from '@shop/core/shipping';
import { handle } from '../../../src/server';

/**
 * `/admin-api/express-companies` — the picker on the 发货 form.
 *
 * Stream F2's `shipping` domain owns this now (CR-1-b2, settled). The path,
 * the body and the `order:order:read` permission are unchanged from B2's
 * version: an operator trusted to dispatch goods needs no second grant to see
 * the carrier list.
 */
export const GET = handle(expressCompanyPicker, (ctx) => expressCompanies.pickerList(ctx));

export const dynamic = 'force-dynamic';
