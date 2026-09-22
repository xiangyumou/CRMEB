import { wechatOaSubscribeTemplates } from '@shop/contracts/wechat-oa/wechat-oa.storefront.contract';
import { wechatOaStorefront } from '@shop/core/wechat-oa';
import { handle } from '../../../../../src/server';

/** The ids `wx.requestSubscribeMessage` needs, per storefront scene. */
export const GET = handle(wechatOaSubscribeTemplates, (ctx, { query }) =>
  wechatOaStorefront.subscribeTemplatesFor(ctx, query),
);

export const dynamic = 'force-dynamic';
