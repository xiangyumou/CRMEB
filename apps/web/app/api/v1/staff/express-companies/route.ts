import { staffExpressCompanyPicker } from '@shop/contracts/shipping/shipping.express.contract';
import { expressCompanies } from '@shop/core/shipping';
import { handle } from '../../../../../src/server';

/** `/api/v1/staff/express-companies` — same list, same body, for the mobile staff console. */
export const GET = handle(staffExpressCompanyPicker, (ctx) => expressCompanies.pickerList(ctx));

export const dynamic = 'force-dynamic';
