import { decorPageHome } from '@shop/contracts/decor/decor.storefront.contract';
import * as decor from '@shop/core/decor';
import { handle } from '../../../../../src/server';
import { clientVersionOf, pageEtag } from '../_page';

/**
 * The designated home page, resolved. User-optional: the public part is the
 * same for everybody (and cached); a session only adds `personal`.
 */
export const GET = handle(decorPageHome, async (ctx) => {
  const page = await decor.resolveHome(ctx, { clientVersion: clientVersionOf(ctx.request) });
  if (ctx.etag(pageEtag(page), { weak: true })) ctx.notModified();
  return page;
});

export const dynamic = 'force-dynamic';
