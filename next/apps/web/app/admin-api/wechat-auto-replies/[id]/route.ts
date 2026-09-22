import {
  wechatOaReplyDelete,
  wechatOaReplyDetail,
  wechatOaReplyUpdate,
} from '@shop/contracts/wechat-oa/wechat-oa.reply.contract';
import { wechatOaReply } from '@shop/core/wechat-oa';
import { handle } from '../../../../src/server';

export const GET = handle(wechatOaReplyDetail, (ctx, { params }) =>
  wechatOaReply.detail(ctx, params),
);

export const PUT = handle(wechatOaReplyUpdate, (ctx, { params, body }) =>
  wechatOaReply.update(ctx, params, body),
);

export const DELETE = handle(wechatOaReplyDelete, (ctx, { params }) =>
  wechatOaReply.remove(ctx, params),
);

export const dynamic = 'force-dynamic';
