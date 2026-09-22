import { wechatOaMenuPublish } from '@shop/contracts/wechat-oa/wechat-oa.menu.contract';
import { wechatOaMenu } from '@shop/core/wechat-oa';
import { handle } from '../../../../../src/server';

/** Its own permission: publishing changes what every follower sees, and cannot be undone by editing. */
export const POST = handle(wechatOaMenuPublish, (ctx, { params }) =>
  wechatOaMenu.publish(ctx, params),
);

export const dynamic = 'force-dynamic';
