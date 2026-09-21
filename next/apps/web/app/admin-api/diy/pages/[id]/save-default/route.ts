import { diyPageSaveDefault } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

export const POST = handle(diyPageSaveDefault, async (ctx, { params }) => {
  const result = await diy.savePageAsDefault(ctx, params);
  ctx.audit(`diy:page:${params.id}`);
  return result;
});

export const dynamic = 'force-dynamic';
