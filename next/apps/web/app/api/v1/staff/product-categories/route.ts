import { catalogStaffProductCategories } from '@shop/contracts/catalog/catalog.staff.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../src/server';

/** `/api/v1/staff/product-categories` — the 分类 drawer, the same three-level tree. */
export const GET = handle(catalogStaffProductCategories, (ctx) =>
  catalog.staffProductCategories(ctx),
);

export const dynamic = 'force-dynamic';
