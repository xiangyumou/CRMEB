// 商家管理（店员端）DTOs → the legacy admin view models.
//
// Contract: next/packages/contracts/src/order/order.staff.contract.ts
//
// The staff pages use a *different* `_status` from the storefront ones, and both names
// survive here because both are read by pages this stream does not rewrite:
//
//   * the 订单列表 row reads `_status` as an **integer** (the old
//     `StoreOrderPresentationServices::tidyOrder` scale: 1 未支付, 2 待发货, 3 退款中,
//     4 待收货, 5 待评价, 6 已完成, 7 已退款, 8 部分发货);
//   * the 订单详情 reads `_status` as the storefront **object** (`{_type, _title}`),
//     because that page is shared with the shopper's detail component.
//
// Split shipment (`_status` 9/10/11) cannot occur: B2 removed order splitting, so the
// parent/child cascade those three values described has no successor.

import { toId, toInt, money, moneyNumber, text, list, mapList, unixSeconds } from './_shared.js';
import {
  toLegacyOrderListItem,
  toLegacyOrderDetail,
  toLegacyOrderItem,
  toLegacyStatus,
} from './order.js';
import { toLegacyRefund } from './refund.js';
import { toLegacyShipment } from './fulfil.js';

// ---------------------------------------------------------------------------
// 店员身份 / 统计
// ---------------------------------------------------------------------------

/** `GET /api/v1/staff/me` → the 商家管理 entry's visibility flag. */
export function toLegacyStaffIdentity(dto) {
  if (!dto) return { is_staff: 0, uid: 0, nickname: '' };
  return {
    is_staff: dto.isStaff ? 1 : 0,
    uid: dto.userId === null || dto.userId === undefined ? 0 : toId(dto.userId),
    nickname: text(dto.nickname),
  };
}

/** `GET /api/v1/staff/statistics` → the 首页 counters (`census`). */
export function toLegacyStaffStatistics(dto) {
  if (!dto) {
    return {
      todayPrice: '0.00',
      proPrice: '0.00',
      monthPrice: '0.00',
      todayCount: 0,
      proCount: 0,
      monthCount: 0,
      unshipped_count: 0,
      received_count: 0,
      refund_count: 0,
    };
  }
  const today = dto.today || {};
  const yesterday = dto.yesterday || {};
  const month = dto.month || {};
  return {
    todayPrice: money(today.paidAmount),
    proPrice: money(yesterday.paidAmount),
    monthPrice: money(month.paidAmount),
    todayCount: toInt(today.orderCount, 0),
    proCount: toInt(yesterday.orderCount, 0),
    monthCount: toInt(month.orderCount, 0),
    // The three work-queue counters the (commented-out) tab strip reads.
    unshipped_count: toInt(dto.pendingShipment, 0),
    received_count: toInt(dto.pendingReceipt, 0),
    refund_count: toInt(dto.refunding, 0),
    // Retired figures: the phone never showed margin, and 待付款/待评价 are not counted.
    unpaid_count: 0,
    evaluated_count: 0,
  };
}

// ---------------------------------------------------------------------------
// 统计明细 (CR-4-h §1)
// ---------------------------------------------------------------------------
//
// `GET /api/v1/staff/statistics/series` answers one row per Asia/Shanghai day, and the
// two legacy endpoints that fed 统计明细 (`admin/order/statistics` for the table,
// `admin/order/time` for the chart) are both derived from it here. They used to count
// differently and could disagree about the same day; now they cannot.
//
// The pages still speak in **epoch seconds**, so the conversion lives here. Every
// function below is pure: the phone's own clock and timezone never enter, because a
// Shanghai shop's 今天 is not the day a phone roaming in Berlin thinks it is.

const SHOP_TZ_OFFSET_SECONDS = 8 * 3600;
const DAY_MS = 86400000;

