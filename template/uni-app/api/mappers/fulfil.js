// 物流 / 发票 DTOs → the page view models.
//
// Contracts:
//   next/packages/contracts/src/order/order.fulfil.contract.ts   (shipments, tracking, 收货)
//   next/packages/contracts/src/order/order.invoice.contract.ts  (invoices)
//
// Two things changed shape here and the mappers exist to hide it:
//
//  1. **An order can have several parcels.** The pages expect one `delivery_id` /
//     `delivery_name` pair on the order row; the API has a `shipments`
//     collection and the trace feed hangs off a shipment, not the order. The
//     物流 page only ever renders one parcel, so `toPageExpressView` picks the
//     latest dispatched one and flattens it back onto the order.
//  2. **Invoices are manual and have no address book.** The header is frozen
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
  pageDateTime,
} from './_shared.js';
import { toPageOrderDetail } from './order.js';

// ---------------------------------------------------------------------------
// shipments
// ---------------------------------------------------------------------------

/** `shipmentDeliveryMode` → the `delivery_type` string the pages compare with. */
export function pageDeliveryType(mode) {
  if (mode === 'merchant_delivery') return 'send';
  if (mode === 'virtual') return 'fictitious';
  if (mode === 'express') return 'express';
  return '';
}

/** One `shipmentLine` → a `cart_info`-shaped row, so 包裹 lists reuse the goods component. */
export function toPageShipmentLine(dto) {
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

/** `shipment` → the flat 发货信息 the pages read off the order row. */
export function toPageShipment(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    shipment_id: text(dto.id),
    order_id: text(dto.orderId),
    delivery_sn: text(dto.shipmentNo),
    delivery_type: pageDeliveryType(dto.deliveryMode),
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
    _delivery_time: pageDateTime(dto.dispatchedAt),
    receive_time: unixSeconds(dto.deliveredAt, 0),
    cartInfo: mapList(dto.lines, toPageShipmentLine),
  };
}

export function toPageShipmentList(dto) {
  return mapList(dto && dto.items, toPageShipment);
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

/** kdniao's `deliverystatus`, which a few pages read. */
const DELIVERY_STATE = { unknown: 0, in_transit: 1, delivering: 2, delivered: 3, exception: 5 };

/** One trace step → `{time, status}`, the two keys the 物流 timeline renders. */
export function toPageTrace(dto) {
  if (!dto) return { time: '', status: '' };
  return { time: pageDateTime(dto.at), status: text(dto.context) };
}

/** `shipmentTracking` → the page's `express` blob (`{status, msg, result}`). */
export function toPageTracking(dto) {
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
      updateTime: pageDateTime(dto.queriedAt),
      takeTime: '',
      deliverystatus: DELIVERY_STATE[dto.state] === undefined ? 0 : DELIVERY_STATE[dto.state],
      issign: dto.state === 'delivered' ? 1 : 0,
      list: mapList(dto.traces, toPageTrace),
    },
  };
}

/**
 * `{order, express}` — what `express()` / `adminExpress()` resolve with.
 *
 * `orderView` is already a page-shaped order (the caller maps it with the storefront or
 * the staff mapper), so this only flattens the parcel back onto it.
 */
export function toPageExpressView(orderView, shipmentDto, trackingDto) {
  const order = Object.assign({}, orderView || {});
  const parcel = shipmentDto ? toPageShipment(shipmentDto) : null;
  if (parcel) {
    order.delivery_id = parcel.delivery_id;
    order.delivery_name = parcel.delivery_name;
    order.delivery_type = parcel.delivery_type;
    order.delivery_time = parcel.delivery_time;
  }
  if (!list(order.cartInfo).length && parcel) order.cartInfo = parcel.cartInfo;
  return { order, express: toPageTracking(trackingDto), shipment: parcel };
}

/** `GET /api/v1/orders/:id` → the order half of the 物流 view. */
export function toPageExpressOrder(dto) {
  return toPageOrderDetail(dto);
}

// ---------------------------------------------------------------------------
// invoices
// ---------------------------------------------------------------------------

/** The page's `header_type`: 1 个人 / 2 企业. `type`: 1 普通 / 2 专用. */
export function toPageInvoice(dto) {
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
    add_time: pageDateTime(dto.createdAt),
    invoice_time: pageDateTime(dto.issuedAt),
    is_default: 0,
    // The 发票记录 row renders the order underneath. `orderSummary` is the order's
    // first line, read through the order domain rather than copied onto the invoice,
    // so it cannot drift away from the order it describes. `cartInfo` is the one
    // row the template reads; an order with no lines falls back to an empty row.
    order: {
      order_id: text(dto.orderId),
      order_no: text(dto.orderNo),
      pay_price: money(dto.amount),
      total_num: dto.orderSummary ? dto.orderSummary.totalQuantity : 0,
      cartInfo: dto.orderSummary ? [toPageInvoiceLine(dto.orderSummary)] : [],
    },
  };
}

/** `orderSummary` → the single `cartInfo` row 发票记录 draws. */
function toPageInvoiceLine(summary) {
  return {
    cart_num: summary.quantity,
    productInfo: {
      store_name: text(summary.productName),
      image: text(summary.productImageUrl),
      attrInfo: { suk: text(summary.specText) },
    },
  };
}

/** `GET /api/v1/invoices` → the bare array the 发票记录 list pages through. */
export function toPageInvoiceList(dto) {
  return mapList(dto && dto.items, toPageInvoice);
}

export function toPageInvoicePage(dto) {
  return pagedList(dto, toPageInvoice);
}

/** The page's 抬头 fields → `POST /api/v1/orders/:id/invoice`. */
export function fromPageInvoiceRequest(data) {
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
