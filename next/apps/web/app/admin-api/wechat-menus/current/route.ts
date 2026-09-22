import { wechatOaMenuCurrent } from '@shop/contracts/wechat-oa/wechat-oa.menu.contract';
import { wechatOaMenu } from '@shop/core/wechat-oa';
import { handle } from '../../../../src/server';

/** The menu WeChat is actually serving, or `null` before the first publish. */
export const GET = handle(wechatOaMenuCurrent, (ctx) => wechatOaMenu.current(ctx));

export const dynamic = 'force-dynamic';
