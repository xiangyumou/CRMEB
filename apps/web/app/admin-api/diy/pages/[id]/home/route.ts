import { diyPageSetHome } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

export const POST = handle(diyPageSetHome, async (ctx, { params }) => {
  const page = await diy.setHomePage(ctx, params);
  ctx.audit(`diy:page:${params.id}`);
  return page;
});

export const dynamic = 'force-dynamic';
