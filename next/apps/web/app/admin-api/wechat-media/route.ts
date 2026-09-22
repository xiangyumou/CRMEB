import {
  wechatOaMediaList,
  wechatOaMediaUpload,
} from '@shop/contracts/wechat-oa/wechat-oa.media.contract';
import { wechatOaMedia } from '@shop/core/wechat-oa';
import { handle } from '../../../src/server';

/**
 * `/admin-api/wechat-media` — WeChat's copy of the media library.
 *
 * The POST takes an attachment id, not a file: the bytes are already ours and a
 * second multipart endpoint would be a second place to get the checks wrong.
 */
export const GET = handle(wechatOaMediaList, (ctx, { query }) => wechatOaMedia.list(ctx, query));

export const POST = handle(wechatOaMediaUpload, (ctx, { body }) => wechatOaMedia.upload(ctx, body));

export const dynamic = 'force-dynamic';
