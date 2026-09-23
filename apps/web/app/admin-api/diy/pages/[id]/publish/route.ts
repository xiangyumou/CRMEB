import { diyPagePublish } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

export const POST = handle(diyPagePublish, async (ctx, { params }) => {
  const page = await diy.publishPage(ctx, params);
  ctx.audit(`diy:page:${params.id}`);
  return page;
});

export const dynamic = 'force-dynamic';
