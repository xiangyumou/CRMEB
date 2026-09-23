import { diyProductDetailPageRoute } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

/**
 * 商品详情 (CR-2-h3). A fixed segment, so Next resolves it before the sibling
 * `[id]` route and `product-detail` never reaches the numeric param.
 */
export const GET = handle(diyProductDetailPageRoute, (ctx) => diy.getProductDetailPage(ctx));

export const dynamic = 'force-dynamic';
