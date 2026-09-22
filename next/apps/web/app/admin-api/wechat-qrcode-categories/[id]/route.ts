import {
  wechatOaQrcodeCategoryDelete,
  wechatOaQrcodeCategoryUpdate,
} from '@shop/contracts/wechat-oa/wechat-oa.qrcode.contract';
import { wechatOaQrcode } from '@shop/core/wechat-oa';
import { handle } from '../../../../src/server';

export const PUT = handle(wechatOaQrcodeCategoryUpdate, (ctx, { params, body }) =>
  wechatOaQrcode.updateCategory(ctx, params, body),
);

/** Refuses while the category still holds codes: `set null` would silently rewrite a channel report. */
export const DELETE = handle(wechatOaQrcodeCategoryDelete, (ctx, { params }) =>
  wechatOaQrcode.deleteCategory(ctx, params),
);

export const dynamic = 'force-dynamic';
