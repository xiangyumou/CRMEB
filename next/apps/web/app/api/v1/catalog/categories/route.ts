import { catalogCategoryTree } from '@shop/contracts/catalog/catalog.storefront.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/catalog/categories` — the storefront category tree.
 *
 * Carries a `version` the client can compare before re-rendering; the tree
 * changes a few times a month and is fetched on every cold start. The same
 * string goes out as an `ETag` (CR-3-h) so a caching proxy and a client that
 * speaks HTTP rather than our field both see it. `handle()` cannot yet answer
 * `If-None-Match` with a 304 — CR-1-s carries the patch — so a client that only
 * wants to know whether the tree moved asks `…/categories/version` instead.
 */
export const GET = handle(catalogCategoryTree, async (ctx) => {
  const tree = await catalog.categoryTree(ctx);
  ctx.setHeader('etag', `"${tree.version}"`);
  return tree;
});

export const dynamic = 'force-dynamic';