/** Epoch seconds → the shop's calendar day (`YYYY-MM-DD`). `''` when there is no bound. */
export function shopDayFromUnix(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return '';
  return new Date((Math.trunc(n) + SHOP_TZ_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

/** `'2026-06-01'` + `-1` → `'2026-05-31'`. Calendar arithmetic, no timezone involved. */
export function shiftShopDay(day, days) {
  if (typeof day !== 'string' || day === '') return '';
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * `{start, stop}` (epoch seconds) → the series query.
 *
 * An absent end is left out rather than guessed, so the *server's* idea of 今天 fills
 * it in — the only clock that agrees with the numbers in the header.
 */
export function fromLegacyStatisticsRange(where) {
  const src = where || {};
  const query = { granularity: 'day' };
  const from = shopDayFromUnix(src.start);
  const to = shopDayFromUnix(src.stop);
  if (from) query.from = from;
  if (to) query.to = to;
  return query;
}

/**
 * The window immediately before the one the series came back with, same length.
 *
 * This is legacy's 同比上个时间区间 (`StoreOrderController::time` computed `$front =
 * $start - ($stop - $start)`), and it is derived from the **response** rather than from
 * the request because the request may have named neither end.
 */
export function precedingStatisticsRange(dto) {
  const from = dto && typeof dto.from === 'string' ? dto.from : '';
  const to = dto && typeof dto.to === 'string' ? dto.to : '';
  if (!from || !to) return { granularity: 'day' };
  const span =
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  return { granularity: 'day', from: shiftShopDay(from, -span), to: shiftShopDay(from, -1) };
}

/**
 * The 详细数据 table: `[{time, count, price}]`, newest day first.
 *
 * Two deliberate differences from the raw series. Days with no orders are dropped —
 * legacy's `GROUP BY` never produced them and a table of zeroes is noise — and the page
 * number is applied here rather than by the server, because the whole window is at most
 * 92 rows and paging it server-side would mean a request per scroll.
 */
export function toLegacyStatisticsRows(dto, where) {
  const src = where || {};
  const page = toInt(src.page, 1) || 1;
  const limit = toInt(src.limit, 15) || 15;
  const busy = list(dto && dto.items)
    .filter((item) => toInt(item.orderCount, 0) > 0)
    .reverse();
  return busy.slice((page - 1) * limit, page * limit).map((item) => ({
    // Legacy formatted the label as `%m-%d`; the full date is one field over.
    time: String(item.date || '').slice(5),
    date: text(item.date),
    count: toInt(item.orderCount, 0),
    price: money(item.paidAmount),
  }));
}

/**
 * The chart above the table: `{chart, time, growth_rate, increase_time,
 * increase_time_status}`.
 *
 * `type` is legacy's 1 = 营业额, 2 = 订单量. The growth figures compare the window with
 * the one immediately before it, exactly as `StoreOrderController::time` did, including
 * its rule for a previous window of zero — a rise from nothing has no percentage, so the
 * absolute increase is shown as one.
 */
export function toLegacyStatisticsChart(dto, previous, type) {
  const isPrice = toInt(type, 1) !== 2;
  const total = (source) =>
    list(source && source.items).reduce(
      (sum, item) => sum + (isPrice ? moneyNumber(item.paidAmount) : toInt(item.orderCount, 0)),
      0,
    );

  const current = total(dto);
  const before = total(previous);
  const increase = isPrice ? Math.round((current - before) * 100) / 100 : current - before;
  const magnitude = Math.abs(increase);
  const growthRate =
    magnitude === 0
      ? 0
      : before === 0
        ? Math.round(magnitude * 100)
        : Math.round((magnitude / before) * 100);

  return {
    chart: list(dto && dto.items).map((item) => ({
      time: text(item.date),
      num: isPrice ? money(item.paidAmount) : toInt(item.orderCount, 0),
    })),
    time: isPrice ? current.toFixed(2) : current,
    growth_rate: growthRate,
    increase_time: isPrice ? magnitude.toFixed(2) : magnitude,
    increase_time_status: increase >= 0 ? 1 : 2,
  };
}

// ---------------------------------------------------------------------------
// 订单
// ---------------------------------------------------------------------------

/** The integer `_status` the 订单列表 branches on. */
export function legacyStaffStatus(dto) {
  if (!dto) return 1;
  if (dto.status === 'pending_payment' || dto.status === 'cancelled') return 1;
  if (dto.refundStatus === 'requested') return 3;
  if (dto.refundStatus === 'refunded' || dto.refundStatus === 'partially_refunded') return 7;
  if (dto.status === 'paid') return dto.fulfillmentStatus === 'partially_fulfilled' ? 8 : 2;
  if (dto.status === 'shipped') return 4;
  if (dto.status === 'received') return 5;
  if (dto.status === 'completed') return 6;
  return 2;
}

const STAFF_STATUS_NAME = {
  1: '未支付',
  2: '未发货',
  3: '退款中',
  4: '待收货',
  5: '待评价',
  6: '已完成',
  7: '已退款',
  8: '部分发货',
};

/** `status_name` is an object in the old payload: `{status_name, pics}`. */
export function toLegacyStaffStatusName(dto) {
  const code = legacyStaffStatus(dto);
  const cancelled = dto && dto.status === 'cancelled';
  return {
    status_name: cancelled ? '已取消' : STAFF_STATUS_NAME[code] || '未知状态',
    pics: dto && dto.refundStatus === 'requested' ? list(dto.refundImages) : [],
  };
}

/** Flags for the staff UI branches the rewrite dropped. */
const RETIRED_STAFF_FLAGS = {
  // 门店自提 is retired, so every order is 快递配送 (`shipping_type` 1).
  shipping_type: 1,
  pink_id: 0,
  pinkStatus: 0,
  combination_id: 0,
  advance_id: 0,
  seckill_id: 0,
  bargain_id: 0,
  is_gift: 0,
  store_id: 0,
  use_integral: 0,
  deduction_price: '0.00',
  yue_price: '0.00',
  channel_price: '0.00',
  vip_true_price: '0.00',
  fictitious_content: '',
  virtual_info: '',
  promotions_detail: [],
  give_coupon: [],
  give_integral: 0,
  split: [],
};

function payTypeName(dto) {
  return dto && dto.status !== 'pending_payment' && dto.status !== 'cancelled' ? '微信支付' : '';
}

/** `staffOrderListItem` → one 商家订单列表 row. */
export function toLegacyStaffOrderListItem(dto) {
  if (!dto) return {};
  const base = toLegacyOrderListItem(dto);
  const items = list(dto.items);
  const user = dto.user || {};
  return Object.assign({}, base, RETIRED_STAFF_FLAGS, {
    // The staff console routes on `order_id` against `/api/v1/staff/orders/:id`,
    // which is **not** widened by CR-1-h — a staff member sees every shop order,
    // so the order-number lookup's "scoped to the owner" rule has nothing to
    // scope to. The shopper's mapper puts the number here; staff get the id back.
    order_id: base.id === 0 ? '' : String(base.id),
    _status: legacyStaffStatus(dto),
    status_name: toLegacyStaffStatusName(dto),
    // 商品预览：the row renders `_info[].cart_info`, and `cart_id.length > 1` decides
    // whether it scrolls horizontally.
    _info: base.cartInfo.map((cart) => ({ cart_info: cart })),
    cart_id: items.map((item) => toId(item && item.id)),
    product_type: 0,
    delivery_type: dto.fulfillmentStatus === 'unfulfilled' ? '' : 'express',
    pay_type: dto.status === 'pending_payment' || dto.status === 'cancelled' ? '' : 'weixin',
    pay_type_name: payTypeName(dto),
    stop_time: unixSeconds(dto.payExpiresAt, 0),
    refund: dto.refundStatus === 'requested' ? [{ id: toId(dto.id) }] : [],
    refund_price: money(dto.refundedAmount),
    remark: text(dto.adminRemark),
    mark: text(dto.buyerRemark),
    uid: user.id === undefined ? 0 : toId(user.id),
    nickname: text(user.nickname),
    avatar: text(user.avatarUrl),
    phone: text(user.phone),
    is_invoice: dto.invoiceStatus === 'issued' ? 1 : 0,
    invoice_status: text(dto.invoiceStatus),
  });
}

/** The 商家订单列表 pages through a bare array (`res.data.length < limit` stops them). */
export function toLegacyStaffOrderList(dto) {
  return mapList(dto && dto.items, toLegacyStaffOrderListItem);
}

/**
 * `staffOrderDetail` → the 订单详情 payload.
 *
 * `_status` is the **object** form here, because the detail page and its components are
 * shared with the shopper's 订单详情.
 */
export function toLegacyStaffOrderDetail(dto) {
  if (!dto) return {};
  const row = toLegacyStaffOrderListItem(dto);
  const detail = toLegacyOrderDetail(dto);
  const parcels = mapList(dto.shipments, toLegacyShipment);
  const latest = parcels.length ? parcels[parcels.length - 1] : null;
  return Object.assign({}, row, detail, {
    // `detail` is the shopper's mapper, which puts the order *number* in
    // `order_id`; the staff routes take the id. See the list mapper above.
    order_id: row.order_id,
    _status: toLegacyStatus(dto),
    _staff_status: legacyStaffStatus(dto),
    status_name: row.status_name,
    _info: row._info,
    cart_id: row.cart_id,
    remark: text(dto.adminRemark),
    mark: text(dto.buyerRemark),
    uid: row.uid,
    nickname: row.nickname,
    avatar: row.avatar,
    phone: row.phone,
    shipments: parcels,
    delivery_type: latest ? latest.delivery_type : detail.delivery_type,
    delivery_id: latest ? latest.delivery_id : '',
    delivery_name: latest ? latest.delivery_name : '',
    refund_ids: mapList(dto.refundIds, (id) => text(id)),
    // 拆单 is gone; the pages guard on `split.length`, so an empty list disables it.
    split: [],
    cartInfo: mapList(dto.items, toLegacyOrderItem),
  });
}

/** `GET /api/v1/staff/orders/:id/status-logs` → the 订单记录 timeline. */
export function toLegacyOrderTimeline(dto) {
  return mapList(dto && dto.items, (entry) => ({
    id: toId(entry.id),
    change_type: text(entry.changeType),
    change_message: text(entry.message),
    status: text(entry.toStatus),
    oid: 0,
    operator: text(entry.operatorName),
    operator_kind: text(entry.operatorKind),
    add_time: unixSeconds(entry.createdAt, 0),
  }));
}

/** Legacy 订单列表 filters → `GET /api/v1/staff/orders` query. */
const STAFF_TAB = {
  0: { status: 'pending_payment' },
  1: { status: 'paid', fulfillmentStatus: 'unfulfilled' },
  2: { status: 'shipped' },
  3: { status: 'received' },
  4: { status: 'completed' },
};

export function fromLegacyStaffOrderQuery(where) {
  const src = where || {};
  const query = {};
  if (src.page !== undefined) query.page = toInt(src.page, 1);
  if (src.limit !== undefined) query.pageSize = toInt(src.limit, 20);
  const raw = src.status === undefined || src.status === null ? '' : String(src.status);
  const preset = STAFF_TAB[raw];
  if (preset) Object.assign(query, preset);
  if (src.keyword) query.keyword = String(src.keyword);
  const range = parseLocaleRange(src.data);
  if (range) {
    query.createdFrom = range.from;
    query.createdTo = range.to;
  }
  return query;
}

/**
 * 按下单时间 posts `where.data` as two `Date#toLocaleString()` values joined by a bare
 * `-` (`"2026/2/1 00:00:00-2026/2/22 06:00:00"`), so the separator is the hyphen that
 * follows a clock time — any other hyphen belongs to a locale's own date format.
 *
 * Deterministic despite the `Date`: both halves come from the payload, never from `now`.
 */
const RANGE = /^(.*\d:\d{2}:\d{2})-(.+)$/;

function parseLocaleRange(value) {
  if (!value) return null;
  const m = RANGE.exec(String(value));
  if (!m) return null;
  const from = instantOf(m[1]);
  const to = instantOf(m[2]);
  return from && to ? { from, to } : null;
}

function instantOf(text_) {
  const t = Date.parse(text_);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}

/** `GET /api/v1/staff/express-companies` → the 发货 picker rows. */
export function toLegacyExpressCompanies(dto) {
  return mapList(dto && dto.items, (row) => ({
    id: text(row.id),
    code: text(row.code),
    name: text(row.name),
    sort: toInt(row.sortOrder, 0),
  }));
}

const DELIVERY_MODE = { 1: 'express', 2: 'merchant_delivery', 3: 'virtual' };

/**
 * The 发货 form → `POST /api/v1/staff/orders/:id/shipments`.
 *
 * The form posts the legacy `delivery_type` integer (1 快递 / 2 送货 / 3 虚拟) plus the
 * fields that mode needs. `delivery_company_id` is added at the call site, because the
 * contract keys the company by id and the old payload only carried its code.
 */
export function fromLegacyShipInput(data) {
  const src = data || {};
  const mode = DELIVERY_MODE[String(src.type || src.delivery_type)] || 'express';
  const body = { deliveryMode: mode, lines: [] };
  if (mode === 'express') {
    body.expressCompanyId = String(src.delivery_company_id || src.delivery_code || '');
    body.trackingNo = String(src.delivery_id || '');
  } else if (mode === 'merchant_delivery') {
    body.courierName = String(src.sh_delivery_name || src.delivery_name || '');
    body.courierPhone = String(src.sh_delivery_id || '');
  } else {
    body.virtualContent = String(src.fictitious_content || '');
  }
  if (src.remark) body.remark = String(src.remark);
  return body;
}

/**
 * 一键改价 → `POST /api/v1/staff/orders/:id/price`.
 *
 * Legacy posted the **new total**, which is the defect B2 removed: the server now takes
 * a discount and re-splits the line shares itself. The call site passes the current
 * `pay_price` alongside the typed total so the difference can be computed here.
 */
export function fromLegacyPriceInput(data) {
  const src = data || {};
  const current = Number(src.pay_price);
  const wanted = Number(src.price);
  let discount = 0;
  if (Number.isFinite(current) && Number.isFinite(wanted)) discount = current - wanted;
  if (!(discount > 0)) discount = 0;
  const body = { operatorDiscount: discount.toFixed(2) };
  if (src.remark) body.reason = String(src.remark);
  return body;
}

/** 订单备注 → `POST /api/v1/staff/orders/:id/remark`. */
export function fromLegacyRemarkInput(data) {
  const src = data || {};
  return { adminRemark: String(src.remark === undefined ? '' : src.remark) };
}

/**
 * The 售后备注 body (CR-4-h §2).
 *
 * `remark`, not `adminRemark`: the staff route appends a log entry rather than writing
 * the console's column, and the two are deliberately not the same field.
 */
export function fromLegacyRefundRemarkInput(data) {
  const src = data || {};
  return { remark: String(src.remark === undefined ? '' : src.remark) };
}

// ---------------------------------------------------------------------------
// 售后
// ---------------------------------------------------------------------------

/** `adminRefundDetail` → the 售后详情 the staff pages read. */
export function toLegacyStaffRefund(dto) {
  if (!dto) return {};
  return Object.assign({}, toLegacyRefund(dto), {
    uid: dto.userId === undefined ? 0 : toId(dto.userId),
    nickname: text(dto.userNickname),
    store_order_sn: text(dto.orderNo),
    refund_num: toInt(dto.quantity, 0),
    refund_phone: text(dto.returnPhone),
    refund_express: text(dto.returnTrackingNo),
    refund_express_name: text(dto.returnExpressCompanyName),
    refund_goods_explain: text(dto.explanation),
    refund_goods_img: mapList(dto.images, (u) => text(u)),
    remark: text(dto.adminRemark),
    cartInfo: mapList(dto.items, (item) => ({
      id: toId(item.orderItemId),
      cart_num: toInt(item.quantity, 1),
      truePrice: money(item.amount),
      sum_price: money(item.amount),
      productInfo: {
        store_name: text(item.productName),
        image: text(item.productImageUrl),
        price: money(item.amount),
        ...(text(item.specText)
          ? { attrInfo: { suk: text(item.specText).split('|').join(','), image: text(item.productImageUrl) } }
          : {}),
      },
    })),
    total_num: toInt(dto.quantity, 0),
    pay_price: money(dto.amount),
    pay_postage: '0.00',
    product_type: 0,
    _status: { _type: 3, _title: '退款中', _payType: '微信支付' },
  });
}

/** The 售后列表 pages through a bare array, like the order list. */
export function toLegacyStaffRefundList(dto) {
  return mapList(dto && dto.items, toLegacyStaffRefund);
}

/** Legacy 售后列表 filters → `GET /api/v1/staff/refunds` query. */
const REFUND_TAB = { 0: 'applied', 1: 'approved', 2: 'succeeded', 3: 'rejected' };

export function fromLegacyStaffRefundQuery(where) {
  const src = where || {};
  const query = {};
  if (src.page !== undefined) query.page = toInt(src.page, 1);
  if (src.limit !== undefined) query.pageSize = toInt(src.limit, 20);
  const tab = src.refundTypes === undefined ? src.status : src.refundTypes;
  const key = tab === undefined || tab === null ? '' : String(tab);
  if (REFUND_TAB[key]) query.status = REFUND_TAB[key];
  if (src.keyword) query.keyword = String(src.keyword);
  return query;
}

/**
 * 同意 / 拒绝退款 → `POST /api/v1/staff/refunds/:id/review`.
 *
 * Legacy's 直接退款 (an operator typing any amount) has no successor: C owns the money
 * and refunds exactly what was applied for. See docs/rewrite/cr/CR-4-h.md.
 */
export function fromLegacyRefundReviewInput(data) {
  const src = data || {};
  const reject = toInt(src.type, 1) === 2;
  const body = { decision: reject ? 'reject' : 'approve' };
  const reason = src.refuse_reason || src.reason;
  if (reject && reason) body.reason = String(reason);
  return body;
}
