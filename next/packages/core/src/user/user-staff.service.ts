import type {
  NamedRef,
  StaffUserDetail,
  StaffUserGroupBody,
  StaffUserGroups,
  StaffUserLabelBody,
  StaffUserLabels,
  StaffUserListItem,
  StaffUserListQuery,
} from '@shop/contracts/user/schemas';
import type { Tx } from '@shop/db';
import { requireUserId, type Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { fromId, toId } from '../kernel/ids';
import { maskPhone, pageBounds } from './user.rules';
import * as repo from './user.repo';
import { getUserOrderStatsPort, type UserOrderStats } from './user-order-stats.port';

/**
 * 商家管理 → 用户: the six `/api/v1/staff/*` routes of CR-2-h2 §3.
 *
 * This file exists rather than a `staff: true` flag on `user-admin.service.ts`
 * because the two surfaces answer different questions about the same rows, and
 * a shared function with a mode argument is how the narrow one eventually
 * grows the wide one's fields. Nothing here reads a column the staff contract
 * does not publish — the unmasked phone never leaves `toStaffItem`, and there
 * is no staff path to `loadDetail`.
 *
 * `auth: 'staff'` is checked by `handle()` before any of this runs (B2's
 * `StaffCheck` against `order_notice_admin_uids`), so these functions assume a
 * 店员 and check no permission atom: there is no finer grain to check. What
 * they do assume is a *signed-in* one — `requireUserId` is called on every
 * write so that a route wired without the staff guard fails closed rather than
 * letting an anonymous caller relabel customers.
 */

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// customers
// ---------------------------------------------------------------------------

export async function staffList(
  ctx: Ctx,
  query: StaffUserListQuery,
): Promise<Paged<StaffUserListItem>> {
  const filters: repo.AdminListFilters = {
    keyword: query.keyword,
    keywordMatch: 'staff-narrow',
    groupId: query.groupId === undefined ? undefined : fromId(query.groupId),
    labelId: query.labelId === undefined ? undefined : fromId(query.labelId),
  };
  const [rows, total] = await Promise.all([
    repo.listUsers(ctx.db, {
      ...filters,
      ...pageBounds(query),
      // Newest first, and not configurable: the phone screen has no column
      // headers to sort by, so a `sortBy` in the query string would only be a
      // way to ask for an ordering no button can produce.
      orderBy: repo.orderBy.users.id.desc,
    }),
    repo.countUsers(ctx.db, filters),
  ]);

  const items = await decorate(ctx, rows);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function staffDetail(ctx: Ctx, params: { uid: string }): Promise<StaffUserDetail> {
  return loadStaffUser(ctx, fromId(params.uid));
}

/**
 * Groups, labels and the order stats for a page of customers, in three round
 * trips rather than three per row.
 */
async function decorate(ctx: Ctx, rows: repo.UserRow[]): Promise<StaffUserListItem[]> {
  const ids = rows.map((row) => row.id);
  const [groups, labels, stats] = await Promise.all([
    repo.loadGroupsFor(ctx.db, ids),
    repo.loadLabelsFor(ctx.db, ids),
    orderStats(ctx, ids),
  ]);
  return rows.map((row) =>
    toStaffItem(
      row,
      groups.get(row.id) ?? [],
      labels.get(row.id) ?? [],
      // `undefined` only when no port answered at all. A port that answered
      // and left this customer out is saying they have no qualifying orders,
      // which is `0` — the two must not collapse into the same `null`.
      stats === undefined ? undefined : (stats.get(row.id) ?? NO_ORDERS),
    ),
  );
}

const NO_ORDERS: UserOrderStats = { orderCount: 0, spendTotal: '0.00' };

/**
 * `undefined` when no stream has registered `UserOrderStatsPort`, which the
 * mapper turns into `null` on both numbers — see the port's own note for why
 * that is not zero and not a 500.
 */
async function orderStats(
  ctx: Ctx,
  ids: readonly number[],
): Promise<Map<number, UserOrderStats> | undefined> {
  const port = getUserOrderStatsPort();
  if (!port || ids.length === 0) return undefined;
  return port.statsFor(ctx.db, ids);
}

async function loadStaffUser(ctx: Ctx, id: number): Promise<StaffUserDetail> {
  const row = await repo.findById(ctx.db, id);
  // A soft-deleted account is gone as far as this surface is concerned: the
  // row survives so that its order history still names a buyer, not so that a
  // 店员 can relabel it.
  if (!row || row.deletedAt !== null) throw new DomainError('USER_NOT_FOUND');
  const [item] = await decorate(ctx, [row]);
  if (!item) throw new DomainError('USER_NOT_FOUND');
  return item;
}

type Ref = { id: number; name: string };

function toStaffItem(
  row: repo.UserRow,
  groups: Ref[],
  labels: Ref[],
  stats: UserOrderStats | undefined,
): StaffUserListItem {
  return {
    id: toId(row.id),
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    // The only place the phone is read on this surface, and it is masked on
    // the way out. There is no staff route that returns `row.phone`.
    phone: maskPhone(row.phone),
    status: row.status,
    groups: groups.map(toRef),
    labels: labels.map(toRef),
    orderCount: stats?.orderCount ?? null,
    spendTotal: stats?.spendTotal ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toRef(ref: Ref): NamedRef {
  return { id: toId(ref.id), name: ref.name };
}

// ---------------------------------------------------------------------------
// groups
// ---------------------------------------------------------------------------

export async function staffGroupList(ctx: Ctx): Promise<StaffUserGroups> {
  const rows = await repo.listGroups(ctx.db, {
    limit: GROUP_PICKER_LIMIT,
    offset: 0,
    orderBy: repo.orderBy.groups.sortOrder.asc,
  });
  return { items: rows.map((row) => ({ id: toId(row.id), name: row.name })) };
}

/**
 * The picker is not paginated, so it needs a ceiling that is not the table's
 * size. A shop with more than two hundred customer groups has a data-entry
 * problem the phone cannot solve; the console can still see all of them.
 */
const GROUP_PICKER_LIMIT = 200;

/**
 * 设置分组 — the customer ends up in exactly the named group, or in none.
 *
 * Written as delete-then-insert inside one transaction rather than a diff:
 * the target state is a set of at most one, so computing which memberships to
 * keep costs a read and buys nothing. The whole thing is one transaction so a
 * concurrent 设置 cannot leave the customer in two groups, which the shape of
 * the picker says is impossible.
 */
export async function staffSetGroup(
  ctx: Ctx,
  params: { uid: string },
  body: StaffUserGroupBody,
): Promise<StaffUserDetail> {
  requireUserId(ctx);
  const userId = fromId(params.uid);
  const groupId = body.groupId === null ? null : fromId(body.groupId);
  await ctx.withTx(async (tx) => {
    await assertLiveUser(tx, userId);
    if (groupId !== null) {
      const found = await repo.existingGroupIds(tx, [groupId]);
      if (found.length === 0) {
        throw new DomainError('USER_GROUP_NOT_FOUND', { details: { missing: [String(groupId)] } });
      }
    }
    await repo.removeGroupMemberships(tx, { userIds: [userId] });
    if (groupId !== null) {
      await repo.addGroupMemberships(tx, {
        userIds: [userId],
        groupIds: [groupId],
        now: ctx.clock.now(),
      });
    }
  });
  return loadStaffUser(ctx, userId);
}

// ---------------------------------------------------------------------------
// labels
// ---------------------------------------------------------------------------

/**
 * The whole label catalogue with this customer's labels flagged, grouped by
 * category in the order the console shows them.
 *
 * The drawer draws one chip per label and colours it from `assigned`, so both
 * halves have to come from one request: fetched separately they could be read
 * across a concurrent edit and the chip would lie.
 */
export async function staffLabelList(ctx: Ctx, params: { uid: string }): Promise<StaffUserLabels> {
  const userId = fromId(params.uid);
  const row = await repo.findById(ctx.db, userId);
  if (!row || row.deletedAt !== null) throw new DomainError('USER_NOT_FOUND');

  const [labels, assigned] = await Promise.all([
    repo.listLabels(ctx.db, {
      limit: LABEL_CATALOGUE_LIMIT,
      offset: 0,
      orderBy: repo.orderBy.labels.sortOrder.asc,
    }),
    repo.loadLabelsFor(ctx.db, [userId]),
  ]);
  const mine = new Set((assigned.get(userId) ?? []).map((ref) => ref.id));

  // `Map` preserves insertion order, so the categories come out in the order
  // their first label did — which is `sortOrder`, the order the console lists
  // them in. Uncategorised labels land under one `null` heading at the end
  // only if no categorised label came after them; that is cosmetic and the
  // drawer renders the heading it is given.
  const byCategory = new Map<string, StaffUserLabels['categories'][number]>();
  for (const label of labels) {
    const key = label.categoryId === null ? '' : String(label.categoryId);
    let bucket = byCategory.get(key);
    if (!bucket) {
      bucket = {
        categoryId: label.categoryId === null ? null : toId(label.categoryId),
        categoryName: label.categoryName,
        labels: [],
      };
      byCategory.set(key, bucket);
    }
    bucket.labels.push({ id: toId(label.id), name: label.name, assigned: mine.has(label.id) });
  }
  return { categories: [...byCategory.values()] };
}

/** The same ceiling as the group picker, for the same reason. */
const LABEL_CATALOGUE_LIMIT = 500;

/**
 * 设置标签 — the customer's labels become exactly this set.
 *
 * Replace rather than add, because the drawer submits the whole selection and
 * an add-only route would make 取消 a label impossible from the phone. An
 * unknown label id is a refusal, not a skip: silently dropping it is how a
 * 店员 comes away believing a customer was tagged.
 */
export async function staffSetLabels(
  ctx: Ctx,
  params: { uid: string },
  body: StaffUserLabelBody,
): Promise<StaffUserDetail> {
  requireUserId(ctx);
  const userId = fromId(params.uid);
  const labelIds = [...new Set(body.labelIds.map(fromId))];
  await ctx.withTx(async (tx) => {
    await assertLiveUser(tx, userId);
    if (labelIds.length > 0) {
      const found = await repo.existingLabelIds(tx, labelIds);
      if (found.length !== labelIds.length) {
        throw new DomainError('USER_LABEL_NOT_FOUND', {
          details: { missing: labelIds.filter((id) => !found.includes(id)).map(String) },
        });
      }
    }
    await repo.removeLabelMemberships(tx, { userIds: [userId] });
    if (labelIds.length > 0) {
      await repo.addLabelMemberships(tx, { userIds: [userId], labelIds, now: ctx.clock.now() });
    }
  });
  return loadStaffUser(ctx, userId);
}

async function assertLiveUser(tx: Tx, userId: number): Promise<void> {
  const row = await repo.findById(tx, userId);
  if (!row || row.deletedAt !== null) throw new DomainError('USER_NOT_FOUND');
}
