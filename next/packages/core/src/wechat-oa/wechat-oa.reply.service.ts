import type {
  WechatAutoReply,
  WechatAutoReplyForm,
  WechatAutoReplyListQuery,
  WechatReplyPayload,
  WechatReplyType,
  WechatStatusBody,
} from '@shop/contracts/wechat-oa/schemas';
import { requirePermission } from '../auth/rbac';
import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { fromId, toId } from '../kernel/ids';
import { wechatOaPermissions } from './permissions';
import * as repo from './wechat-oa.repo';

/**
 * Auto replies: the subscribe greeting, the keyword rules and the fallback.
 *
 * The database enforces the two singletons and the keyword uniqueness with
 * partial unique indexes, so the checks here are about the *error the operator
 * reads*, not about correctness — a unique-violation surfacing as a 500 is a
 * correct system with an unusable admin. Both layers exist on purpose.
 */

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Refuses a reply body that would render as an empty chat bubble.
 *
 * The legacy `WechatReplyServices::setReply` stored whatever it was given and
 * the send path silently did nothing, so an operator who saved a `news` reply
 * with no articles saw success and their customers saw nothing at all.
 */
export function validateReplyPayload(
  replyType: WechatReplyType,
  payload: WechatReplyPayload,
): void {
  const fail = (message: string): never => {
    throw new DomainError('VALIDATION_FAILED', { message });
  };
  switch (replyType) {
    case 'text':
      if (!payload.text?.trim()) fail('文字回复需要填写内容');
      break;
    case 'image':
    case 'voice':
      if (!payload.mediaId?.trim()) fail('该回复类型需要选择素材');
      break;
    case 'video':
      if (!payload.mediaId?.trim()) fail('视频回复需要选择素材');
      if (!payload.title?.trim()) fail('视频回复需要填写标题');
      break;
    case 'news':
      if ((payload.articles ?? []).length === 0) fail('图文回复至少需要一篇文章');
      break;
  }
}

export async function list(
  ctx: Ctx,
  query: WechatAutoReplyListQuery,
): Promise<Paged<WechatAutoReply>> {
  requirePermission(ctx, wechatOaPermissions['reply:read']);
  const { rows, total } = await repo.listReplies(ctx.db, {
    ...(query.triggerKind === undefined ? {} : { triggerKind: query.triggerKind }),
    ...(query.keyword === undefined ? {} : { keyword: query.keyword }),
    ...(query.isEnabled === undefined ? {} : { isEnabled: query.isEnabled }),
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize,
  });
  return { items: rows.map(toReply), total, page: query.page, pageSize: query.pageSize };
}

export async function detail(ctx: Ctx, params: { id: string }): Promise<WechatAutoReply> {
  requirePermission(ctx, wechatOaPermissions['reply:read']);
  const row = await repo.findReply(ctx.db, fromId(params.id));
  if (!row) throw new DomainError('WECHAT_OA_REPLY_NOT_FOUND');
  return toReply(row);
}

export async function create(ctx: Ctx, body: WechatAutoReplyForm): Promise<WechatAutoReply> {
  requirePermission(ctx, wechatOaPermissions['reply:write']);
  validateReplyPayload(body.replyType, body.payload);
  await assertFree(ctx, body);

  try {
    const row = await repo.insertReply(ctx.db, {
      triggerKind: body.triggerKind,
      keyword: body.keyword ?? null,
      matchMode: body.triggerKind === 'keyword' ? (body.matchMode ?? 'exact') : null,
      replyType: body.replyType,
      payload: body.payload,
      isEnabled: body.isEnabled,
      sortOrder: body.sortOrder,
    });
    return toReply(row);
  } catch (error) {
    throw conflictFor(error, body);
  }
}

