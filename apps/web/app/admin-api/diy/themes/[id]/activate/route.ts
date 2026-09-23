import { diyThemeActivate } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

export const POST = handle(diyThemeActivate, async (ctx, { params }) => {
  const theme = await diy.activateTheme(ctx, params);
  ctx.audit(`diy:theme:${params.id}`);
  return theme;
});

export const dynamic = 'force-dynamic';
