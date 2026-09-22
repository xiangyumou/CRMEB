// refund DTOs → the legacy 退款 / 售后 view models.
//
// Contract: next/packages/contracts/src/refund/refund.storefront.contract.ts
//
// Legacy `refund_type`: 0 待审核 · 1 已拒绝 · 2 退货待寄回 · 3 待商家收货 · 4 已完成 · 5 已撤销

import { toId, toInt, money, text, list, mapList, pagedList, unixSeconds, legacyDateTime } from './_shared.js';

const REFUND_TYPE = {
  applied: 0,
  rejected: 1,
  approved: 2,
  returned: 3,
  refunding: 3,
  succeeded: 4,
  cancelled: 5,
  closed: 5,
};

const REFUND_MSG = {
  applied: '等待商家处理',
  rejected: '商家已拒绝',
  approved: '商家已同意，请寄回商品',
  returned: '等待商家收货',
  refunding: '退款处理中',
  succeeded: '退款已完成',
  cancelled: '已撤销申请',
  closed: '售后已关闭',
};

export function legacyRefundType(status, returnStage) {
  if (status === 'approved' && returnStage === 'shipped_back') return 3;
  const t = REFUND_TYPE[status];
  return t === undefined ? 0 : t;
}

/** `refundItem` → one `cart_info` row. */
export function toLegacyRefundLine(dto) {
  if (!dto) return {};
  const hasSpec = !!text(dto.specText);
  return {
    id: toId(dto.orderItemId),
    cart_id: toId(dto.orderItemId),
    unique: text(dto.orderItemId),
    cart_num: toInt(dto.quantity, 1),
    truePrice: money(dto.amount),
    sum_price: money(dto.amount),
    productInfo: {
      store_name: text(dto.productName),
      image: text(dto.productImageUrl),
      price: money(dto.amount),
      ...(hasSpec
        ? {
            attrInfo: {
              suk: text(dto.specText).split('|').join(','),
              image: text(dto.productImageUrl),
              price: money(dto.amount),
            },
          }
        : {}),
    },
  };
}

/** `refundSummary` / `refundDetail` → one 退款单. */
export function toLegacyRefund(dto) {
  if (!dto) return {};
  const type = legacyRefundType(dto.status, dto.returnStage);
  return {
    id: toId(dto.id),
    order_id: text(dto.id),
    refund_order_id: text(dto.refundNo),
    store_order_id: text(dto.orderId),
    order_no: text(dto.orderNo),
    name: text(dto.refundNo),
    refund_type: type,
    _type: type,
    _msg: REFUND_MSG[dto.status] || '',
    _title: REFUND_MSG[dto.status] || '',
    refund_num: toInt(dto.quantity, 0),
    refund_price: money(dto.amount),
    refunded_price: money(dto.refundedAmount),
    refund_reason: text(dto.reason),
    refund_explain: text(dto.explanation),
    refund_img: mapList(dto.images, (u) => text(u)),
    refuse_reason: text(dto.rejectReason),
    is_refund_freight: dto.includesFreight ? 1 : 0,
    // 0 仅退款 / 1 退货退款 — the old flag the list filters on
    refund_kind: dto.kind === 'return_and_refund' ? 1 : 0,
    cart_info: mapList(dto.items, toLegacyRefundLine),
    add_time: unixSeconds(dto.createdAt, 0),
    _add_time: legacyDateTime(dto.createdAt),
    success_time: unixSeconds(dto.succeededAt, 0),
    delivery_id: text(dto.returnTrackingNo),
    delivery_name: text(dto.returnExpressCompanyName),
    delivery_code: text(dto.returnExpressCompanyId),
    delivery_phone: text(dto.returnPhone),
    refund_address: dto.returnAddress
      ? {
          name: text(dto.returnAddress.name),
          phone: text(dto.returnAddress.phone),
          address: text(dto.returnAddress.address),
        }
      : null,
    // `_status` mirrors the order pages' shape so shared components keep working.
    _status: {
      _type: type,
      _title: REFUND_MSG[dto.status] || '',
      _msg: REFUND_MSG[dto.status] || '',
      refund_name: dto.returnAddress ? text(dto.returnAddress.name) : '',
      refund_phone: dto.returnAddress ? text(dto.returnAddress.phone) : '',
      refund_address: dto.returnAddress ? text(dto.returnAddress.address) : '',
    },
    logs: mapList(dto.logs, (l) => ({
      status: text(l.toStatus),
      msg: text(l.message),
      add_time: unixSeconds(l.createdAt, 0),
      _add_time: legacyDateTime(l.createdAt),
    })),
    express_list: [],
  };
}

