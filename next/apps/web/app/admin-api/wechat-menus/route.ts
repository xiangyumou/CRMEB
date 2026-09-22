import {
  wechatOaMenuCreate,
  wechatOaMenuList,
} from '@shop/contracts/wechat-oa/wechat-oa.menu.contract';
import { wechatOaMenu } from '@shop/core/wechat-oa';
import { handle } from '../../../src/server';

/** `/admin-api/wechat-menus` — the menu drafts. Editing one changes nothing WeChat serves. */
export const GET = handle(wechatOaMenuList, (ctx, { query }) => wechatOaMenu.list(ctx, query));

export const POST = handle(wechatOaMenuCreate, (ctx, { body }) => wechatOaMenu.create(ctx, body));

export const dynamic = 'force-dynamic';
