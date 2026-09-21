import { diyLinkCreate, diyLinkList } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../src/server';

export const GET = handle(diyLinkList, (ctx, { query }) => diy.listLinks(ctx, query));

export const POST = handle(diyLinkCreate, async (ctx, { body }) => {
  const created = await diy.createLink(ctx, body);
  ctx.audit(`diy:link:${created.id}`);
  return created;
});

export const dynamic = 'force-dynamic';
