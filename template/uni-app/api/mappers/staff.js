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

import {
  toId,
  toInt,
  money,
  legacyDateTime,
  moneyNumber,
  text,
  flag,
  list,
  mapList,
  unixSeconds,
  pagedList,
  fromLegacyPage,
} from './_shared.js';
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

// ---------------------------------------------------------------------------
// 商品管理 (A2 — next/packages/contracts/src/catalog/catalog.staff.contract.ts)
// ---------------------------------------------------------------------------

/**
 * 商品管理 的四个 tab。旧代码用 `type` 1/2/4/5（3 从来没用过），新契约用名字。
 *
 * `2` (仓库中) 在新模型里同时覆盖 `off_shelf` 和 `draft`：旧表只有一个 `is_show`，
 * 重写把「从没上架过」和「被下架了」拆成两个状态，草稿如果只在 `全部` 里出现，手机
 * 就能看见一件永远点不动的商品（a2.md 决定 2）。
 */
const STAFF_PRODUCT_STATE = { 1: 'on-sale', 2: 'in-stock', 4: 'sold-out', 5: 'low-stock' };

/** 商品列表查询：`{page, limit, store_name, type}` → `{page, pageSize, keyword, state}`。 */
export function fromLegacyStaffProductQuery(where) {
  const src = where || {};
  const out = fromLegacyPage(src);
  const keyword = text(src.store_name !== undefined ? src.store_name : src.keyword).trim();
  if (keyword) out.keyword = keyword;
  const state = STAFF_PRODUCT_STATE[toInt(src.type, 0)];
  if (state) out.state = state;
  return out;
}

/**
 * `kind` → 旧的 `virtual_type`。页面只问 `virtual_type != 0`（「仅普通商品可在此处修改
 * 价格/库存」），所以这里只要「实物是 0，其余都不是 0」这一点成立；名字仍按旧表的
 * 1 卡密 / 2 优惠券 / 3 虚拟 对上，免得别处再读到时对不上号。
 */
const STAFF_PRODUCT_KIND = {
  physical: 0,
  virtual_card: 1,
  virtual_coupon: 2,
  virtual_manual: 3,
};

/**
 * `staffProductListItem` → 一行 商品管理。
 *
 * `attr_value` 是这里唯一一个凭空造出来的字段：单规格商品的「修改价格/库存」抽屉
 * (`pages/admin/goods/components/editPrice`) 整块挂在 `v-if="goodsInfo.attr_value"`
 * 上，而列表路由按设计不返回 SKU（a2.md：列表行只带列表页渲染的东西）。所以列表行带
 * 一个用行上已有的售价和库存填好的草稿，成本价和划线价留空——空字段不会进 PATCH
 * 体，服务端「缺省即不动」，所以留空就是「不改」。真正的 SKU id 由
 * `api/admin.js` 的 `postUpdateAttrs` 在保存时现取。
 */
export function toLegacyStaffProduct(dto) {
  if (!dto) return {};
  const price = money(dto.price);
  const stock = toInt(dto.stock, 0);
  return {
    id: toId(dto.id),
    store_name: text(dto.name),
    image: text(dto.imageUrl),
    price,
    stock,
    sales: toInt(dto.sales, 0),
    is_show: flag(dto.visible),
    spec_type: flag(dto.specMode),
    virtual_type: STAFF_PRODUCT_KIND[dto.kind] === undefined ? 0 : STAFF_PRODUCT_KIND[dto.kind],
    unit_name: text(dto.unitName),
    // 两个抽屉都按逗号串读当前选中项（`cate_id.split(',')` / `label_list.split(',')`）。
    cate_id: list(dto.categoryIds).map(text).join(','),
    label_list: list(dto.labelIds).map(text).join(','),
    attr_value: { price, cost: '', ot_price: '', stock },
  };
}

