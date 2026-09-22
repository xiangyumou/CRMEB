import {
  wechatOaQrcodeCreate,
  wechatOaQrcodeList,
} from '@shop/contracts/wechat-oa/wechat-oa.qrcode.contract';
import { wechatOaQrcode } from '@shop/core/wechat-oa';
import { handle } from '../../../src/server';

export const GET = handle(wechatOaQrcodeList, (ctx, { query }) => wechatOaQrcode.list(ctx, query));

export const POST = handle(wechatOaQrcodeCreate, (ctx, { body }) =>
  wechatOaQrcode.create(ctx, body),
);

export const dynamic = 'force-dynamic';
