import type {
  AdminOrderDetail,
  AdminOrderListItem,
  AdminOrderListQuery,
  OrderAddressBody,
  OrderPriceBody,
  OrderRemarkBody,
  OrderTimeline,
  Shipment,
  ShipBody,
  ShipmentTracking,
  StaffIdentity,
  StaffOrderDetail,
  StaffOrderListItem,
  StaffOrderListQuery,
  StaffRefundRemarkBody,
  StaffRefundReviewBody,
  StaffStatistics,
  StaffStatisticsSeries,
  StaffStatisticsSeriesQuery,
} from '@shop/contracts/order/order.fulfil.schemas';
import { STAFF_STATISTICS_MAX_DAYS } from '@shop/contracts/order/order.fulfil.schemas';
import type {
  AdminRefundDetail,
  AdminRefundListItem,
  AdminRefundListQuery,
} from '@shop/contracts/refund/schemas';
import type { DbOrTx } from '@shop/db';

type PagedAdminRefunds = {
  items: AdminRefundListItem[];
  total: number;
  page: number;
  pageSize: number;
};
import { registerStaffCheck } from '../auth/user-lookup';
import { loadGroup } from '../kernel/config.repo';
import { requireActorId, type Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { fromId, toId } from '../kernel/ids';
import { Money } from '../kernel/money';
import * as consoleService from './order.console.service';
import { orderStaffConfig } from './order.fulfil.config';
import * as fulfilRepo from './order.fulfil.repo';
import { resolveStaffRefundPort } from './order.fulfil.ports';
import * as fulfil from './order.fulfil.service';
import * as repo from './order.repo';

/**
 * 移动端商家管理 — the phone console.
 *
 * Almost every function here is the web console's function with two columns
 * taken off. That is deliberate: two implementations of 备注/改价/发货, one per
 * surface, drift apart — a phone 改价 that forgets to re-split the line
 * discounts is the typical result. One implementation, two surfaces, and the
 * timeline records which one acted through `operator_kind`.
 *
 * What the phone deliberately does *not* get:
 *
 *  - `costAmount` and the margin it implies;
 *  - the soft-delete column and 删除订单 altogether;
 *  - 改价, unless `order-staff.allowStaffRepricing` is on (off by default);
 *  - 售后 同意 / 拒绝, unless `order-staff.allowStaffRefundReview` is on (off
 *    by default).
 */

// ---------------------------------------------------------------------------
// who is staff
// ---------------------------------------------------------------------------

/**
 * `auth: 'staff'` fails closed until this runs, which is why it runs on import
 * of the order domain's `index.ts` rather than from a bootstrap file somebody
 * could forget.
 *
 * The list is read straight from `config_values` rather than through
 * `ConfigService`, because `StaffCheck` is handed a `db` and nothing else —
 * `handle()` performs this check before a `Ctx` exists. One indexed read per
 * staff request; the group has at most 200 ids in it.
 */
export function installStaffCheck(): void {
  registerStaffCheck({
    async isStaff(db: DbOrTx, userId: number): Promise<boolean> {
      return (await staffUserIds(db)).includes(userId);
    },
  });
}

async function staffUserIds(db: DbOrTx): Promise<number[]> {
  const rows = await loadGroup(db, orderStaffConfig.group);
  const raw: Record<string, unknown> = {};
  for (const row of rows) raw[row.key] = row.value;
  const parsed = orderStaffConfig.schema.safeParse(raw);
  // An unparseable group must close the console, not open it.
  return parsed.success ? parsed.data.staffUserIds : [];
}

/** `GET /api/v1/staff/me` — `auth: 'user'`, so an ordinary shopper gets `false`, not a 403. */
export async function me(ctx: Ctx): Promise<StaffIdentity> {
  const userId = requireActorId(ctx);
  const ids = await staffUserIds(ctx.db);
  const [brief] = await fulfilRepo.listUserBriefs(ctx.db, [userId]);
  const isStaff = ids.includes(userId);
  // The phone shows 退款审核 / 改价 only when the route behind them would let
  // it through.
  const { allowStaffRefundReview, allowStaffRepricing } = await ctx.config.get(orderStaffConfig);
  return {
    isStaff,
    userId: toId(userId),
    nickname: brief?.nickname ?? null,
    abilities: {
      refundReview: isStaff && allowStaffRefundReview,
      adjustPrice: isStaff && allowStaffRepricing,
    },
  };
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

const stripListItem = (item: AdminOrderListItem): StaffOrderListItem => {
  const { deletedAt: _deletedAt, ...rest } = item;
  return rest;
};

// ---------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------

/**
 * The shop keeps one clock, and it is not the host's.
 *
 * Every day boundary below is a wall-clock day in Asia/Shanghai. The offset is
 * written out as a literal because Asia/Shanghai has had no DST since 1991, so
 * `2026-02-01T00:00:00+08:00` is exact and needs no zone database at run time;
 * the formatter, which does consult one, is the only place a future rule
 * change would have to be reflected.
 */
const SHOP_TZ_OFFSET = '+08:00';
const DAY_MS = 86_400_000;
/** What the 统计明细 page opens on when the operator has picked nothing. */
const DEFAULT_SERIES_DAYS = 30;

const shopDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `2026-02-01T17:00:00Z` -> `'2026-02-02'`, the day the shop was living in. */
const shopDayOf = (at: Date): string => shopDayFormatter.format(at);
const startOfShopDay = (day: string): Date => new Date(`${day}T00:00:00${SHOP_TZ_OFFSET}`);
const shiftShopDay = (day: string, days: number): string =>
  shopDayOf(new Date(startOfShopDay(day).getTime() + days * DAY_MS));
/** Inclusive at both ends: 1 日 to 7 日 is seven days, which is what the picker means. */
const shopDaysBetween = (from: string, to: string): number =>
  Math.round((startOfShopDay(to).getTime() - startOfShopDay(from).getTime()) / DAY_MS) + 1;

/**
 * `sum()` over numeric comes back unpadded (`"0"`, `"5320.5"`); the wire wants
 * two fraction digits and `Money` is the one thing that guarantees them.
 */
const money = (value: string): string => {
  const [whole = '0', fraction = ''] = value.split('.');
  return Money.parse(`${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`).toString();
};

export async function statistics(ctx: Ctx): Promise<StaffStatistics> {
  const now = ctx.clock.now();
  const startOfDay = (offsetDays: number): Date => {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + offsetDays);
    return day;
  };
  const today = startOfDay(0);
  const tomorrow = startOfDay(1);
  const yesterday = startOfDay(-1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [queue, todayTotals, yesterdayTotals, monthTotals] = await Promise.all([
    fulfilRepo.workQueueCounts(ctx.db),
    fulfilRepo.rangeTotals(ctx.db, { from: today, to: tomorrow }),
    fulfilRepo.rangeTotals(ctx.db, { from: yesterday, to: today }),
    fulfilRepo.rangeTotals(ctx.db, { from: monthStart, to: tomorrow }),
  ]);

  return {
    pendingShipment: queue.pendingShipment,
    pendingReceipt: queue.pendingReceipt,
    refunding: queue.refunding,
    today: { orderCount: todayTotals.orderCount, paidAmount: money(todayTotals.paidAmount) },
    yesterday: {
      orderCount: yesterdayTotals.orderCount,
      paidAmount: money(yesterdayTotals.paidAmount),
    },
    month: { orderCount: monthTotals.orderCount, paidAmount: money(monthTotals.paidAmount) },
  };
}

/**
 * 统计明细 — the same window as the header, one row per day.
 *
 * Three things are decided here rather than in the page:
 *
 *  - **The window.** Both ends are inclusive Asia/Shanghai days, defaulting to
 *    the last 30. Pickers that come back the wrong way round are swapped, not
 *    refused — that is a slip, not a bad request.
 *  - **The cap.** Wider than `STAFF_STATISTICS_MAX_DAYS` is refused rather than
 *    silently shortened: a chart that quietly covers less than its axis says is
 *    worse than an error toast.
 *  - **The gaps.** Days with no orders come back as explicit zero rows, so the
 *    chart's x-axis is evenly spaced and the 详细数据 table has no holes.
 */
export async function statisticsSeries(
  ctx: Ctx,
  query: StaffStatisticsSeriesQuery,
): Promise<StaffStatisticsSeries> {
  const today = shopDayOf(ctx.clock.now());
  const requestedTo = query.to ?? today;
  const requestedFrom = query.from ?? shiftShopDay(requestedTo, -(DEFAULT_SERIES_DAYS - 1));
  const [from, to] =
    requestedFrom <= requestedTo ? [requestedFrom, requestedTo] : [requestedTo, requestedFrom];

  const span = shopDaysBetween(from, to);
  if (span > STAFF_STATISTICS_MAX_DAYS) {
    throw new DomainError('ORDER_STATISTICS_RANGE_TOO_WIDE', {
      details: { maximumDays: STAFF_STATISTICS_MAX_DAYS, requestedDays: span },
    });
  }

  // Half-open on the instant axis: `[00:00 of from, 00:00 of the day after to)`.
  const rows = await fulfilRepo.dailyTotals(ctx.db, {
    from: startOfShopDay(from),
    to: startOfShopDay(shiftShopDay(to, 1)),
  });
  const byDate = new Map(rows.map((row) => [row.date, row]));

  const items = Array.from({ length: span }, (_unused, offset) => {
    const date = shiftShopDay(from, offset);
    const row = byDate.get(date);
    return {
      date,
      orderCount: row?.orderCount ?? 0,
      paidOrderCount: row?.paidOrderCount ?? 0,
      paidAmount: money(row?.paidAmount ?? '0'),
    };
  });

  return { granularity: 'day', from, to, items };
}

export async function orderList(
  ctx: Ctx,
  query: StaffOrderListQuery,
): Promise<{ items: StaffOrderListItem[]; total: number; page: number; pageSize: number }> {
  // The phone never sees the archive, so `deleted` is forced off rather than
  // being a query key a client could set.
  const page = await consoleService.adminList(ctx, {
    ...query,
    deleted: false,
  } as AdminOrderListQuery);
  return { ...page, items: page.items.map(stripListItem) };
}

export async function orderDetail(ctx: Ctx, params: { id: string }): Promise<StaffOrderDetail> {
  return strip(await consoleService.adminDetail(ctx, params));
}

function strip(detail: AdminOrderDetail): StaffOrderDetail {
  const { deletedAt: _deletedAt, costAmount: _costAmount, ...rest } = detail;
  return rest;
}

export async function orderTimeline(ctx: Ctx, params: { id: string }): Promise<OrderTimeline> {
  await requireLiveOrder(ctx, params.id);
  return consoleService.adminTimeline(ctx, params);
}

/** A soft-deleted order does not exist as far as the phone is concerned. */
async function requireLiveOrder(ctx: Ctx, id: string): Promise<void> {
  const row = await repo.findOrder(ctx.db, fromId(id));
  if (!row || row.deletedAt !== null) throw new DomainError('ORDER_NOT_FOUND');
}

// ---------------------------------------------------------------------------
// writes
// ---------------------------------------------------------------------------

export async function remark(
  ctx: Ctx,
  params: { id: string },
  body: OrderRemarkBody,
): Promise<StaffOrderDetail> {
  await requireLiveOrder(ctx, params.id);
  return strip(await consoleService.adminRemark(ctx, params, body));
}

/** Off by default. A shop that wants it turns `allowStaffRepricing` on. */
export async function adjustPrice(
  ctx: Ctx,
  params: { id: string },
  body: OrderPriceBody,
): Promise<StaffOrderDetail> {
  const { allowStaffRepricing } = await ctx.config.get(orderStaffConfig);
  if (!allowStaffRepricing) {
    throw new DomainError('FORBIDDEN', { details: { reason: '店员改价未开启' } });
  }
  await requireLiveOrder(ctx, params.id);
  return strip(await consoleService.adminAdjustPrice(ctx, params, body));
}

export async function updateAddress(
  ctx: Ctx,
  params: { id: string },
  body: OrderAddressBody,
): Promise<StaffOrderDetail> {
  await requireLiveOrder(ctx, params.id);
  return strip(await consoleService.adminUpdateAddress(ctx, params, body));
}

export async function shipments(ctx: Ctx, params: { id: string }): Promise<{ items: Shipment[] }> {
  await requireLiveOrder(ctx, params.id);
  return { items: await fulfil.shipmentsOfOrder(ctx, fromId(params.id)) };
}

export async function ship(ctx: Ctx, params: { id: string }, body: ShipBody): Promise<Shipment> {
  return fulfil.shipOrder(ctx, {
    orderId: fromId(params.id),
    body,
    operatorUserId: requireActorId(ctx),
  });
}

export async function shipmentTracking(
  ctx: Ctx,
  params: { id: string },
): Promise<ShipmentTracking> {
  // No owner check: a staff member is allowed to look at any parcel the shop
  // sent, which is the whole point of the console.
  return fulfil.trackShipment(ctx, params);
}

// 快递公司 for the staff console: the `shipping` domain answers it.

// ---------------------------------------------------------------------------
// after-sales, forwarded to the refund domain
// ---------------------------------------------------------------------------

/**
 * Fulfilment owns the surface, the refund domain owns the money.
 *
 * Every one of these is a straight forward to `refund`'s own service through
 * the `StaffRefundPort` — its staff entry points, which accept only a `staff`
 * actor and share the transition code with the web after-sales screen — so this
 * file contains no code that touches a gateway, a `refunds` row or
 * `orders.refunded_amount`.
 *
 * If the refund domain has not registered the port, the routes answer
 * `INTERNAL` rather than pretending: a phone that silently shows an empty
 * after-sales list is worse than one that says the feature is not wired up.
 */
function refundPort(): NonNullable<ReturnType<typeof resolveStaffRefundPort>> {
  const port = resolveStaffRefundPort();
  if (!port) {
    throw new DomainError('INTERNAL', { details: { reason: '售后服务尚未接入' } });
  }
  return port;
}

export async function refundList(
  ctx: Ctx,
  query: AdminRefundListQuery,
): Promise<PagedAdminRefunds> {
  return refundPort().list(ctx, query);
}

export async function refundDetail(ctx: Ctx, params: { id: string }): Promise<AdminRefundDetail> {
  return refundPort().detail(ctx, params);
}

export async function refundReview(
  ctx: Ctx,
  params: { id: string },
  body: StaffRefundReviewBody,
): Promise<AdminRefundDetail> {
  const port = refundPort();
  // A decision, and for a 仅退款 an approval sends the money, so the shop opts
  // in, the way it does for 改价. Said with a reason, so the phone shows "not
  // enabled" rather than something that reads like a broken account.
  const { allowStaffRefundReview } = await ctx.config.get(orderStaffConfig);
  if (!allowStaffRefundReview) {
    throw new DomainError('FORBIDDEN', { details: { reason: '店员审核售后未开启' } });
  }
  if (body.decision === 'approve') {
    return port.approve(ctx, params, body.reason === undefined ? {} : { remark: body.reason });
  }
  // `refunds_rejected_needs_reason` is a CHECK; saying so here means the
  // operator is told in the form rather than by a 500.
  if (body.reason === undefined || body.reason.trim().length === 0) {
    throw new DomainError('VALIDATION_FAILED', {
      details: [{ field: 'reason', message: '拒绝退款需要填写原因' }],
    });
  }
  return port.reject(ctx, params, { rejectReason: body.reason });
}

/**
 * 售后备注.
 *
 * A note, not a decision: the refund's status is untouched and nothing is
 * overwritten. The refund domain appends it to `refund_logs`, which is also
 * where it comes back from — the detail's `logs` array.
 */
export async function refundRemark(
  ctx: Ctx,
  params: { id: string },
  body: StaffRefundRemarkBody,
): Promise<AdminRefundDetail> {
  return refundPort().remark(ctx, params, body);
}
