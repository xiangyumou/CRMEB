import { catalogStaffCategoryAssignments } from '@shop/contracts/catalog/catalog.staff.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../../src/server';

/** `/api/v1/staff/products/category-assignments` — 批量改分类 from the checkbox list. */
export const POST = handle(catalogStaffCategoryAssignments, async (ctx, { body }) => {
  const result = await catalog.staffAssignCategories(ctx, body);
  ctx.audit(`product:${body.productIds.join(',')}`);
  return result;
});

export const dynamic = 'force-dynamic';
