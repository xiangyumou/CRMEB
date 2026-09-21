import { catalogCategoryTree } from '@shop/contracts/catalog/catalog.storefront.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/catalog/categories` — the storefront category tree.
 *
 * Carries a `version` the client can compare before re-rendering; the tree
 * changes a few times a month and is fetched on every cold start.
 */

export const GET = handle(catalogCategoryTree, (ctx) => catalog.categoryTree(ctx));

export const dynamic = 'force-dynamic';
