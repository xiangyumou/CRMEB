import {
  wechatOaMenuDelete,
  wechatOaMenuUpdate,
} from '@shop/contracts/wechat-oa/wechat-oa.menu.contract';
import { wechatOaMenu } from '@shop/core/wechat-oa';
import { handle } from '../../../../src/server';

export const PUT = handle(wechatOaMenuUpdate, (ctx, { params, body }) =>
  wechatOaMenu.update(ctx, params, body),
);

export const DELETE = handle(wechatOaMenuDelete, (ctx, { params }) =>
  wechatOaMenu.remove(ctx, params),
);

export const dynamic = 'force-dynamic';
