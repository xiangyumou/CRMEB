import { diyLayoutRoute } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

/**
 * 分类页 / 个人中心 版式. The whole answer is one number, so the number is the
 * validator: it moves exactly when the answer does.
 */
export const GET = handle(diyLayoutRoute, async (ctx, { params }) => {
  const layout = await diy.getLayout(ctx, params);
  ctx.setHeader('Cache-Control', 'no-cache');
  if (ctx.etag(String(layout.status), { weak: true })) ctx.notModified();
  return layout;
});

export const dynamic = 'force-dynamic';
