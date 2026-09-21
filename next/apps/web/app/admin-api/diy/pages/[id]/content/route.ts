import { diyPageSaveContent } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

/**
 * The editor's save. The body carries the renderer's own envelope and is
 * stored byte for byte; see `core/diy/content.ts` for why nothing on the way
 * in is allowed to reformat it.
 */
export const PUT = handle(diyPageSaveContent, async (ctx, { params, body }) => {
  const saved = await diy.savePageContent(ctx, { ...params, ...body });
  ctx.audit(`diy:page:${params.id}`);
  return saved;
});

export const dynamic = 'force-dynamic';
