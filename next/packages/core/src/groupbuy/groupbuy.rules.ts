import { DomainError } from '../kernel/errors';
import { Money } from '../kernel/money';

/**
 * The group-buy decisions that need no database.
 *
 * Everything here is a pure function of values already read, so it is unit
 * tested without PostgreSQL and the integration tests can spend their time on
 * the things that genuinely race — seats, stock and leadership.
 *
 * The rule that is *not* here is "may this shopper take the last seat". That
 * one cannot be a pure function: it is a conditional `UPDATE` in the repo, and
 * writing it as a check would be the read-then-write defect CONVENTIONS names.
 */

export interface ActivityWindow {
  status: 'draft' | 'active' | 'paused' | 'ended';
  startAt: Date;
  endAt: Date;
  deletedAt?: Date | null;
}

/** Live for a shopper: published, not deleted, and inside its window. */
export function isActivityOpen(activity: ActivityWindow, now: Date): boolean {
  if (activity.deletedAt) return false;
  if (activity.status !== 'active') return false;
  return activity.startAt.getTime() <= now.getTime() && activity.endAt.getTime() > now.getTime();
}

export function assertActivityOpen(activity: ActivityWindow, now: Date): void {
  if (isActivityOpen(activity, now)) return;
  throw new DomainError('GROUPBUY_ACTIVITY_NOT_OPEN', {
    details: {
      status: activity.status,
      startAt: activity.startAt.toISOString(),
      endAt: activity.endAt.toISOString(),
      now: now.toISOString(),
    },
  });
}

/**
 * 每单限购份数.
 *
 * Legacy compared against `eb_store_combination.num` in the controller and
 * again in the service, with different operators (`>` and `>=`); one of the two
 * was wrong. Here it is one function, and `perOrderQuantity` is a ceiling on
 * the whole order, not on each line, because a group-buy order is one activity.
 */
export function assertQuantityAllowed(
  activity: { perOrderQuantity: number },
  quantity: number,
): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > activity.perOrderQuantity) {
    throw new DomainError('GROUPBUY_QUANTITY_NOT_ALLOWED', {
      details: { quantity, perOrderQuantity: activity.perOrderQuantity },
    });
  }
}

/** When a team opened now would give up. Stored, not recomputed, on the row. */
export function groupExpiresAt(now: Date, ttlSeconds: number): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}

export interface GroupShape {
  status: 'forming' | 'succeeded' | 'failed' | 'cancelled';
  seatsTotal: number;
  seatsTaken: number;
  expiresAt: Date;
}

export function seatsLeft(group: GroupShape): number {
  return Math.max(0, group.seatsTotal - group.seatsTaken);
}

/**
 * Whether the storefront should *offer* this team.
 *
 * Advisory only. The seat is still taken by a conditional `UPDATE` when the
 * order is paid, and between this answer and that statement the team can fill —
 * which is exactly the race `takeSeat` is built to lose safely.
 */
export function isGroupJoinable(group: GroupShape, now: Date): boolean {
  return (
    group.status === 'forming' &&
    group.expiresAt.getTime() > now.getTime() &&
    group.seatsTaken < group.seatsTotal
  );
}

export function assertGroupJoinable(group: GroupShape, now: Date): void {
  if (isGroupJoinable(group, now)) return;
  throw new DomainError('GROUPBUY_GROUP_NOT_JOINABLE', {
    details: {
      status: group.status,
      seatsTaken: group.seatsTaken,
      seatsTotal: group.seatsTotal,
      expiresAt: group.expiresAt.toISOString(),
    },
  });
}

/**
 * A succeeded team with fewer real members than seats was completed by
 * 虚拟成团 — either the expiry sweep with `virtualFillOnExpiry` on, or an
 * operator pressing 立即成团. There is no flag for it; the two counters are the
 * evidence, and they cannot drift out of agreement with themselves.
 */
export function wasVirtuallyFilled(
  group: { status: string; seatsTotal: number },
  realMembers: number,
): boolean {
  return group.status === 'succeeded' && realMembers < group.seatsTotal;
}

/**
 * 取消我发起的团 (legacy `combination/remove`).
 *
 * Only the leader, only while forming, and only while nobody has paid into it —
 * `seatsTaken === 0` means even the leader's own order is unpaid. A team with a
 * paid member is unwound by cancelling or refunding the *order*, never by this
 * route, because money is involved and this route moves none.
 */
export function assertWithdrawable(
  group: GroupShape & { leaderUserId: number },
  userId: number,
  now: Date,
): void {
  const ok =
    group.leaderUserId === userId &&
    group.status === 'forming' &&
    group.seatsTaken === 0 &&
    group.expiresAt.getTime() > now.getTime();
  if (ok) return;
  throw new DomainError('GROUPBUY_GROUP_NOT_WITHDRAWABLE', {
    details: {
      status: group.status,
      seatsTaken: group.seatsTaken,
      isLeader: group.leaderUserId === userId,
    },
  });
}

/** 立即成团: an operator may only complete a team that is forming and has somebody in it. */
export function assertCompletable(group: GroupShape): void {
  if (group.status === 'forming' && group.seatsTaken >= 1) return;
  throw new DomainError('GROUPBUY_GROUP_NOT_COMPLETABLE', {
    details: { status: group.status, seatsTaken: group.seatsTaken },
  });
}

// ---------------------------------------------------------------------------
// price — the CR-1-d guard
// ---------------------------------------------------------------------------

export interface PricedLine {
  skuId: number;
  quantity: number;
}

/**
 * What the goods on a group-buy order *should* cost: the activity's per-SKU
 * price times the quantity, summed.
 *
 * `prices` is the activity's SKU table; a line whose SKU is not in it is not
 * part of the activity and is refused before any arithmetic happens.
 */
export function expectedGoodsTotal(
  lines: readonly PricedLine[],
  prices: ReadonlyMap<number, string>,
): Money {
  let total = Money.ZERO;
  for (const line of lines) {
    const price = prices.get(line.skuId);
    if (price === undefined) {
      throw new DomainError('GROUPBUY_SKU_NOT_IN_ACTIVITY', { details: { skuId: line.skuId } });
    }
    total = total.add(Money.parse(price).mul(line.quantity));
  }
  return total;
}

/**
 * The fail-closed half of CR-1-d.
 *
 * B1's `buildDraft` does not pass `kindMeta` into the pricing `selections`, so
 * the `PricingContributor` cannot know which activity is being bought and the
 * draft arrives at the ordinary SKU price. Rather than sell at that price, the
 * kind handler recomputes the activity total and refuses when the draft does
 * not match.
 *
 * When CR-1-d lands the contributor fires, the two agree, and this becomes a
 * silent assertion. It stays either way: an activity price that fails to reach
 * the order is a pricing bug whichever layer causes it.
 */
export function assertActivityPriceApplied(args: {
  expected: Money;
  actual: Money;
  activityId: number;
}): void {
  if (args.expected.eq(args.actual)) return;
  throw new DomainError('GROUPBUY_PRICE_NOT_APPLIED', {
    details: {
      activityId: String(args.activityId),
      expected: args.expected.toString(),
      actual: args.actual.toString(),
    },
  });
}
