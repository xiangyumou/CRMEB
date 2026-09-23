// refund DTOs → the 退款 / 售后 view models.
//
// Contract: packages/contracts/src/refund/refund.storefront.contract.ts
//
// The page's `refund_type`, as every page stamps it (user_return_list, order_details,
// the staff refund pages): 1 仅退款申请中 · 2 退货退款申请中 · 3 已拒绝 · 4 待退货 ·
// 5 退货待收货 / 退款中 · 6 已退款 · 0 no live application (撤销 / 关闭).
// The first version numbered 0–5 from 待审核, so a succeeded refund stamped
// 待退货 and a pending one stamped nothing.

import { toId, toInt, money, text, list, mapList, pagedList, unixSeconds, pageDateTime } from './_shared.js';

const REFUND_TYPE = {
  applied: 1,
  rejected: 3,
  approved: 4,
  returned: 5,
  refunding: 5,
  succeeded: 6,
  cancelled: 0,
  closed: 0,
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

export function pageRefundType(status, returnStage, kind) {
  // A pending 退货退款 is 2, a pending 仅退款 1 — the staff page audits them differently.
  if (status === 'applied') return kind === 'return_and_refund' ? 2 : 1;
  if (status === 'approved' && returnStage === 'shipped_back') return 5;
  const t = REFUND_TYPE[status];
  return t === undefined ? 0 : t;
}

/** `refundItem` → one `cart_info` row. */
export function toPageRefundLine(dto) {
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
export function toPageRefund(dto) {
  if (!dto) return {};
  const type = pageRefundType(dto.status, dto.returnStage, dto.kind);
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
    // 0 仅退款 / 1 退货退款 — the flag the list filters on
    refund_kind: dto.kind === 'return_and_refund' ? 1 : 0,
    cart_info: mapList(dto.items, toPageRefundLine),
    add_time: unixSeconds(dto.createdAt, 0),
    _add_time: pageDateTime(dto.createdAt),
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
      _add_time: pageDateTime(l.createdAt),
    })),
    express_list: [],
  };
}

export function toPageRefundList(dto) {
  return pagedList(dto, toPageRefund);
}

/** `GET /api/v1/refund-reasons` → the picker's bare string array. */
export function toPageRefundReasons(dto) {
  return mapList(dto && dto.items, (r) => text(r));
}

/**
 * `GET /api/v1/refunds/applicable-items/:orderId` → the 申请退款 商品列表.
 * `surplus_num` is the quantity still refundable; the page clamps its stepper to it.
 */
export function toPageApplicableItems(dto) {
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

/** The page's 申请退款 body → `POST /api/v1/refunds`. */
export function fromPageRefundApplyInput(orderId, data) {
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

/** The page's 退货物流 body → `POST /api/v1/refunds/:id/return-shipment`. */
export function fromPageReturnShipmentInput(data) {
  const src = data || {};
  return {
    expressCompanyId: String(src.delivery_code || src.expressCompanyId || ''),
    trackingNo: String(src.delivery_id || src.trackingNo || ''),
    phone: String(src.delivery_phone || src.phone || ''),
  };
}

/**
 * The 售后 list tab → the refunds `state` filter. `user_return_list` sends the
 * tab index as `refund_status`: 0 全部 · 1 申请中 · 2 已退款.
 */
export function fromPageRefundState(tab) {
  const n = toInt(tab, -1);
  if (n === 1) return 'open';
  if (n === 2) return 'succeeded';
  return 'all';
}
