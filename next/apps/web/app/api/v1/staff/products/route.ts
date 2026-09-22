import {
  catalogStaffProductCreate,
  catalogStaffProductList,
} from '@shop/contracts/catalog/catalog.staff.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/staff/products` — 商品管理 list and 添加商品 for the mobile console.
 *
 * Both call the very services the admin console calls: the list is A's
 * `listProducts` under a staff-shaped row, and the create builds a full
 * `AdminProductForm` and hands it to `adminProductCreate`, so validation,
 * SPU uniqueness and the category checks cannot drift between the two doors.
 */

export const GET = handle(catalogStaffProductList, (ctx, { query }) =>
  catalog.staffProductList(ctx, query),
);

export const POST = handle(catalogStaffProductCreate, async (ctx, { body }) => {
  const created = await catalog.staffProductCreate(ctx, body);
  ctx.audit(`product:${created.id}`);
  return created;
});

export const dynamic = 'force-dynamic';
