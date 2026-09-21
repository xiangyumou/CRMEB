import {
  catalogAdminProtectionCreate,
  catalogAdminProtectionList,
} from '@shop/contracts/catalog/catalog.taxonomy.admin.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../src/server';

/**
 * `/admin-api/catalog/protections` — 商品保障服务.
 *
 * Under `catalog:protection:*`, not `catalog:param:*`. Legacy registered these
 * routes under a group labelled 商品参数, so a role granted "product
 * parameters" silently also got "edit the guarantee badges on every product
 * page". Brief: "Fix, don't port".
 */

export const GET = handle(catalogAdminProtectionList, (ctx, { query }) =>
  catalog.adminProtectionList(ctx, query),
);

export const POST = handle(catalogAdminProtectionCreate, async (ctx, { body }) => {
  const created = await catalog.adminProtectionCreate(ctx, body);
  ctx.audit(`protection:${created.id}`);
  return created;
});

export const dynamic = 'force-dynamic';