/** 商品列表：页面读 `res.data.list`，并用 `list.length < limit` 判断没有更多了。 */
export function toLegacyStaffProductList(dto) {
  return pagedList(dto, toLegacyStaffProduct);
}

/** 批量打标签 `{label_list, ids}` → `{productIds, labelIds}`。空 `labelIds` 是「清空」。 */
export function fromLegacyLabelAssignment(data) {
  const src = data || {};
  return {
    productIds: idArray(src.ids),
    labelIds: idArray(src.label_list),
  };
}

/** 批量改分类 `{cate_id, ids}` → `{productIds, categoryIds}`（复数，a2.md 决定 3）。 */
export function fromLegacyCategoryAssignment(data) {
  const src = data || {};
  return {
    productIds: idArray(src.ids),
    categoryIds: idArray(src.cate_id),
  };
}

/** 一个 id、一个 id 数组或一个逗号串，都收敛成十进制字符串数组。 */
function idArray(value) {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((item) => text(item).trim()).filter((item) => item !== '');
}

/** 商品标签抽屉读 `[{cate_name, list:[{id,name}]}]`，未分类的那组 `categoryName` 是「未分类」。 */
export function toLegacyProductLabels(dto) {
  return mapList(dto && dto.items, (group) => ({
    cate_id: group && group.categoryId !== null ? toId(group && group.categoryId) : 0,
    cate_name: text(group && group.categoryName),
    list: mapList(group && group.labels, (label) => ({
      id: toId(label && label.id),
      name: text(label && label.name),
    })),
  }));
}

/** 分类抽屉读 `title` 和 `children`，只渲染两级（三级在契约里有，这里原样带下去）。 */
function toLegacyCategoryNode(node) {
  if (!node) return { id: 0, title: '', children: [] };
  return {
    id: toId(node.id),
    title: text(node.name),
    children: mapList(node.children, toLegacyCategoryNode),
  };
}

export function toLegacyProductCategories(dto) {
  return mapList(dto && dto.items, toLegacyCategoryNode);
}

/**
 * `staffSku` → 一行 商品规格。
 *
 * `id` 和 `unique` 是同一个 SKU id 的两种读法：`specs.vue` 的 checkbox 按 `id` 比，
 * 保存时送的却是 `unique`（旧表 `eb_store_product_attr_value.unique` 是一串哈希）。
 */
export function toLegacyStaffSku(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    unique: text(dto.id),
    suk: text(dto.specText),
    bar_code: text(dto.skuCode),
    image: text(dto.imageUrl),
    pic: text(dto.imageUrl),
    price: money(dto.price),
    ot_price: money(dto.originalPrice, ''),
    cost: money(dto.cost, ''),
    stock: toInt(dto.stock, 0),
    sales: toInt(dto.sales, 0),
    weight: text(dto.weight),
    volume: text(dto.volume),
    is_show: flag(dto.isVisible),
  };
}

export function toLegacyStaffSkus(dto) {
  return mapList(dto && dto.items, toLegacyStaffSku);
}

/** 只有填了的字段才进 PATCH 体：空串 / undefined 一律不送，服务端就不动那一列。 */
function patchField(body, key, value, convert) {
  if (value === undefined || value === null || value === '') return;
  body[key] = convert(value);
}

/**
 * 修改价格/库存 `{attr_value: [{unique, price, cost, ot_price, stock}]}` →
 * `{items: [{id, price?, cost?, originalPrice?, stock?}]}`。
 *
 * 这是一个 **patch**：旧的 `postUpdateAttrs` 整行重写，所以在两分钟前打开的页面上改
 * 一次价格，会把那个页面当时显示的库存写回去，把这期间卖掉的订单悄悄「取消销售」。
 * 缺省即不动（a2.md 决定 5）。`id` 由调用方（`api/admin.js`）补齐。
 */
