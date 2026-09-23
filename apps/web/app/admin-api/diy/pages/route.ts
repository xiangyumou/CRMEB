import { diyPageCreate, diyPageList } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../src/server';

export const GET = handle(diyPageList, (ctx, { query }) => diy.listPages(ctx, query));

export const POST = handle(diyPageCreate, async (ctx, { body }) => {
  const created = await diy.createPage(ctx, body);
  ctx.audit(`diy:page:${created.id}`);
  return created;
});

export const dynamic = 'force-dynamic';
