import { diyProductDetailPageRoute } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

/**
 * 商品详情. A fixed segment, so Next resolves it before the sibling `[id]`
 * route and `product-detail` never reaches the numeric param.
 *
 * Read on every product view, so a caller holding the current version gets a
 * bodyless 304. The built-in default has a version of its own, so publishing
 * the first decorated page, or withdrawing the last one, moves the tag.
 */
export const GET = handle(diyProductDetailPageRoute, async (ctx) => {
  const page = await diy.getProductDetailPage(ctx);
  if (ctx.etag(page.version, { weak: true })) ctx.notModified();
  return page;
});

export const dynamic = 'force-dynamic';
