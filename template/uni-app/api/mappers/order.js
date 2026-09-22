// order DTOs → the legacy 订单 view models.
//
// Contract: next/packages/contracts/src/order/order.checkout.contract.ts
//
// The pages branch almost entirely on `_status._type`, which the old backend computed
// server-side. Its values are unchanged:
//   0 待付款 · 1 待发货 · 2 待收货 · 3 待评价 · 4 已完成 · -1 退款中 · -2 已退款 · 9 线下待付款
// `9` can no longer occur — offline payment is retired.

import {
  toId,
  toInt,
  money,
  moneyNumber,
  text,
  flag,
  list,
  mapList,
  pagedList,
  legacyDateTime,
  legacyMinute,
  legacyDate,
  legacyTime,
  unixSeconds,
} from './_shared.js';

/** Flags for features the rewrite dropped; pages read them to hide a branch. */
const RETIRED_ORDER_FLAGS = {
  seckill_id: 0,
  bargain_id: 0,
  combination_id: 0,
  pink_id: 0,
  advance_id: 0,
  use_integral: 0,
  deduction_price: '0.00',
  gift_price: '0.00',
  is_gift: 0,
  gift_uid: 0,
  pay_uid: 0,
  pid: 0,
  shipping_type: 0,
  store_id: 0,
  virtual_type: 0,
  vip_true_price: '0.00',
  levelPrice: 0,
  memberPrice: 0,
  order_shipping_open: 0,
  fictitious_content: '',
  help_info: null,
  status_pic: '',
};

/** `orders.status` + fulfilment + refund → the single `_type` the pages switch on. */
export function legacyStatusType(dto) {
  if (!dto) return 0;
  if (dto.refundStatus === 'refunded') return -2;
  if (dto.refundStatus === 'requested' || dto.refundStatus === 'partially_refunded') return -1;
  switch (dto.status) {
    case 'pending_payment':
      return 0;
    case 'paid':
      return dto.fulfillmentStatus === 'unfulfilled' ? 1 : 2;
    case 'shipped':
      return 2;
    case 'received':
      return 3;
    case 'completed':
      return 4;
    case 'cancelled':
      return 4;
    case 'refunded':
      return -2;
    default:
      return 0;
  }
}

const STATUS_TITLES = {
  0: ['待支付', '请在规定时间内完成支付'],
  1: ['待发货', '商家正在备货中'],
  2: ['待收货', '商品已发出，请注意查收'],
  3: ['待评价', '已收货，快去评价吧'],
  4: ['已完成', '交易已完成'],
  '-1': ['退款中', '退款申请处理中'],
  '-2': ['已退款', '退款已原路退回'],
};

/** The `_status` object. `refund_*` fields are filled by the refund mapper when needed. */
export function toLegacyStatus(dto) {
  const type = legacyStatusType(dto);
  const [title, msg] = STATUS_TITLES[type] || STATUS_TITLES[0];
  const cancelled = dto && dto.status === 'cancelled';
  return {
    _type: type,
    _title: cancelled ? '已取消' : title,
    _msg: cancelled ? text(dto.cancelReason, '订单已取消') : msg,
    _payType: '微信支付',
    _class: type,
    refund_name: '',
    refund_phone: '',
    refund_address: '',
  };
}

/** `orderItem` → one `cartInfo` row. */
export function toLegacyOrderItem(dto) {
  if (!dto) return {};
  const hasSpec = !!text(dto.specText);
  const attrInfo = {
    unique: text(dto.skuId),
    suk: text(dto.specText).split('|').join(','),
    image: text(dto.skuImageUrl || dto.productImageUrl),
    price: money(dto.unitPrice),
    ot_price: money(dto.originalUnitPrice, ''),
    product_id: toId(dto.productId),
  };
  return {
    id: toId(dto.id),
    // `unique` is what 评价 / 退款 pages pass back as the line key.
    unique: text(dto.id),
    cart_num: toInt(dto.quantity, 1),
    refund_num: toInt(dto.refundedQuantity, 0),
    delivery_num: toInt(dto.shippedQuantity, 0),
    truePrice: money(dto.unitPrice),
    sum_price: money(dto.totalAmount),
    product_id: toId(dto.productId),
    is_reply: 0,
    is_valid: 1,
    productInfo: {
      id: toId(dto.productId),
      store_name: text(dto.productName),
      image: text(dto.productImageUrl),
      price: money(dto.unitPrice),
      ot_price: money(dto.originalUnitPrice, ''),
      unit_name: text(dto.unitName, '件'),
      is_virtual: dto.productKind && dto.productKind !== 'physical' ? 1 : 0,
      store_mention: 1,
      ...(hasSpec ? { attrInfo } : {}),
    },
  };
}

