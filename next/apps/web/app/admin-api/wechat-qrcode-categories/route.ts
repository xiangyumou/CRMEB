import {
  wechatOaQrcodeCategoryCreate,
  wechatOaQrcodeCategoryList,
} from '@shop/contracts/wechat-oa/wechat-oa.qrcode.contract';
import { wechatOaQrcode } from '@shop/core/wechat-oa';
import { handle } from '../../../src/server';

export const GET = handle(wechatOaQrcodeCategoryList, (ctx, { query }) =>
  wechatOaQrcode.listCategories(ctx, query),
);

export const POST = handle(wechatOaQrcodeCategoryCreate, (ctx, { body }) =>
  wechatOaQrcode.createCategory(ctx, body),
);

export const dynamic = 'force-dynamic';
