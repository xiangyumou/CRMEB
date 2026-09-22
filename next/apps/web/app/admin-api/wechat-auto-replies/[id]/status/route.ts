import { wechatOaReplySetStatus } from '@shop/contracts/wechat-oa/wechat-oa.reply.contract';
import { wechatOaReply } from '@shop/core/wechat-oa';
import { handle } from '../../../../../src/server';

export const POST = handle(wechatOaReplySetStatus, (ctx, { params, body }) =>
  wechatOaReply.setStatus(ctx, params, body),
);

export const dynamic = 'force-dynamic';
