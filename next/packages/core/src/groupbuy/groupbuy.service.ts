import type { PageQuery } from '@shop/contracts/conventions';
import type {
  GroupbuyActivityDetail,
  GroupbuyActivityForm,
  GroupbuyActivityListItem,
  GroupbuyActivityListQuery,
  GroupbuyActivityOrder,
  GroupbuyActivityOrderQuery,
  GroupbuyActivityStat,
  GroupbuyActivityStatusBody,
  GroupbuyCard,
  GroupbuyDetail,
  GroupbuyGroupDetail,
  GroupbuyGroupListItem,
  GroupbuyGroupListQuery,
  GroupbuyGroupStatus,
  GroupbuyGroupView,
  GroupbuyListQuery,
  GroupbuyMember,
  GroupbuyOpenGroup,
  GroupbuyPoster,
  GroupbuyStatisticsQuery,
  GroupbuySummary,
  MyGroupbuyItem,
  MyGroupbuyListQuery,
} from '@shop/contracts/groupbuy/schemas';
import { GROUPBUY_SUMMARY_AVATAR_LIMIT } from '@shop/contracts/groupbuy/schemas';
import { DomainError } from '../kernel/errors';
import { toId, toIdOrNull } from '../kernel/ids';
import type { Ctx } from '../kernel/context';
import { groupbuyConfig } from './groupbuy.config';
import { settleGroup } from './groupbuy.jobs';
import * as repo from './groupbuy.repo';
import {
  assertCompletable,
  assertWithdrawable,
  isActivityOpen,
  isGroupJoinable,
  seatsLeft,
  wasVirtuallyFilled,
} from './groupbuy.rules';

/**
 * Group-buy services: everything a route file calls.
 *
 * The split CONVENTIONS asks for holds throughout — the service decides, the
 * repo states. Every `if` about an affected row count is here; every SQL
 * statement is in `groupbuy.repo.ts`. What is *not* here is joining a team:
 * that is an order, and it lives in `groupbuy.order.ts` behind B1's seams.
 *
 * The admin surface is audited for free: `handle()` writes an `audit_logs` row
 * for every mutating admin route, so 立即成团 carries the operator's account
 * without this file writing a line. Legacy passed `$operator` as a bare string
 * into `virtualCombination()` and nobody ever read it.
 */

type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

// ---------------------------------------------------------------------------
// admin — activities
// ---------------------------------------------------------------------------

