import { wechatOaMediaSync } from '@shop/contracts/wechat-oa/wechat-oa.media.contract';
import { wechatOaMedia } from '@shop/core/wechat-oa';
import { handle } from '../../../../src/server';

/** Reconciles our rows with WeChat's store, in that direction only. */
export const POST = handle(wechatOaMediaSync, (ctx) => wechatOaMedia.sync(ctx));

export const dynamic = 'force-dynamic';
