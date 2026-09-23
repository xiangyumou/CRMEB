import { diyPageVersion } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../src/server';

/**
 * The cheap poll the app makes on resume: the page payload is large and
 * changes rarely, so the client compares this string before downloading it
 * again. The string is also the validator, so the poll itself answers 304
 * while nothing has changed.
 */
export const GET = handle(diyPageVersion, async (ctx, { query }) => {
  const result = await diy.getPageVersion(ctx, query);
  ctx.setHeader('Cache-Control', 'no-cache');
  if (ctx.etag(result.version, { weak: true })) ctx.notModified();
  return result;
});

export const dynamic = 'force-dynamic';