export function toLegacyRefundList(dto) {
  return pagedList(dto, toLegacyRefund);
}

/** `GET /api/v1/refund-reasons` → the picker's bare string array. */
export function toLegacyRefundReasons(dto) {
  return mapList(dto && dto.items, (r) => text(r));
}

/**
 * `GET /api/v1/refunds/applicable-items/:orderId` → the 申请退款 商品列表.
 * `surplus_num` is the quantity still refundable; the page clamps its stepper to it.
 */
export function toLegacyApplicableItems(dto) {
  if (!dto) return { cartInfo: [], order_id: '', pay_price: '0.00' };
  return {
    order_id: text(dto.orderId),
    order_no: text(dto.orderNo),
    pay_price: money(dto.paidAmount),
    refunded_price: money(dto.refundedAmount),
    refundable_price: money(dto.refundableAmount),
    postage_price: money(dto.freightAmount),
    freight_refundable: !!dto.freightRefundable,
    cartInfo: mapList(dto.items, (item) => ({
      id: toId(item.orderItemId),
      cart_id: toId(item.orderItemId),
      unique: text(item.orderItemId),
      cart_num: toInt(item.quantity, 1),
      refund_num: toInt(item.refundedQuantity, 0),
      delivery_num: toInt(item.shippedQuantity, 0),
      surplus_num: toInt(item.refundableQuantity, 0),
      numShow: toInt(item.refundableQuantity, 0),
      checked: false,
      textarea: '',
      truePrice: money(item.unitPrice),
      sum_price: money(item.totalAmount),
      postage_price: money(item.refundableAmount),
      blocked_reason: text(item.blockedReason),
      productInfo: {
        store_name: text(item.productName),
        image: text(item.productImageUrl),
        price: money(item.unitPrice),
        ...(text(item.specText)
          ? {
              attrInfo: {
                suk: text(item.specText).split('|').join(','),
                image: text(item.productImageUrl),
                price: money(item.unitPrice),
              },
            }
          : {}),
      },
    })),
  };
}

/** Legacy 申请退款 body → `POST /api/v1/refunds`. */
export function fromLegacyRefundApplyInput(orderId, data) {
  const src = data || {};
  const lines = list(src.cart_ids !== undefined ? src.cart_ids : src.lines).map((line) => {
    if (line && typeof line === 'object') {
      return {
        orderItemId: String(line.cart_id !== undefined ? line.cart_id : line.orderItemId),
        quantity: toInt(line.cart_num !== undefined ? line.cart_num : line.quantity, 1),
      };
    }
    return { orderItemId: String(line), quantity: 1 };
  });
  return {
    orderId: String(orderId),
    kind: toInt(src.refund_type, 1) === 1 ? 'refund_only' : 'return_and_refund',
    lines,
    reason: text(src.text || src.refund_reason),
    explanation: text(src.explain || src.refund_explain),
    images: list(src.refund_img).map((u) => text(u)),
    includeFreight: !!src.is_refund_freight,
  };
}

/** Legacy 退货物流 body → `POST /api/v1/refunds/:id/return-shipment`. */
export function fromLegacyReturnShipmentInput(data) {
  const src = data || {};
  return {
    expressCompanyId: String(src.delivery_code || src.expressCompanyId || ''),
    trackingNo: String(src.delivery_id || src.trackingNo || ''),
    phone: String(src.delivery_phone || src.phone || ''),
  };
}

/** Legacy 我的售后 tab → `state`. */
export function fromLegacyRefundState(type) {
  const n = toInt(type, -1);
  if (n === 0) return 'open';
  if (n === 1) return 'succeeded';
  if (n === 2) return 'closed';
  return 'all';
}
