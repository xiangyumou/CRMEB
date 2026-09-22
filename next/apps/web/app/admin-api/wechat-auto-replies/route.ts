import {
  wechatOaReplyCreate,
  wechatOaReplyList,
} from '@shop/contracts/wechat-oa/wechat-oa.reply.contract';
import { wechatOaReply } from '@shop/core/wechat-oa';
import { handle } from '../../../src/server';

/** `/admin-api/wechat-auto-replies` — the subscribe greeting, the keyword rules and the fallback. */
export const GET = handle(wechatOaReplyList, (ctx, { query }) => wechatOaReply.list(ctx, query));

export const POST = handle(wechatOaReplyCreate, (ctx, { body }) => wechatOaReply.create(ctx, body));

export const dynamic = 'force-dynamic';
