import { catalogStaffShippingTemplates } from '@shop/contracts/catalog/catalog.staff.contract';
import { templates } from '@shop/core/shipping';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/staff/shipping-templates` — the 运费模板 select on 添加商品.
 *
 * The shipping domain's shape and service; only the path is staff-scoped, exactly
 * as `/api/v1/staff/express-companies` shares its body with the admin picker.
 */
export const GET = handle(catalogStaffShippingTemplates, (ctx) => templates.options(ctx));

export const dynamic = 'force-dynamic';