/** `orderReceiver` → the flat `real_name` / `user_phone` / `user_address` trio. */
export function toLegacyReceiver(dto) {
  if (!dto) {
    return { real_name: '', user_phone: '', user_address: '', user_address_id: 0 };
  }
  const region = [dto.province, dto.city, dto.district].filter(Boolean).join(' ');
  return {
    real_name: text(dto.name),
    user_phone: text(dto.phone),
    user_address: `${region}${region && dto.detail ? ' ' : ''}${text(dto.detail)}`,
    user_address_id: dto.addressId === null || dto.addressId === undefined ? 0 : toId(dto.addressId),
    province: text(dto.province),
    city: text(dto.city),
    district: text(dto.district),
    detail: text(dto.detail),
    post_code: text(dto.postCode),
  };
}

/** `orderListItem` → one 订单列表 row. */
export function toLegacyOrderListItem(dto) {
  if (!dto) return {};
  return {
    ...RETIRED_ORDER_FLAGS,
    id: toId(dto.id),
    // Pages both *print* `order_id` (订单号：…) and *route* on it. CR-1-h was
    // accepted, so every storefront order route now takes the surrogate id or
    // the 24-digit order number, and `order_id` can be the number the buyer
    // actually recognises — the one on the WeChat payment record and the one a
    // 客服 agent pastes into a deep link.
    order_id: text(dto.orderNo),
    order_no: text(dto.orderNo),
    trade_no: text(dto.orderNo),
    uid: 0,
    type: dto.kind === 'groupbuy' ? 1 : dto.kind === 'presale' ? 2 : 0,
    status: legacyRawStatus(dto),
    paid: dto.status === 'pending_payment' || dto.status === 'cancelled' ? 0 : 1,
    refund_status: legacyRefundStatus(dto.refundStatus),
    is_cancel: dto.status === 'cancelled' ? 1 : 0,
    is_all_refund: dto.refundStatus === 'refunded',
    is_apply_refund: dto.refundStatus === 'requested',
    is_refund_available: dto.status === 'paid' || dto.status === 'shipped' || dto.status === 'received',
    refund: [],
    total_num: toInt(dto.totalQuantity, 0),
    total_price: money(dto.itemsAmount),
    pay_price: money(dto.payableAmount),
    paid_price: money(dto.paidAmount, ''),
    pay_postage: money(dto.freightAmount),
    coupon_price: money(dto.couponDiscount),
    add_time: unixSeconds(dto.createdAt),
    _add_time: legacyMinute(dto.createdAt),
    add_time_y: legacyDate(dto.createdAt),
    add_time_h: legacyTime(dto.createdAt),
    pay_expires_at: unixSeconds(dto.payExpiresAt, 0),
    _status: toLegacyStatus(dto),
    cartInfo: mapList(dto.items, toLegacyOrderItem),
    nickname: '',
    avatar: '',
    gift_user_info: null,
  };
}

function legacyRawStatus(dto) {
  // legacy `orders.status`: 0 待发货, 1 待收货, 2 待评价, 3 已完成, -1/-2 退款
  switch (dto.status) {
    case 'shipped':
      return 1;
    case 'received':
      return 2;
    case 'completed':
      return 3;
    default:
      return 0;
  }
}

function legacyRefundStatus(refundStatus) {
  // legacy `refund_status`: 0 未退款, 1 申请中, 2 已退款
  if (refundStatus === 'requested') return 1;
  if (refundStatus === 'refunded' || refundStatus === 'partially_refunded') return 2;
  return 0;
}

export function toLegacyOrderList(dto) {
  return mapList(dto && dto.items, toLegacyOrderListItem);
}

export function toLegacyOrderPage(dto) {
  return pagedList(dto, toLegacyOrderListItem);
}

