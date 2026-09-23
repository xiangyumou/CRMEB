import { expressCompanyOptions } from '@shop/contracts/shipping/shipping.express.contract';
import { expressCompanies } from '@shop/core/shipping';
import { handle } from '../../../../src/server';

/** `/api/v1/express-companies` — the enabled carriers, for the shopper's 退货物流 form. */
export const GET = handle(expressCompanyOptions, (ctx) => expressCompanies.pickerList(ctx));

export const dynamic = 'force-dynamic';
