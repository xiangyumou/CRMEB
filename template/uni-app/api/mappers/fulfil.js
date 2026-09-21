// 物流 / 发票 DTOs → the legacy view models.
//
// Contracts:
//   next/packages/contracts/src/order/order.fulfil.contract.ts   (shipments, tracking, 收货)
//   next/packages/contracts/src/order/order.invoice.contract.ts  (invoices)
//
// Two things changed shape here and the mappers exist to hide it:
//
//  1. **An order can have several parcels.** Legacy put one `delivery_id` /
//     `delivery_name` pair on the order row; the new model has a `shipments`
//     collection and the trace feed hangs off a shipment, not the order. The
//     物流 page only ever renders one parcel, so `toLegacyExpressView` picks the
//     latest dispatched one and flattens it back onto the order.
//  2. **Invoices are manual and have no address book.** B2 froze the header
//     onto the request (`order.invoice.contract.ts`), so an invoice is a
//     request with a status rather than a row in 抬头管理.

import {
  toId,
  toInt,
  money,
  text,
  list,
  mapList,
  pagedList,
  unixSeconds,
  legacyDateTime,
} from './_shared.js';
import { toLegacyOrderDetail } from './order.js';

// ---------------------------------------------------------------------------
// shipments
// ---------------------------------------------------------------------------

/** `shipmentDeliveryMode` → the legacy `delivery_type` string the pages compare with. */
export function legacyDeliveryType(mode) {
  if (mode === 'merchant_delivery') return 'send';
  if (mode === 'virtual') return 'fictitious';
  if (mode === 'express') return 'express';
  return '';
}

/** One `shipmentLine` → a `cart_info`-shaped row, so 包裹 lists reuse the goods component. */
export function toLegacyShipmentLine(dto) {
  if (!dto) return {};
  const spec = text(dto.specText).split('|').join(',');
  return {
    id: toId(dto.orderItemId),
    cart_id: toId(dto.orderItemId),
    unique: text(dto.orderItemId),
    cart_num: toInt(dto.quantity, 1),
    // The parcel does not carry money; the page adds `truePrice` from the order.
    truePrice: '0.00',
    postage_price: 0,
    productInfo: {
      store_name: text(dto.productName),
      image: text(dto.productImageUrl),
      ...(spec ? { attrInfo: { suk: spec, image: text(dto.productImageUrl) } } : {}),
    },
  };
}

/** `shipment` → the flat 发货信息 the old order row carried. */
export function toLegacyShipment(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    shipment_id: text(dto.id),
    order_id: text(dto.orderId),
    delivery_sn: text(dto.shipmentNo),
    delivery_type: legacyDeliveryType(dto.deliveryMode),
    status: text(dto.status),
    is_cancel: dto.status === 'cancelled' ? 1 : 0,
    delivery_id: text(dto.trackingNo),
    delivery_name: text(dto.expressCompanyName || dto.courierName),
    delivery_code: text(dto.expressCompanyId),
    delivery_uid: 0,
    sh_delivery_name: text(dto.courierName),
    sh_delivery_id: text(dto.courierPhone),
    fictitious_content: text(dto.virtualContent),
    remark: text(dto.remark),
    delivery_time: unixSeconds(dto.dispatchedAt, 0),
    _delivery_time: legacyDateTime(dto.dispatchedAt),
    receive_time: unixSeconds(dto.deliveredAt, 0),
    cartInfo: mapList(dto.lines, toLegacyShipmentLine),
  };
}

export function toLegacyShipmentList(dto) {
  return mapList(dto && dto.items, toLegacyShipment);
}

/**
 * The parcel the 物流 page should show: the most recent one that was not cancelled,
 * falling back to the most recent of any kind. `items` is oldest-first.
 */
export function pickShipment(dto) {
  const items = list(dto && dto.items);
  if (!items.length) return null;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i] && items[i].status !== 'cancelled') return items[i];
  }
  return items[items.length - 1];
}

/** kdniao's `deliverystatus`, which the old payload carried and a few pages still read. */
const DELIVERY_STATE = { unknown: 0, in_transit: 1, delivering: 2, delivered: 3, exception: 5 };

/** One trace step → `{time, status}`, the two keys the 物流 timeline renders. */
export function toLegacyTrace(dto) {
  if (!dto) return { time: '', status: '' };
  return { time: legacyDateTime(dto.at), status: text(dto.context) };
}