/** `orderDetail` → the 订单详情 payload. */
export function toLegacyOrderDetail(dto) {
  if (!dto) return {};
  return {
    ...toLegacyOrderListItem(dto),
    ...toLegacyReceiver(dto.receiver),
    mark: text(dto.buyerRemark),
    remark: '',
    custom_form: dto.customForm ? Object.keys(dto.customForm).map((k) => [k, dto.customForm[k]]) : [],
    delivery_type: dto.fulfillmentStatus === 'unfulfilled' ? '' : 'express',
    delivery_name: '',
    delivery_id: '',
    refund_reason: text(dto.cancelReason),
    refund_explain: '',
    refund_img: [],
    refund_type: 0,
    refuse_reason: '',
    pay_time: unixSeconds(dto.paidAt, 0),
    delivery_time: unixSeconds(dto.shippedAt, 0),
    receive_time: unixSeconds(dto.receivedAt, 0),
    finish_time: unixSeconds(dto.completedAt, 0),
    cancel_time: unixSeconds(dto.cancelledAt, 0),
  };
}

/** `GET /api/v1/orders/counts` → `orderData`, the tab badges. */
export function toLegacyOrderCounts(dto) {
  if (!dto) return {};
  return {
    order_count: toInt(dto.all, 0),
    unpaid_count: toInt(dto.unpaid, 0),
    unshipped_count: toInt(dto.unshipped, 0),
    received_count: toInt(dto.unreceived, 0),
    evaluated_count: toInt(dto.finished, 0),
    complete_count: toInt(dto.finished, 0),
    refund_count: toInt(dto.refunding, 0),
    cancel_count: toInt(dto.cancelled, 0),
    // Retired wallet figures the 个人中心 header used to show.
    sum_price: '0.00',
    integral_count: 0,
    coupon_count: 0,
  };
}

/** Legacy 订单列表 `{type, page, limit}` → `GET /api/v1/orders` query. */
const TAB_BY_LEGACY_TYPE = {
  '': 'all',
  '-3': 'all',
  0: 'unpaid',
  1: 'unshipped',
  2: 'unreceived',
  3: 'finished',
  4: 'finished',
  '-1': 'refunding',
  '-2': 'refunding',
  9: 'unpaid',
};

export function fromLegacyOrderListQuery(data) {
  const src = data || {};
  const query = {};
  if (src.page !== undefined) query.page = toInt(src.page, 1);
  if (src.limit !== undefined) query.pageSize = toInt(src.limit, 20);
  const raw = src.type === undefined || src.type === null ? '' : String(src.type);
  query.tab = TAB_BY_LEGACY_TYPE[raw] || 'all';
  if (src.search) query.keyword = String(src.search);
  return query;
}

// ---------------------------------------------------------------------------
// 确认订单 (checkout preview)
// ---------------------------------------------------------------------------

/**
 * A "buy now" purchase used to be written into the cart as a hidden row so the confirm
 * page could refer to it by `cartId`. Nothing is written any more, so `postCartAdd` with
 * `new: 1` hands the page this ticket instead and `orderConfirm` unpacks it into a
 * `buy-now` preview.
 *
 * Format: `buynow:<skuId>:<quantity>[:<kind>:<activityId>[:<groupId>]]`.
 *
 * 拼团 and 预售 travel in the ticket rather than in the page state, because the confirm
 * page only forwards `cartId` to the **preview** (`getConfirm` sends
 * `{cartId, new, addressId, shipping_type}` and nothing else), and B1 needs `kind` on
 * both the preview and the create — the `OrderKindHandler` reserves the activity stock.
 * A colon can never appear inside an id, so the join is unambiguous.
 */
export function buyNowTicket(skuId, quantity, kind, activityId, groupId) {
  const head = `buynow:${skuId}:${toInt(quantity, 1)}`;
  if (!kind || kind === 'normal' || !activityId) return head;
  const tail = `${head}:${kind}:${activityId}`;
  return groupId && String(groupId) !== '0' ? `${tail}:${groupId}` : tail;
}

