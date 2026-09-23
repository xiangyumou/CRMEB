import { diyTheme } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../src/server';

/**
 * The active theme's colour tokens. The validator names the theme as well as
 * its version: activating another theme changes the answer, and it must not
 * depend on two themes never sharing an `updatedAt`.
 */
export const GET = handle(diyTheme, async (ctx) => {
  const theme = await diy.getActiveTheme(ctx);
  ctx.setHeader('Cache-Control', 'no-cache');
  if (ctx.etag(`${theme.id}.${theme.version}`, { weak: true })) ctx.notModified();
  return theme;
});

export const dynamic = 'force-dynamic';