/** `shipmentTracking` → the legacy `express` blob (`{status, msg, result}`). */
export function toLegacyTracking(dto) {
  if (!dto) {
    return { status: 0, msg: '', result: { number: '', type: '', expName: '', list: [], deliverystatus: 0, issign: 0 } };
  }
  return {
    status: dto.available ? 1 : 0,
    msg: dto.available ? '' : '暂无物流信息',
    result: {
      number: text(dto.trackingNo),
      type: text(dto.expressCompanyName),
      expName: text(dto.expressCompanyName),
      expPhone: '',
      logo: '',
      courier: '',
      courierPhone: '',
      updateTime: legacyDateTime(dto.queriedAt),
      takeTime: '',
      deliverystatus: DELIVERY_STATE[dto.state] === undefined ? 0 : DELIVERY_STATE[dto.state],
      issign: dto.state === 'delivered' ? 1 : 0,
      list: mapList(dto.traces, toLegacyTrace),
    },
  };
}

/**
 * `{order, express}` — what `express()` / `adminExpress()` resolve with.
 *
 * `orderView` is already a legacy order (the caller maps it with the storefront or
 * the staff mapper), so this only flattens the parcel back onto it.
 */
export function toLegacyExpressView(orderView, shipmentDto, trackingDto) {
  const order = Object.assign({}, orderView || {});
  const parcel = shipmentDto ? toLegacyShipment(shipmentDto) : null;
  if (parcel) {
    order.delivery_id = parcel.delivery_id;
    order.delivery_name = parcel.delivery_name;
    order.delivery_type = parcel.delivery_type;
    order.delivery_time = parcel.delivery_time;
  }
  if (!list(order.cartInfo).length && parcel) order.cartInfo = parcel.cartInfo;
  return { order, express: toLegacyTracking(trackingDto), shipment: parcel };
}

/** `GET /api/v1/orders/:id` → the order half of the 物流 view. */
export function toLegacyExpressOrder(dto) {
  return toLegacyOrderDetail(dto);
}

// ---------------------------------------------------------------------------
// invoices
// ---------------------------------------------------------------------------

/** Legacy `header_type`: 1 个人 / 2 企业. `type`: 1 普通 / 2 专用. */
export function toLegacyInvoice(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    invoice_id: text(dto.id),
    order_id: text(dto.orderId),
    order_no: text(dto.orderNo),
    uid: toId(dto.userId),
    status: text(dto.status),
    is_invoice: dto.status === 'issued' ? 1 : 0,
    header_type: dto.headerType === 'company' ? 2 : 1,
    type: dto.invoiceType === 'special' ? 2 : 1,
    name: text(dto.name),
    duty_number: text(dto.dutyNumber),
    drawer_phone: text(dto.drawerPhone),
    email: text(dto.email),
    tell: text(dto.registeredTel),
    address: text(dto.registeredAddress),
    bank: text(dto.bankName),
    card_number: text(dto.bankAccount),
    pay_price: money(dto.amount),
    invoice_number: text(dto.invoiceNumber),
    unique_num: text(dto.invoiceNumber),
    red_invoice_num: '',
    remark: text(dto.remark),
    add_time: legacyDateTime(dto.createdAt),
    invoice_time: legacyDateTime(dto.issuedAt),
    is_default: 0,
    // The 发票记录 row renders the order underneath. Only the total is known here;
    // the line items are not part of the invoice contract (see docs/rewrite/cr/CR-4-h.md).
    order: {
      order_id: text(dto.orderId),
      order_no: text(dto.orderNo),
      pay_price: money(dto.amount),
      cartInfo: [],
    },
  };
}

/** `GET /api/v1/invoices` → the bare array the 发票记录 list pages through. */
export function toLegacyInvoiceList(dto) {
  return mapList(dto && dto.items, toLegacyInvoice);
}

export function toLegacyInvoicePage(dto) {
  return pagedList(dto, toLegacyInvoice);
}

/** Legacy 抬头 fields → `POST /api/v1/orders/:id/invoice`. */
export function fromLegacyInvoiceRequest(data) {
  const src = data || {};
  const body = {
    headerType: toInt(src.header_type, 1) === 2 ? 'company' : 'personal',
    invoiceType: toInt(src.type, 1) === 2 ? 'special' : 'plain',
    name: text(src.name),
  };
  const optional = {
    dutyNumber: src.duty_number,
    drawerPhone: src.drawer_phone,
    email: src.email,
    registeredTel: src.tell,
    registeredAddress: src.address,
    bankName: src.bank,
    bankAccount: src.card_number,
    remark: src.remark,
  };
  for (const key of Object.keys(optional)) {
    const value = optional[key];
    if (value !== undefined && value !== null && value !== '') body[key] = String(value);
  }
  return body;
}