export function parseBuyNowTicket(value) {
  const parts = String(value === undefined || value === null ? '' : value).split(':');
  if (parts[0] !== 'buynow' || !parts[1]) return null;
  return {
    skuId: parts[1],
    quantity: toInt(parts[2], 1),
    kind: parts[3] === 'groupbuy' || parts[3] === 'presale' ? parts[3] : 'normal',
    activityId: parts[4] || '',
    groupId: parts[5] || '',
  };
}

/** Legacy `orderConfirm`/`order/computed` input → `POST /api/v1/checkout/preview` body. */
export function fromLegacyCheckoutInput(data) {
  const src = data || {};
  const ticket = parseBuyNowTicket(src.cartId);
  const body = { kind: 'normal' };
  if (ticket) {
    body.source = 'buy-now';
    // `checkoutInput.item` is a nested object; a flat `{skuId, quantity}` is rejected
    // by the `buyNowNeedsAnItem` refine before the handler ever sees it.
    body.item = { skuId: ticket.skuId, quantity: ticket.quantity };
    if (ticket.kind !== 'normal' && ticket.activityId) {
      body.kind = ticket.kind;
      body.kindMeta = { activityId: String(ticket.activityId) };
      // 参团 passes the team through the confirm page's query string, so accept it
      // from either side; absent means 开团.
      const groupId = src.pinkId || ticket.groupId;
      if (ticket.kind === 'groupbuy' && groupId && String(groupId) !== '0') {
        body.kindMeta.groupId = String(groupId);
      }
    }
  } else {
    body.source = 'cart';
    body.cartItemIds = splitIds(src.cartId);
  }
  if (src.addressId) body.addressId = String(src.addressId);
  if (src.couponId) body.userCouponId = String(src.couponId);
  return body;
}

