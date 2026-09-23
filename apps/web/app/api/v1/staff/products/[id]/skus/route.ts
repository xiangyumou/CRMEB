import {
  catalogStaffProductSkuUpdate,
  catalogStaffProductSkus,
} from '@shop/contracts/catalog/catalog.staff.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../../../src/server';

/**
 * `/api/v1/staff/products/:id/skus` — 规格 and 修改价格/库存.
 *
 * The PUT is a patch per SKU applied under `FOR UPDATE`, never a read-then-write
 * of the whole row; the audit entry is on the product because that is the thing
 * a reviewer looks up afterwards.
 */

export const GET = handle(catalogStaffProductSkus, (ctx, { params }) =>
  catalog.staffProductSkus(ctx, params),
);

export const PUT = handle(catalogStaffProductSkuUpdate, async (ctx, { params, body }) => {
  const updated = await catalog.staffUpdateSkus(ctx, params, body);
  ctx.audit(`product:${params.id}`);
  return updated;
});

export const dynamic = 'force-dynamic';
