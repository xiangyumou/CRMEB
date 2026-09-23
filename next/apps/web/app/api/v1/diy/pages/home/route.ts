import { diyHomePage } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

/**
 * The decorated home page. Public: it is
 * the first screen a cold visitor sees, and nothing in it is user-specific.
 *
 * A matching `If-None-Match` gets a bodyless 304: the
 * version comes from the cached payload, so an unchanged page costs one Redis
 * read and a few hundred bytes. The tag stays weak, as `diy.getHomePage` sets it.
 */
export const GET = handle(diyHomePage, async (ctx) => {
  const page = await diy.getHomePage(ctx);
  if (ctx.etag(page.version, { weak: true })) ctx.notModified();
  return page;
});

export const dynamic = 'force-dynamic';
