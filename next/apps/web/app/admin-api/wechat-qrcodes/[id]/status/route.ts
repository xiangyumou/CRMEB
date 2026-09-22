import { wechatOaQrcodeSetStatus } from '@shop/contracts/wechat-oa/wechat-oa.qrcode.contract';
import { wechatOaQrcode } from '@shop/core/wechat-oa';
import { handle } from '../../../../../src/server';

export const POST = handle(wechatOaQrcodeSetStatus, (ctx, { params, body }) =>
  wechatOaQrcode.setStatus(ctx, params, body),
);

export const dynamic = 'force-dynamic';
