import { diyLinkDelete, diyLinkUpdate } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../src/server';

export const PATCH = handle(diyLinkUpdate, async (ctx, { params, body }) => {
  const link = await diy.updateLink(ctx, { ...params, ...body });
  ctx.audit(`diy:link:${params.id}`);
  return link;
});

export const DELETE = handle(diyLinkDelete, async (ctx, { params }) => {
  const result = await diy.deleteLink(ctx, params);
  ctx.audit(`diy:link:${params.id}`);
  return result;
});

export const dynamic = 'force-dynamic';
