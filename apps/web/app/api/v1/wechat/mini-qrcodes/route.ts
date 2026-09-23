import { wechatMiniCode } from '@shop/contracts/wechat/wechat.storefront.contract';
import { miniCodeUrl } from '@shop/core/wechat';
import { handle } from '../../../../../src/server';

/**
 * `GET /api/v1/wechat/mini-qrcodes` — the 小程序码 for a poster or share sheet.
 *
 * The answer is a URL on the shop's own storage: the first caller for a
 * `(page, scene)` pair pays for the WeChat call, everybody after that is served
 * from `wechat_mini_codes`.
 */
export const GET = handle(wechatMiniCode, (ctx, { query }) => miniCodeUrl(ctx, query));

export const dynamic = 'force-dynamic';
