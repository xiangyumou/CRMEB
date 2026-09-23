import { diyThemeUpdate } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../src/server';

export const PATCH = handle(diyThemeUpdate, async (ctx, { params, body }) => {
  const theme = await diy.updateTheme(ctx, { ...params, ...body });
  ctx.audit(`diy:theme:${params.id}`);
  return theme;
});

export const dynamic = 'force-dynamic';