export function fromLegacySkuPatch(row, fallbackId) {
  const src = row || {};
  const body = { id: text(src.unique !== undefined && src.unique !== '' ? src.unique : fallbackId) };
  patchField(body, 'price', src.price, money);
  patchField(body, 'cost', src.cost, money);
  patchField(body, 'originalPrice', src.ot_price, money);
  patchField(body, 'stock', src.stock, (value) => toInt(value, 0));
  patchField(body, 'skuCode', src.bar_code, text);
  patchField(body, 'weight', src.weight, text);
  patchField(body, 'volume', src.volume, text);
  return body;
}

/** 运费模板选项：picker 用 `range-key="name"`，选中后读 `.id`。 */
export function toLegacyTemplateOptions(dto) {
  return mapList(dto && dto.items, (item) => ({
    id: toId(item && item.id),
    name: text(item && item.name),
    type: text(item && item.chargeMode),
  }));
}

/**
 * 旧的 `freight`：1 包邮 / 2 固定邮费 / 3 运费模板。表单只给了 2 和 3 两个单选。
 * 固定邮费填 0 就是包邮，所以 0 收敛到 `free`——契约里 `fixed` 必须带
 * `fixedFreight`，而 `free` 带了反而会 422。
 */
export function fromLegacyStaffProductForm(data) {
  const src = data || {};
  const attr = src.attr || {};
  const sliders = list(src.slider_image).map(text).filter(Boolean).slice(0, 9);
  const image = text(src.image) || sliders[0] || '';
  const body = {
    name: text(src.store_name),
    imageUrl: image,
    sliderImages: sliders,
    categoryIds: idArray(src.cate_id),
    unitName: text(src.unit_name),
    descriptionHtml: text(src.content),
    visible: !!toInt(src.is_show, 0),
    freightMode: 'free',
    sku: {
      price: money(attr.price),
      stock: toInt(attr.stock, 0),
    },
  };
  const freight = toInt(src.freight, 2);
  const postage = Number(src.postage);
  if (freight === 3) {
    body.freightMode = 'template';
    body.shippingTemplateId = text(src.temp_id);
  } else if (freight === 2 && Number.isFinite(postage) && postage > 0) {
    body.freightMode = 'fixed';
    body.fixedFreight = money(src.postage);
  }
  patchField(body.sku, 'cost', attr.cost, money);
  patchField(body.sku, 'originalPrice', attr.ot_price, money);
  patchField(body.sku, 'skuCode', attr.bar_code, text);
  patchField(body.sku, 'barCode', attr.bar_code_number, text);
  patchField(body.sku, 'weight', attr.weight, text);
  patchField(body.sku, 'volume', attr.volume, text);
  return body;
}

// ---------------------------------------------------------------------------
// 用户管理 (E4 — next/packages/contracts/src/user/user.staff.contract.ts)
// ---------------------------------------------------------------------------

/** 用户列表查询：`{page, limit, nickname, group_id, label_id}`。 */
export function fromLegacyStaffUserQuery(where) {
  const src = where || {};
  const out = fromLegacyPage(src);
  const keyword = text(src.nickname !== undefined ? src.nickname : src.keyword).trim();
  if (keyword) out.keyword = keyword;
  const groupId = text(src.group_id).trim();
  if (groupId && groupId !== '0') out.groupId = groupId;
  // 筛选抽屉多选标签后把 id 用逗号拼起来，路由只收一个 `labelId`（E4）。取第一个，
  // 多选的其余项在服务端落地前只能靠用户再筛一次；status/h3.md 记了这一条。
  const labelId = text(src.label_id).trim().split(',')[0];
  if (labelId && labelId !== '0') out.labelId = labelId;
  return out;
}