export async function adminActivityList(
  ctx: Ctx,
  query: GroupbuyActivityListQuery,
): Promise<Paged<GroupbuyActivityListItem>> {
  const { rows, total } = await repo.listActivities(ctx.db, {
    keyword: query.keyword,
    statuses: asArray(query.status),
    productId: query.productId === undefined ? undefined : Number(query.productId),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    ...pageBounds(query),
  });
  const forming = await repo.countFormingGroupsByActivity(
    ctx.db,
    rows.map((row) => row.id),
  );
  return {
    items: rows.map((row) => toListItem(row, forming.get(row.id) ?? 0)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function adminActivityDetail(
  ctx: Ctx,
  input: { id: string },
): Promise<GroupbuyActivityDetail> {
  const id = Number(input.id);
  const row = await mustFindActivity(ctx, id);
  return toDetail(ctx, row);
}

export async function adminActivityCreate(
  ctx: Ctx,
  body: GroupbuyActivityForm,
): Promise<GroupbuyActivityDetail> {
  return ctx.withTx(async (tx) => {
    await assertSkusBelongToProduct(tx, body);
    const now = ctx.clock.now();
    const row = await repo.insertActivity(tx, {
      ...activityValues(body),
      createdAt: now,
      updatedAt: now,
    });
    await repo.replaceActivitySkus(tx, { activityId: row.id, skus: skuValues(body) });
    const full = await mustFindActivity(ctx, row.id, tx);
    return toDetail(ctx, full, tx);
  });
}

/**
 * Edit.
 *
 * `seatsRequired` and `groupTtlSeconds` are copied onto every group when it
 * opens (`groupbuy_groups.seats_total`, `expires_at`), so raising the team size
 * mid-campaign cannot move the goalposts for a team already forming. That is
 * the whole reason those two columns are duplicated on the group row, and it is
 * the bug behind legacy's "my three-person team suddenly needs five".
 */
export async function adminActivityUpdate(
  ctx: Ctx,
  input: { id: string },
  body: GroupbuyActivityForm,
): Promise<GroupbuyActivityDetail> {
  const id = Number(input.id);
  return ctx.withTx(async (tx) => {
    await mustFindActivity(ctx, id, tx);
    await assertSkusBelongToProduct(tx, body);
    const now = ctx.clock.now();
    const moved = await repo.updateActivity(tx, id, { ...activityValues(body), updatedAt: now });
    if (!moved.won) throw new DomainError('GROUPBUY_ACTIVITY_NOT_FOUND');
    await repo.replaceActivitySkus(tx, { activityId: id, skus: skuValues(body) });
    return toDetail(ctx, await mustFindActivity(ctx, id, tx), tx);
  });
}

export async function adminActivitySetStatus(
  ctx: Ctx,
  input: { id: string },
  body: GroupbuyActivityStatusBody,
): Promise<GroupbuyActivityDetail> {
  const id = Number(input.id);
  return ctx.withTx(async (tx) => {
    const moved = await repo.setActivityStatus(tx, {
      id,
      // `ended` is terminal: an expired campaign is not re-opened, it is copied.
      from: ['draft', 'active', 'paused'],
      to: body.status,
      now: ctx.clock.now(),
    });
    if (!moved.won) {
      const existing = await repo.findActivity(tx, id);
      if (!existing) throw new DomainError('GROUPBUY_ACTIVITY_NOT_FOUND');
      throw new DomainError('GROUPBUY_ACTIVITY_NOT_OPEN', {
        details: { status: existing.status },
      });
    }
    return toDetail(ctx, await mustFindActivity(ctx, id, tx), tx);
  });
}

/**
 * Soft delete, refused while a team is still forming.
 *
 * Legacy deleted the `eb_store_combination` row outright and left every live
 * `eb_store_pink` pointing at nothing, which is why the 拼团详情 page had a
 * "活动已失效" branch that showed an empty card. Here the foreign key is
 * `ON DELETE RESTRICT` and this guard gives the operator a sentence instead of
 * a constraint error.
 */
export async function adminActivityDelete(ctx: Ctx, input: { id: string }): Promise<void> {
  const id = Number(input.id);
  await ctx.withTx(async (tx) => {
    await mustFindActivity(ctx, id, tx);
    const forming = await repo.countFormingGroups(tx, id);
    if (forming > 0) {
      throw new DomainError('GROUPBUY_ACTIVITY_IN_USE', { details: { formingGroups: forming } });
    }
    await repo.softDeleteActivity(tx, { id, now: ctx.clock.now() });
  });
}

export async function adminActivityOrders(
  ctx: Ctx,
  input: { id: string },
  query: GroupbuyActivityOrderQuery,
): Promise<Paged<GroupbuyActivityOrder>> {
  const activityId = Number(input.id);
  const { rows, total } = await repo.listActivityOrders(ctx.db, {
    activityId,
    groupStatus: query.groupStatus,
    paid: query.paid,
    ...pageBounds(query),
  });
  return {
    items: rows.map((row) => ({
      orderId: toId(row.orderId),
      orderNo: row.orderNo,
      groupId: toId(row.groupId),
      userId: toId(row.userId),
      nickname: row.nickname,
      role: row.role,
      memberStatus: row.memberStatus,
      groupStatus: row.groupStatus,
      quantity: row.quantity,
      payableAmount: row.payableAmount,
      paid: row.paid,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function adminStatistics(
  ctx: Ctx,
  query: GroupbuyStatisticsQuery,
): Promise<Paged<GroupbuyActivityStat>> {
  const { rows, total } = await repo.statistics(ctx.db, {
    activityId: query.activityId === undefined ? undefined : Number(query.activityId),
    from: query.from === undefined ? undefined : new Date(query.from),
    to: query.to === undefined ? undefined : new Date(query.to),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    ...pageBounds(query),
  });
  return {
    items: rows.map((row) => ({
      activityId: toId(row.activityId),
      title: row.title,
      status: row.status,
      groups: row.groups,
      succeededGroups: row.succeededGroups,
      failedGroups: row.failedGroups,
      formingGroups: row.formingGroups,
      paidMembers: row.paidMembers,
      paidAmount: row.paidAmount,
      refundedMembers: row.refundedMembers,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

// ---------------------------------------------------------------------------
// admin — groups
// ---------------------------------------------------------------------------

export async function adminGroupList(
  ctx: Ctx,
  query: GroupbuyGroupListQuery,
): Promise<Paged<GroupbuyGroupListItem>> {
  const { rows, total } = await repo.listGroups(ctx.db, {
    activityId: query.activityId === undefined ? undefined : Number(query.activityId),
    statuses: asArray(query.status),
    leaderUserId: query.leaderUserId === undefined ? undefined : Number(query.leaderUserId),
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    ...pageBounds(query),
  });
  return {
    items: rows.map(toGroupListItem),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function adminGroupDetail(
  ctx: Ctx,
  input: { id: string },
): Promise<GroupbuyGroupDetail> {
  const id = Number(input.id);
  const row = await repo.findGroupRow(ctx.db, id);
  if (!row) throw new DomainError('GROUPBUY_GROUP_NOT_FOUND');
  const members = await repo.listMembers(ctx.db, id);
  return { ...toGroupListItem(row), members: members.map(toMemberDto) };
}

/**
 * 立即成团.
 *
 * Gated on its own permission atom (`groupbuy:group:complete`) and on the
 * shop-wide 虚拟成团 switch: an operator may not fake a team in a shop that has
 * decided not to fake teams. Legacy's button was reachable by anyone with the
 * 拼团 menu and asked nobody.
 */
export async function adminGroupComplete(
  ctx: Ctx,
  input: { id: string },
  body: { reason?: string | undefined },
): Promise<GroupbuyGroupDetail> {
  const id = Number(input.id);
  const config = await ctx.config.get(groupbuyConfig);

  await ctx.withTx(async (tx) => {
    const group = await repo.lockGroup(tx, id);
    if (!group) throw new DomainError('GROUPBUY_GROUP_NOT_FOUND');
    assertCompletable(group);
    if (group.seatsTaken < group.seatsTotal && !config.virtualFillOnExpiry) {
      throw new DomainError('GROUPBUY_VIRTUAL_FILL_DISABLED', {
        details: { seatsTaken: group.seatsTaken, seatsTotal: group.seatsTotal },
      });
    }
    const filled = await repo.virtuallyFillAndSucceed(tx, { groupId: id, now: ctx.clock.now() });
    if (!filled.won) throw new DomainError('GROUPBUY_GROUP_NOT_COMPLETABLE');
    ctx.logger.info(
      { groupId: id, adminId: ctx.actor.id, reason: body.reason ?? null },
      'groupbuy: group completed manually',
    );
  });

  return adminGroupDetail(ctx, input);
}

// ---------------------------------------------------------------------------
// storefront
// ---------------------------------------------------------------------------

export async function list(ctx: Ctx, query: GroupbuyListQuery): Promise<Paged<GroupbuyCard>> {
  const now = ctx.clock.now();
  const { rows, total } = await repo.listActivities(ctx.db, {
    visibleAt: now,
    sortBy: 'sortOrder',
    sortOrder: 'desc',
    ...pageBounds(query),
  });
  const forming = await repo.countFormingGroupsByActivity(
    ctx.db,
    rows.map((row) => row.id),
  );
  return {
    items: rows.map((row) => toCard(row, forming.get(row.id) ?? 0, now)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** How long the 人气条 may be stale. A minute, and the strip says nothing that needs to be exact. */
const SUMMARY_CACHE_SECONDS = 60;
const SUMMARY_CACHE_KEY = 'groupbuy:summary';

/**
 * 人气条 (CR-1-h2) — 「已有 N 人参与拼团」 plus a row of faces.
 *
 * Two aggregate scans over `groupbuy_members`, on the public landing tab of a
 * marketing surface, which is the shape of request that arrives in bursts: a
 * push notification goes out and every recipient opens the same page. So the
 * answer is cached in Redis for a minute, on one key — there is no window and
 * no user in it, so there is nothing to vary by.
 *
 * **A cache failure is never a page failure.** A Redis that is down, full or
 * unreachable means the aggregates run, the error is logged at `warn`, and the
 * shopper sees the right number. The same rule `stats.cache.ts` follows, for
 * the same reason: a decorative strip must not be able to 500 the 拼团 tab.
 *
 * Nothing invalidates the key on a join. A shopper who joins a team and sees
 * the count move a minute later is not a bug; a write path that has to know
 * about a cache key in another domain is.
 */
export async function summary(ctx: Ctx): Promise<GroupbuySummary> {
  try {
    const hit = await ctx.redis.get(SUMMARY_CACHE_KEY);
    if (hit !== null) return JSON.parse(hit) as GroupbuySummary;
  } catch (error) {
    ctx.logger.warn({ err: error, key: SUMMARY_CACHE_KEY }, 'groupbuy: summary cache read failed');
  }

  const now = ctx.clock.now();
  const [participants, avatars] = await Promise.all([
    repo.countLiveParticipants(ctx.db, now),
    repo.listLiveParticipantAvatars(ctx.db, { now, limit: GROUPBUY_SUMMARY_AVATAR_LIMIT }),
  ]);
  const value: GroupbuySummary = { participants, avatars };

  try {
    await ctx.redis.set(SUMMARY_CACHE_KEY, JSON.stringify(value), 'EX', SUMMARY_CACHE_SECONDS);
  } catch (error) {
    ctx.logger.warn({ err: error, key: SUMMARY_CACHE_KEY }, 'groupbuy: summary cache write failed');
  }
  return value;
}

export async function banners(
  ctx: Ctx,
): Promise<{ items: { imageUrl: string; link: string | null }[] }> {
  const config = await ctx.config.get(groupbuyConfig);
  return { items: config.banners.map((b) => ({ imageUrl: b.imageUrl, link: b.link })) };
}

export async function detail(ctx: Ctx, input: { id: string }): Promise<GroupbuyDetail> {
  const id = Number(input.id);
  const now = ctx.clock.now();
  const activity = await repo.findActivity(ctx.db, id);
  if (!activity) throw new DomainError('GROUPBUY_ACTIVITY_NOT_FOUND');

  const [skus, forming, description] = await Promise.all([
    repo.listActivitySkus(ctx.db, [id]),
    repo.countFormingGroupsByActivity(ctx.db, [id]),
    repo.findProductDescription(ctx.db, activity.productId),
  ]);

  // A shopper who is already in a live team is offered "看看我的团" instead of
  // "开团", so the page needs to know. `null` for an anonymous visitor: "cannot
  // join" and "we do not know you" are different answers.
  const userId = ctx.actor.kind === 'user' || ctx.actor.kind === 'staff' ? ctx.actor.id : null;
  const myOpenGroupId =
    userId === null ? null : await repo.findMyOpenGroup(ctx.db, { activityId: id, userId, now });

  await repo.bumpViews(ctx.db, id);

  return {
    ...toCard(activity, forming.get(id) ?? 0, now),
    sliderImages: activity.sliderImages,
    groupTtlSeconds: activity.groupTtlSeconds,
    perOrderQuantity: activity.perOrderQuantity,
    description,
    skus: skus
      .filter((sku) => sku.isEnabled)
      .map((sku) => ({
        skuId: toId(sku.skuId),
        specText: sku.specText,
        specValues: sku.specValues,
        imageUrl: sku.imageUrl,
        price: sku.price,
        originalPrice: sku.skuOriginalPrice ?? sku.skuPrice,
        stock: sku.stock,
      })),
    myOpenGroupId: toIdOrNull(myOpenGroupId),
  };
}

export async function openGroups(
  ctx: Ctx,
  input: { id: string },
  query: PageQuery,
): Promise<Paged<GroupbuyOpenGroup>> {
  const activityId = Number(input.id);
  const activity = await repo.findActivity(ctx.db, activityId);
  if (!activity) throw new DomainError('GROUPBUY_ACTIVITY_NOT_FOUND');
  const { rows, total } = await repo.listOpenGroups(ctx.db, {
    activityId,
    now: ctx.clock.now(),
    ...pageBounds(query),
  });
  return {
    items: rows.map((row) => ({
      groupId: toId(row.id),
      leaderNickname: row.leaderNickname,
      leaderAvatarUrl: row.leaderAvatarUrl,
      seatsTotal: row.seatsTotal,
      seatsTaken: row.seatsTaken,
      seatsLeft: seatsLeft(row),
      expiresAt: row.expiresAt.toISOString(),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function groupDetail(ctx: Ctx, input: { id: string }): Promise<GroupbuyGroupView> {
  return buildGroupView(ctx, Number(input.id));
}

/**
 * 取消我发起的团 (legacy `combination/remove`).
 *
 * Only a team nobody has paid into. Once money is in, the way out is the
 * *order* — `POST /api/v1/orders/:id/cancel` for an unpaid one, an after-sale
 * for a paid one — and the membership follows through `onOrderCancelled` /
 * `onOrderRefunded`. Legacy's `removePink` deleted rows directly and left the
 * orders behind.
 */
export async function withdraw(ctx: Ctx, input: { id: string }): Promise<GroupbuyGroupView> {
  const id = Number(input.id);
  const userId = requireShopper(ctx);
  const now = ctx.clock.now();

  await ctx.withTx(async (tx) => {
    const group = await repo.lockGroup(tx, id);
    if (!group) throw new DomainError('GROUPBUY_GROUP_NOT_FOUND');
    assertWithdrawable(group, userId, now);
    const cancelled = await repo.cancelEmptyGroup(tx, { groupId: id, now });
    if (!cancelled.won) throw new DomainError('GROUPBUY_GROUP_NOT_WITHDRAWABLE');
  });

  return buildGroupView(ctx, id);
}

export async function myGroups(
  ctx: Ctx,
  query: MyGroupbuyListQuery,
): Promise<Paged<MyGroupbuyItem>> {
  const userId = requireShopper(ctx);
  const { rows, total } = await repo.listMyGroups(ctx.db, {
    userId,
    status: query.status,
    ...pageBounds(query),
  });
  return {
    items: rows.map((row) => ({
      groupId: toId(row.groupId),
      activityId: toId(row.activityId),
      title: row.activityTitle,
      imageUrl: row.activityImageUrl,
      status: row.groupStatus,
      role: row.role,
      memberStatus: row.status,
      orderId: toId(row.orderId),
      seatsTotal: row.seatsTotal,
      seatsTaken: row.seatsTaken,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/**
 * Poster **data**, not a poster.
 *
 * Legacy's `getPinkPoster` rendered a PNG server-side with GD, stored it as an
 * attachment and leaked one file per group — a cache nothing ever swept. The
 * client composes the image; the server answers with the fields and the string
 * the QR code should encode.
 */
export async function poster(ctx: Ctx, input: { id: string }): Promise<GroupbuyPoster> {
  const id = Number(input.id);
  requireShopper(ctx);
  const config = await ctx.config.get(groupbuyConfig);
  const row = await repo.findGroupRow(ctx.db, id);
  if (!row) throw new DomainError('GROUPBUY_GROUP_NOT_FOUND');
  const page = config.posterPage.replaceAll('{groupId}', String(id));
  return {
    groupId: toId(id),
    title: row.activityTitle,
    imageUrl: row.activityImageUrl,
    price: row.activityPrice,
    originalPrice: row.activityOriginalPrice,
    seatsLeft: seatsLeft(row),
    expiresAt: row.expiresAt.toISOString(),
    leaderNickname: row.leaderNickname,
    leaderAvatarUrl: row.leaderAvatarUrl,
    qrPayload: page,
    page,
  };
}

/** Re-exported so the worker's job modules do not reach past `index.ts`. */
export { settleGroup };

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

async function buildGroupView(ctx: Ctx, groupId: number): Promise<GroupbuyGroupView> {
  const row = await repo.findGroupRow(ctx.db, groupId);
  if (!row) throw new DomainError('GROUPBUY_GROUP_NOT_FOUND');
  const now = ctx.clock.now();
  const paid = await repo.listPaidMembers(ctx.db, groupId);
  const userId = ctx.actor.kind === 'user' || ctx.actor.kind === 'staff' ? ctx.actor.id : null;
  const mine = userId === null ? null : await repo.findMember(ctx.db, { groupId, userId });

  return {
    groupId: toId(groupId),
    activityId: toId(row.activityId),
    title: row.activityTitle,
    imageUrl: row.activityImageUrl,
    price: row.activityPrice,
    status: row.status,
    seatsTotal: row.seatsTotal,
    seatsTaken: row.seatsTaken,
    seatsLeft: seatsLeft(row),
    expiresAt: row.expiresAt.toISOString(),
    succeededAt: row.succeededAt?.toISOString() ?? null,
    // Paid and unrefunded only: an unpaid order is not a participant, and
    // showing one would be the "phantom member" legacy's participant list had.
    members: paid.map((member) => ({
      userId: toId(member.userId),
      nickname: member.nickname,
      avatarUrl: member.avatarUrl,
      role: member.role,
    })),
    me:
      mine === null
        ? null
        : {
            role: mine.role,
            status: mine.status,
            orderId: toId(mine.orderId),
            paid: paid.some((member) => member.id === mine.id),
          },
    canJoin: mine === null && isGroupJoinable(row, now),
  };
}

async function mustFindActivity(
  ctx: Ctx,
  id: number,
  tx?: Parameters<typeof repo.findActivity>[0],
): Promise<repo.ActivityRow> {
  const row = await repo.findActivity(tx ?? ctx.db, id);
  if (!row) throw new DomainError('GROUPBUY_ACTIVITY_NOT_FOUND');
  return row;
}

/**
 * A SKU the form names must really belong to the product. Without this an
 * operator (or a hand-crafted body) could attach a 1 元 group price to somebody
 * else's SKU and the `product_skus` join would happily serve it.
 */
async function assertSkusBelongToProduct(
  tx: Parameters<typeof repo.skuIdsOfProduct>[0],
  body: GroupbuyActivityForm,
): Promise<void> {
  if (body.skus.length === 0) return;
  const owned = new Set(await repo.skuIdsOfProduct(tx, Number(body.productId)));
  for (const sku of body.skus) {
    if (!owned.has(Number(sku.skuId))) {
      throw new DomainError('GROUPBUY_SKU_NOT_IN_ACTIVITY', { details: { skuId: sku.skuId } });
    }
  }
}

function activityValues(body: GroupbuyActivityForm) {
  return {
    productId: Number(body.productId),
    title: body.title,
    intro: body.intro ?? null,
    imageUrl: body.imageUrl ?? null,
    sliderImages: body.sliderImages,
    status: body.status,
    price: body.price,
    originalPrice: body.originalPrice ?? null,
    cost: body.cost ?? null,
    seatsRequired: body.seatsRequired,
    groupTtlSeconds: body.groupTtlSeconds,
    stock: body.stock,
    totalQuota: body.totalQuota ?? null,
    perOrderQuantity: body.perOrderQuantity,
    startAt: new Date(body.startAt),
    endAt: new Date(body.endAt),
    shippingTemplateId:
      body.shippingTemplateId === undefined ? null : Number(body.shippingTemplateId),
    sortOrder: body.sortOrder,
  };
}

function skuValues(body: GroupbuyActivityForm): repo.ActivitySkuInput[] {
  return body.skus.map((sku) => ({
    skuId: Number(sku.skuId),
    price: sku.price,
    stock: sku.stock,
    quota: sku.quota ?? null,
    isEnabled: sku.isEnabled,
  }));
}

function toListItem(row: repo.ActivityRow, formingGroups: number): GroupbuyActivityListItem {
  return {
    id: toId(row.id),
    productId: toId(row.productId),
    productName: row.productName,
    title: row.title,
    intro: row.intro,
    imageUrl: row.imageUrl,
    status: row.status,
    price: row.price,
    originalPrice: row.originalPrice,
    seatsRequired: row.seatsRequired,
    groupTtlSeconds: row.groupTtlSeconds,
    stock: row.stock,
    sales: row.sales,
    totalQuota: row.totalQuota,
    perOrderQuantity: row.perOrderQuantity,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    sortOrder: row.sortOrder,
    formingGroups,
    createdAt: row.createdAt.toISOString(),
  };
}

async function toDetail(
  ctx: Ctx,
  row: repo.ActivityRow,
  tx?: Parameters<typeof repo.listActivitySkus>[0],
): Promise<GroupbuyActivityDetail> {
  const db = tx ?? ctx.db;
  const [skus, forming] = await Promise.all([
    repo.listActivitySkus(db, [row.id]),
    repo.countFormingGroupsByActivity(db, [row.id]),
  ]);
  return {
    ...toListItem(row, forming.get(row.id) ?? 0),
    sliderImages: row.sliderImages,
    cost: row.cost,
    shippingTemplateId: toIdOrNull(row.shippingTemplateId),
    views: row.views,
    skus: skus.map((sku) => ({
      skuId: toId(sku.skuId),
      specText: sku.specText,
      price: sku.price,
      stock: sku.stock,
      sales: sku.sales,
      quota: sku.quota,
      isEnabled: sku.isEnabled,
    })),
  };
}

function toCard(row: repo.ActivityRow, formingGroups: number, now: Date): GroupbuyCard {
  return {
    activityId: toId(row.id),
    productId: toId(row.productId),
    title: row.title,
    intro: row.intro,
    imageUrl: row.imageUrl,
    price: row.price,
    originalPrice: row.originalPrice,
    seatsRequired: row.seatsRequired,
    stock: row.stock,
    sales: row.sales,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    formingGroups,
    // The server's decision, never the client's: the button is disabled by the
    // same rule the `OrderKindHandler` will enforce a moment later.
    canBuy: isActivityOpen(row, now) && row.stock > 0,
  };
}

function toGroupListItem(row: repo.GroupRow): GroupbuyGroupListItem {
  return {
    id: toId(row.id),
    activityId: toId(row.activityId),
    activityTitle: row.activityTitle,
    leaderUserId: toId(row.leaderUserId),
    leaderNickname: row.leaderNickname,
    seatsTotal: row.seatsTotal,
    seatsTaken: row.seatsTaken,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    succeededAt: row.succeededAt?.toISOString() ?? null,
    failedAt: row.failedAt?.toISOString() ?? null,
    virtuallyFilled: wasVirtuallyFilled(row, row.realMembers),
    createdAt: row.createdAt.toISOString(),
  };
}

function toMemberDto(row: repo.MemberRow): GroupbuyMember {
  return {
    id: toId(row.id),
    userId: toId(row.userId),
    orderId: toId(row.orderId),
    orderNo: row.orderNo,
    role: row.role,
    status: row.status,
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    quantity: row.quantity,
    paid: row.paid,
    joinedAt: row.createdAt.toISOString(),
    leftAt: row.leftAt?.toISOString() ?? null,
  };
}

function requireShopper(ctx: Ctx): number {
  if ((ctx.actor.kind !== 'user' && ctx.actor.kind !== 'staff') || ctx.actor.id === null) {
    throw new DomainError('UNAUTHENTICATED');
  }
  return ctx.actor.id;
}

function pageBounds(query: PageQuery): { offset: number; limit: number } {
  return { offset: (query.page - 1) * query.pageSize, limit: query.pageSize };
}

/** `status=a&status=b` reaches the service as an array; one value as a scalar. */
function asArray<T extends string>(value: T | readonly T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? [...value] : [value as T];
}

export type { GroupbuyGroupStatus };
