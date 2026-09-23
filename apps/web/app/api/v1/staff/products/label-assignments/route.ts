import { catalogStaffLabelAssignments } from '@shop/contracts/catalog/catalog.staff.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../../src/server';

/** `/api/v1/staff/products/label-assignments` — 批量打标签 from the checkbox list. */
export const POST = handle(catalogStaffLabelAssignments, async (ctx, { body }) => {
  const result = await catalog.staffAssignLabels(ctx, body);
  ctx.audit(`product:${body.productIds.join(',')}`);
  return result;
});

export const dynamic = 'force-dynamic';
