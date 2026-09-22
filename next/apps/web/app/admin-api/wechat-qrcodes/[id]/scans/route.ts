import { wechatOaQrcodeScans } from '@shop/contracts/wechat-oa/wechat-oa.qrcode.contract';
import { wechatOaQrcode } from '@shop/core/wechat-oa';
import { handle } from '../../../../../src/server';

/** Openids are masked: this list is read by anybody with `wechat-oa:qrcode:read`. */
export const GET = handle(wechatOaQrcodeScans, (ctx, { params, query }) =>
  wechatOaQrcode.scans(ctx, params, query),
);

export const dynamic = 'force-dynamic';
