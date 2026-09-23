import { shareMiniCode } from '@shop/contracts/wechat/wechat.share.contract';
import { shareMiniCodeUrl } from '@shop/core/wechat';
import { handle } from '../../../../../src/server';

/**
 * `GET /api/v1/share/mini-codes?route=&id=` — the 小程序码 for a storefront
 * route-catalogue key. The page and `scene` come from the catalogue; the cache
 * and the mint budget are `/wechat/mini-qrcodes`'s.
 */
export const GET = handle(shareMiniCode, (ctx, { query }) => shareMiniCodeUrl(ctx, query));

export const dynamic = 'force-dynamic';
