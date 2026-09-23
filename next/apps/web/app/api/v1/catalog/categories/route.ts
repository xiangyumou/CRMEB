import { catalogCategoryTree } from '@shop/contracts/catalog/catalog.storefront.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/catalog/categories` — the storefront category tree.
 *
 * Carries a `version` the client can compare before re-rendering; the tree
 * changes a few times a month and is fetched on every cold start. The same
 * string goes out as an `ETag` (CR-3-h) so a caching proxy and a client that
 * speaks HTTP rather than our field both see it, and a matching
 * `If-None-Match` gets a bodyless 304 (CR-1-s). `…/categories/version` stays
 * for a client that only wants the string.
 */
export const GET = handle(catalogCategoryTree, async (ctx) => {
  const tree = await catalog.categoryTree(ctx);
  if (ctx.etag(tree.version)) ctx.notModified();
  return tree;
});

export const dynamic = 'force-dynamic';
