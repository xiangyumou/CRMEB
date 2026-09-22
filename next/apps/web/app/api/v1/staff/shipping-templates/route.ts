import { catalogStaffShippingTemplates } from '@shop/contracts/catalog/catalog.staff.contract';
import { templates } from '@shop/core/shipping';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/staff/shipping-templates` — the 运费模板 select on 添加商品.
 *
 * F2's shape and F2's service; only the path is staff-scoped, exactly as B2's
 * `/api/v1/staff/express-companies` inherited its body from the admin picker.
 */
export const GET = handle(catalogStaffShippingTemplates, (ctx) => templates.options(ctx));

export const dynamic = 'force-dynamic';
