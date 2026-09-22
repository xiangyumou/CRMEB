import { articleListPublic } from '@shop/contracts/cms/cms.storefront.contract';
import { articles } from '@shop/core/cms';
import { handle } from '../../../../src/server';

/**
 * `/api/v1/articles` — published articles only.
 *
 * `categoryId` and `feature=hot|banner` replace four legacy routes that were
 * the same query with one `where` swapped, none of which filtered on status.
 */
export const GET = handle(articleListPublic, (ctx, { query }) => articles.publicList(ctx, query));

export const dynamic = 'force-dynamic';
