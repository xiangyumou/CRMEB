import { diyPage } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

/**
 * A published 微页面 by id. A caller holding the current version gets a
 * bodyless 304; the version is the row's `updatedAt` plus its content version,
 * so every save or publish makes the old tag stale.
 */
export const GET = handle(diyPage, async (ctx, { params }) => {
  const page = await diy.getStorefrontPage(ctx, params);
  if (ctx.etag(page.version, { weak: true })) ctx.notModified();
  return page;
});

export const dynamic = 'force-dynamic';
