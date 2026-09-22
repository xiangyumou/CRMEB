import { wechatOaJssdkConfig } from '@shop/contracts/wechat-oa/wechat-oa.storefront.contract';
import { wechatOaStorefront } from '@shop/core/wechat-oa';
import { handle } from '../../../../../src/server';

/**
 * Signs one page URL for `wx.config`.
 *
 * The host must be the site's own or on the operator's list: a signature over
 * an arbitrary URL is a signature for somebody else's page.
 */
export const GET = handle(wechatOaJssdkConfig, (ctx, { query }) =>
  wechatOaStorefront.jssdkConfigFor(ctx, query),
);

export const dynamic = 'force-dynamic';