/**
 * `staffUserListItem` → 用户列表行 / 用户详情。
 *
 * 契约有意做薄（E4：「一个店员该看到一个客户的多少」）：没有真实姓名、生日、身份证、
 * 地址，手机号永远是打码的 `138****8000`。页面上那几个字段都挂着 `v-if`，所以缺了
 * 就是不渲染，正是想要的效果。`coupon_num` 是详情页唯一一个没有 `v-if` 的：契约里
 * 没有这个数，所以按 E4 对「未知」的写法渲染成 `--`。CR-1-h3 给了「查看优惠券」一条
 * 读路由（`getUserCoupon({uid})`，列表本身），但没有把张数加进 E4 的用户详情——那要
 * 用户域去数优惠券域的表，不是一次批量查询（见 docs/rewrite/status/w5t.md §1）。
 */
export function toLegacyStaffUser(dto) {
  if (!dto) return {};
  const groups = list(dto.groups);
  return {
    uid: toId(dto.id),
    nickname: text(dto.nickname),
    avatar: text(dto.avatarUrl),
    phone: text(dto.phone),
    status: dto.status === 'disabled' ? 0 : 1,
    // 详情页的分组选择器按 `group_id` 找当前项；契约给的是一个数组，取第一个。
    group_id: groups.length ? toId(groups[0].id) : 0,
    group_name: groups.length ? text(groups[0].name) : '',
    // 标签 chip 读 `label_name`，抽屉的 `dataLabel` 也是这个形状。
    label_id: mapList(dto.labels, (label) => ({
      id: toId(label && label.id),
      label_name: text(label && label.name),
    })),
    order_total_count: dto.orderCount === null || dto.orderCount === undefined ? '--' : toInt(dto.orderCount, 0),
    order_total_price: dto.spendTotal === null || dto.spendTotal === undefined ? '--' : money(dto.spendTotal),
    _add_time: legacyDateTime(dto.createdAt),
    coupon_num: '--',
  };
}

export function toLegacyStaffUserList(dto) {
  return pagedList(dto, toLegacyStaffUser);
}

/** 分组选择器 `range-key="group_name"`，选中后读 `.id`。 */
export function toLegacyUserGroups(dto) {
  return mapList(dto && dto.items, (item) => ({
    id: toId(item && item.id),
    group_name: text(item && item.name),
  }));
}

/**
 * 标签抽屉 / 筛选抽屉读 `[{name, label:[{id, label_name, assigned}]}]`。
 *
 * 契约把「全部标签」和「这个客户有哪些」放在一个响应里（`assigned`），旧组件自己用
 * `inArray(label.id, this.dataLabel)` 记账。两边都留着：批量打标签时抽屉是从空集开始
 * 的，直接照搬某一个客户的 `assigned` 会把别人的标签预先勾上。
 */
export function toLegacyUserLabels(dto, opts) {
  // `catalogue`：只要「全部标签」时（筛选抽屉、批量抽屉借任意一个客户读目录），
  // `assigned` 一律 false，借来的那个客户的标签不会出现在界面上。
  const catalogue = !!(opts && opts.catalogue);
  return mapList(dto && dto.categories, (group) => ({
    id: group && group.categoryId !== null && group.categoryId !== undefined ? toId(group.categoryId) : 0,
    name: text(group && group.categoryName, '未分类'),
    label: mapList(group && group.labels, (label) => ({
      id: toId(label && label.id),
      label_name: text(label && label.name),
      assigned: !catalogue && !!(label && label.assigned),
    })),
  }));
}

/**
 * 设置分组的 body。
 *
 * `null` 必须原样送过去：路由用 `{groupId: null}` 表示「清空分组（未分组）」，而旧
 * 包装器写的是 `String(groupId)`，把 null 变成字符串 `"null"`，必然 422（E4 第 3 条）。
 */
export function fromLegacyUserGroupInput(groupId) {
  if (groupId === null || groupId === undefined || groupId === '' || Number(groupId) === 0) {
    return { groupId: null };
  }
  return { groupId: text(groupId) };
}

/** 设置标签的 body：`{labelIds: string[]}`，调用处本来就传数组（E4 第 1 条）。 */
export function fromLegacyUserLabelInput(labelId) {
  return { labelIds: idArray(labelId) };
}