export async function update(
  ctx: Ctx,
  params: { id: string },
  body: WechatAutoReplyForm,
): Promise<WechatAutoReply> {
  requirePermission(ctx, wechatOaPermissions['reply:write']);
  validateReplyPayload(body.replyType, body.payload);
  const id = fromId(params.id);
  const existing = await repo.findReply(ctx.db, id);
  if (!existing) throw new DomainError('WECHAT_OA_REPLY_NOT_FOUND');
  await assertFree(ctx, body, id);

  try {
    await repo.updateReply(ctx.db, id, {
      triggerKind: body.triggerKind,
      keyword: body.keyword ?? null,
      matchMode: body.triggerKind === 'keyword' ? (body.matchMode ?? 'exact') : null,
      replyType: body.replyType,
      payload: body.payload,
      isEnabled: body.isEnabled,
      sortOrder: body.sortOrder,
      now: ctx.clock.now(),
    });
  } catch (error) {
    throw conflictFor(error, body);
  }
  const fresh = await repo.findReply(ctx.db, id);
  return toReply(fresh ?? existing);
}

export async function setStatus(
  ctx: Ctx,
  params: { id: string },
  body: WechatStatusBody,
): Promise<WechatAutoReply> {
  requirePermission(ctx, wechatOaPermissions['reply:write']);
  const id = fromId(params.id);
  const { affected } = await repo.updateReply(ctx.db, id, {
    isEnabled: body.isEnabled,
    now: ctx.clock.now(),
  });
  if (affected === 0) throw new DomainError('WECHAT_OA_REPLY_NOT_FOUND');
  const row = await repo.findReply(ctx.db, id);
  if (!row) throw new DomainError('WECHAT_OA_REPLY_NOT_FOUND');
  return toReply(row);
}

export async function remove(ctx: Ctx, params: { id: string }): Promise<void> {
  requirePermission(ctx, wechatOaPermissions['reply:write']);
  const { affected } = await repo.softDeleteReply(ctx.db, fromId(params.id), ctx.clock.now());
  if (affected === 0) throw new DomainError('WECHAT_OA_REPLY_NOT_FOUND');
}

/** The 409s, reported before the constraint reports them as a 500. */
async function assertFree(ctx: Ctx, body: WechatAutoReplyForm, exceptId?: number): Promise<void> {
  if (body.triggerKind === 'keyword') {
    const keyword = body.keyword ?? '';
    if (await repo.keywordTaken(ctx.db, keyword, exceptId)) {
      throw new DomainError('WECHAT_OA_KEYWORD_TAKEN', { details: { keyword } });
    }
    return;
  }
  if (await repo.singletonTaken(ctx.db, body.triggerKind, exceptId)) {
    throw new DomainError('WECHAT_OA_REPLY_DUPLICATE', {
      details: { triggerKind: body.triggerKind },
    });
  }
}

/**
 * The same 409s again, this time as the index reports them.
 *
 * `assertFree` reads and then writes, and the gap between the two belongs to
 * whoever else is clicking 保存 — two operators adding the keyword 退货 in the
 * same second both pass the check and the second insert hits
 * `wechat_auto_replies_keyword_uq`. Translating it here is what makes the
 * second operator read 该关键词已被其他自动回复占用 instead of 服务器开小差了,
 * and it is the only version of the check that is actually true.
 */
function conflictFor(error: unknown, body: WechatAutoReplyForm): unknown {
  if (repo.isUniqueViolation(error, 'wechat_auto_replies_keyword_uq')) {
    return new DomainError('WECHAT_OA_KEYWORD_TAKEN', { details: { keyword: body.keyword ?? '' } });
  }
  if (repo.isUniqueViolation(error, 'wechat_auto_replies_singleton_uq')) {
    return new DomainError('WECHAT_OA_REPLY_DUPLICATE', {
      details: { triggerKind: body.triggerKind },
    });
  }
  return error;
}

function toReply(row: repo.WechatAutoReply): WechatAutoReply {
  return {
    id: toId(row.id),
    triggerKind: row.triggerKind,
    keyword: row.keyword,
    matchMode: row.matchMode,
    replyType: row.replyType,
    payload: row.payload as WechatReplyPayload,
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
