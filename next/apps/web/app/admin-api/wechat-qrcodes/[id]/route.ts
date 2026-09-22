import {
  wechatOaQrcodeDelete,
  wechatOaQrcodeDetail,
  wechatOaQrcodeUpdate,
} from '@shop/contracts/wechat-oa/wechat-oa.qrcode.contract';
import { wechatOaQrcode } from '@shop/core/wechat-oa';
import { handle } from '../../../../src/server';

export const GET = handle(wechatOaQrcodeDetail, (ctx, { params }) =>
  wechatOaQrcode.detail(ctx, params),
);

/** The scene is not editable here: it is printed on posters already on walls. */
export const PUT = handle(wechatOaQrcodeUpdate, (ctx, { params, body }) =>
  wechatOaQrcode.update(ctx, params, body),
);

export const DELETE = handle(wechatOaQrcodeDelete, (ctx, { params }) =>
  wechatOaQrcode.remove(ctx, params),
);

export const dynamic = 'force-dynamic';
