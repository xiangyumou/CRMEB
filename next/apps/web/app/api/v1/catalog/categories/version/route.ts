import { catalogCategoryVersion } from '@shop/contracts/catalog/catalog.storefront.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../../src/server';

/**
 * `/api/v1/catalog/categories/version` — "has the category tree changed?" in
 * two fields (CR-3-h).
 *
 * The `ETag` is the same string as the body, so a client that caches on either
 * gets the same answer. `handle()` cannot yet turn an `If-None-Match` into a
 * 304 (CR-1-s); until it can, this route is what saves the cold start from
 * downloading the whole tree.
 */
export const GET = handle(catalogCategoryVersion, async (ctx) => {
  const result = await catalog.categoryVersion(ctx);
  ctx.setHeader('etag', `"${result.version}"`);
  return result;
});

export const dynamic = 'force-dynamic';