function splitIds(value) {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (value === undefined || value === null || value === '') return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * `checkoutPreview` → the 确认订单 payload.
 *
 * Everything the page reads that the rewrite retired (积分抵扣, 余额支付, 线下支付,
 * 支付宝, 好友代付, 到店自提, 发票, 秒杀) is answered with a falsy constant so the
 * corresponding block never renders.
 */
export function toLegacyOrderConfirm(dto) {
  if (!dto) return {};
  const receiver = toLegacyReceiver(dto.receiver);
  return {
    cartInfo: mapList(dto.lines, toLegacyCheckoutLine),
    priceGroup: {
      totalPrice: money(dto.itemsAmount),
      storePostage: money(dto.freightAmount),
      storeFreePostage: '0.00',
      costPrice: money(dto.itemsAmount),
      vipPrice: 0,
      payPrice: money(dto.payableAmount),
    },
    orderKey: text(dto.idempotencyKey || ''),
    couponPrice: money(dto.couponDiscount),
    deduction: false,
    discount_id: dto.userCouponId === null || dto.userCouponId === undefined ? 0 : toId(dto.userCouponId),
    usable_coupon_count: 0,
    valid_count: toInt(dto.totalQuantity, 0),
    addressInfo: receiver,
    userInfo: {
      real_name: receiver.real_name,
      phone: receiver.user_phone,
      record_phone: receiver.user_phone,
      now_money: '0.00',
      integral: 0,
      uid: 0,
    },
    custom_form: list(dto.customFormFields).map((f) => ({
      key: text(f.key),
      label: text(f.label),
      type: text(f.type),
      required: !!f.required,
      options: list(f.options).map((o) => text(o)),
      placeholder: text(f.placeholder),
    })),
    pay_window_minutes: toInt(dto.payWindowMinutes, 30),
    adjustments: mapList(dto.adjustments, (a) => ({
      source: text(a.source),
      label: text(a.label),
      amount: money(a.amount),
    })),
    address_required: dto.addressRequired !== false,
    // retired features — every one of these gates a block of UI
    pay_weixin_open: 1,
    yue_pay_status: 0,
    ali_pay_status: 0,
    offline_pay_status: 0,
    offlinePostage: 0,
    friend_pay_status: 0,
    integral_open: 0,
    integralRatio: 0,
    usable_integral: 0,
    store_self_mention: 0,
    invoice_func: false,
    special_invoice: false,
    seckill_id: 0,
    bargain_id: 0,
    combination_id: 0,
    virtual_type: 0,
    is_gift: 0,
  };
}

/** `checkoutLine` → a `cartInfo` row on the 确认订单 page. */
export function toLegacyCheckoutLine(dto) {
  if (!dto) return {};
  const hasSpec = !!text(dto.specText);
  return {
    id: dto.cartItemId === null || dto.cartItemId === undefined ? 0 : toId(dto.cartItemId),
    item_key: text(dto.itemKey),
    product_id: toId(dto.productId),
    product_attr_unique: text(dto.skuId),
    cart_num: toInt(dto.quantity, 1),
    truePrice: money(dto.unitPrice),
    costPrice: money(dto.originalUnitPrice, ''),
    sum_price: money(dto.totalAmount),
    is_valid: 1,
    productInfo: {
      id: toId(dto.productId),
      store_name: text(dto.productName),
      image: text(dto.productImageUrl),
      price: money(dto.unitPrice),
      unit_name: text(dto.unitName, '件'),
      is_virtual: dto.productKind && dto.productKind !== 'physical' ? 1 : 0,
      store_mention: 1,
      ...(hasSpec
        ? {
            attrInfo: {
              unique: text(dto.skuId),
              suk: text(dto.specText).split('|').join(','),
              image: text(dto.skuImageUrl || dto.productImageUrl),
              price: money(dto.unitPrice),
            },
          }
        : {}),
    },
  };
}

/** `postOrderComputed` only reads `data.result`; it is the recomputed price group. */
export function toLegacyOrderComputed(dto) {
  const legacy = toLegacyOrderConfirm(dto);
  return {
    result: {
      pay_price: money(dto && dto.payableAmount),
      total_price: money(dto && dto.itemsAmount),
      pay_postage: money(dto && dto.freightAmount),
      coupon_price: money(dto && dto.couponDiscount),
      deduction_price: '0.00',
      use_integral: 0,
      priceGroup: legacy.priceGroup,
    },
    status: 'NONE',
  };
}

/** Legacy `orderCreate(key, data)` → `POST /api/v1/orders` body. */
export function fromLegacyOrderCreateInput(key, data) {
  const src = data || {};
  const body = fromLegacyCheckoutInput(src);
  body.idempotencyKey = String(key || src.orderKey || '');
  if (src.mark) body.buyerRemark = String(src.mark);
  if (src.payPrice !== undefined && src.payPrice !== null && src.payPrice !== '') {
    body.expectedPayableAmount = money(src.payPrice);
  }
  if (src.custom_form) body.customForm = src.custom_form;
  return body;
}

/** `orderCreate` resolves to `{status, result: {orderId, …}}`. */
export function toLegacyOrderCreateResult(dto) {
  if (!dto) return { status: 'ORDER_CREATE_ERROR', result: {} };
  return {
    status: dto.status === 'pending_payment' ? 'ORDER_CREATE' : 'PAY_DEFICIENCY',
    result: {
      orderId: text(dto.id),
      order_no: text(dto.orderNo),
      key: text(dto.orderNo),
      pay_price: money(dto.payableAmount),
      pay_expires_at: unixSeconds(dto.payExpiresAt, 0),
    },
  };
}

/** `getCashierOrder` — the 收银台 reads a handful of fields off the order. */
export function toLegacyCashierOrder(dto) {
  if (!dto) return {};
  return {
    oid: toId(dto.id),
    // Routable either way since CR-1-h; the cashier prints it next to the total.
    order_id: text(dto.orderNo),
    pay_price: money(dto.payableAmount),
    pay_postage: money(dto.freightAmount),
    offline_postage: 0,
    invalid_time: unixSeconds(dto.payExpiresAt, 0),
    is_gift: 0,
    pay_weixin_open: 1,
    yue_pay_status: 0,
    ali_pay_status: 0,
    offline_pay_status: 0,
    friend_pay_status: 0,
    now_money: '0.00',
    status: legacyStatusType(dto),
  };
}

/** `orderProduct(unique)` — the 评价 page wants one line plus its quantity. */
export function toLegacyOrderProduct(dto, orderItemId) {
  const line = list(dto && dto.items).find((i) => String(i.id) === String(orderItemId)) || null;
  if (!line) return { cart_num: 0, productInfo: {} };
  const legacy = toLegacyOrderItem(line);
  return { cart_num: legacy.cart_num, productInfo: legacy.productInfo, unique: legacy.unique };
}

export { moneyNumber, flag };
