import { diyPageDelete, diyPageGet, diyPageUpdate } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../src/server';

export const GET = handle(diyPageGet, (ctx, { params }) => diy.getPage(ctx, params));

export const PATCH = handle(diyPageUpdate, async (ctx, { params, body }) => {
  const updated = await diy.updatePage(ctx, { ...params, ...body });
  ctx.audit(`diy:page:${params.id}`);
  return updated;
});

export const DELETE = handle(diyPageDelete, async (ctx, { params }) => {
  const result = await diy.deletePage(ctx, params);
  ctx.audit(`diy:page:${params.id}`);
  return result;
});

export const dynamic = 'force-dynamic';
