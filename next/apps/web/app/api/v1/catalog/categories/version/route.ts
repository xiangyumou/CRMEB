import { catalogCategoryVersion } from '@shop/contracts/catalog/catalog.storefront.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../../src/server';

/**
 * `/api/v1/catalog/categories/version` — "has the category tree changed?" in
 * two fields (CR-3-h).
 *
 * The `ETag` is the same string as the body, so a client that caches on either
 * gets the same answer. It predates the 304 on the tree route (CR-1-s) and
 * stays for the uni-app's `getCategoryVersion()`; it answers 304 too.
 */
export const GET = handle(catalogCategoryVersion, async (ctx) => {
  const result = await catalog.categoryVersion(ctx);
  if (ctx.etag(result.version)) ctx.notModified();
  return result;
});

export const dynamic = 'force-dynamic';
