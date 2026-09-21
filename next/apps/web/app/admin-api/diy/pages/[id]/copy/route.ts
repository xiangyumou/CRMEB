import { diyPageCopy } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

export const POST = handle(diyPageCopy, async (ctx, { params, body }) => {
  const copy = await diy.copyPage(ctx, { ...params, ...body });
  ctx.audit(`diy:page:${copy.id}`);
  return copy;
});

export const dynamic = 'force-dynamic';
