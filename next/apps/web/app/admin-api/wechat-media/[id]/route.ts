import { wechatOaMediaDelete } from '@shop/contracts/wechat-oa/wechat-oa.media.contract';
import { wechatOaMedia } from '@shop/core/wechat-oa';
import { handle } from '../../../../src/server';

export const DELETE = handle(wechatOaMediaDelete, (ctx, { params }) =>
  wechatOaMedia.remove(ctx, params),
);

export const dynamic = 'force-dynamic';
