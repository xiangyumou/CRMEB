import { catalogStaffProductSetVisibility } from '@shop/contracts/catalog/catalog.staff.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../../../src/server';

/** `/api/v1/staff/products/:id/visibility` — the 上架/下架 switch on the list. */
export const POST = handle(catalogStaffProductSetVisibility, async (ctx, { params, body }) => {
  const updated = await catalog.staffSetVisibility(ctx, params, body);
  ctx.audit(`product:${params.id}`);
  return updated;
});

export const dynamic = 'force-dynamic';
