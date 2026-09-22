import { z } from 'zod';
import {
  clientPlatform,
  id,
  instant,
  money,
  pageQuery,
  paged,
  sortQuery,
} from '../_conventions/common';
import {
  orderFulfillmentStatus,
  orderItem,
  orderItemExample,
  orderKind,
  orderListItem,
  orderListItemExample,
  orderReceiver,
  orderReceiverExample,
  orderRefundStatus,
  orderStatus,
} from './schemas';

/**
 * Fulfilment, the admin order console, invoices and the mobile staff console.
 *
 * B1 owns `schemas.ts` (the shopper's view of an order); this file is stream
 * B2's half of the same domain and only ever *extends* B1's shapes, never
 * rewrites them — `adminOrderListItem` is `orderListItem` plus the columns an
 * operator needs, so a field added to the storefront order appears in the
 * console for free.
 *
 * Three things are worth reading before the rest:
 *
 *  1. **There is no order splitting.** A partial shipment is a `shipment` that
 *     covers some `shipmentLines`; progress lives on `orderItem.shippedQuantity`
 *     and rolls up into `orders.fulfillment_status`. The legacy parent/child
 *     cascade (`StoreOrderServices.php:1064-1076`) has no successor, and the
 *     uni-app's `split_cart_info` / `split_delivery` calls never had a route to
 *     begin with — stream H should delete them.
 *  2. **The fulfilment enum is spelled `unfulfilled / partially_fulfilled /
 *     fulfilled`**, matching the frozen `orders_fulfillment_status` PostgreSQL
 *     enum, not the brief's prose `unshipped / partially_shipped / shipped`.
 *  3. **Virtual goods are never shipped by hand except `virtual_manual`.** Card
 *     keys and coupon goods are delivered by the paid hook, one card per order
 *     item, and the resulting `shipment` carries `deliveryMode: 'virtual'`.
 */

// ---------------------------------------------------------------------------
// shipments
// ---------------------------------------------------------------------------

/** Mirrors `shipments_delivery_mode`. Legacy `delivery_type` express / send / fictitious. */
export const shipmentDeliveryMode = z.enum(['express', 'merchant_delivery', 'virtual']);
export type ShipmentDeliveryMode = z.infer<typeof shipmentDeliveryMode>;

/** Mirrors `shipments_status`. */
export const shipmentStatus = z.enum(['dispatched', 'delivered', 'cancelled']);
export type ShipmentStatus = z.infer<typeof shipmentStatus>;

/** One order line, as far as it travelled in one dispatch. */
export const shipmentLine = z.object({
  orderItemId: id,
  itemKey: z.string(),
  productName: z.string(),
  productImageUrl: z.string(),
  specText: z.string(),
  quantity: z.number().int().min(1),
});
export type ShipmentLine = z.infer<typeof shipmentLine>;

export const shipment = z.object({
  id,
  orderId: id,
  shipmentNo: z.string(),
  deliveryMode: shipmentDeliveryMode,
  status: shipmentStatus,
  /** `express` only. */
  expressCompanyId: id.nullable(),
  expressCompanyName: z.string().nullable(),
  trackingNo: z.string().nullable(),
  /** `merchant_delivery` only. */
  courierName: z.string().nullable(),
  courierPhone: z.string().nullable(),
  /** `virtual` only: the card key, the coupon note or the text handed to the buyer. */
  virtualContent: z.string().nullable(),
  remark: z.string().nullable(),
  dispatchedAt: instant,
  deliveredAt: instant.nullable(),
  cancelledAt: instant.nullable(),
  lines: z.array(shipmentLine),
});
export type Shipment = z.infer<typeof shipment>;

export const shipmentLineExample = {
  orderItemId: '7001',
  itemKey: 'sku-21',
  productName: '有机三只松鼠坚果礼盒',
  productImageUrl: 'https://cdn.example.com/p/11.jpg',
  specText: '混合装|1000g',
  quantity: 2,
} satisfies ShipmentLine;

export const shipmentExample = {
  id: '4001',
  orderId: '9001',
  shipmentNo: 'SH20260201100000001234',
  deliveryMode: 'express',
  status: 'dispatched',
  expressCompanyId: '12',
  expressCompanyName: '顺丰速运',
  trackingNo: 'SF1234567890123',
  courierName: null,
  courierPhone: null,
  virtualContent: null,
  remark: null,
  dispatchedAt: '2026-02-02T09:00:00+08:00',
  deliveredAt: null,
  cancelledAt: null,
  lines: [shipmentLineExample],
} satisfies Shipment;

/**
 * What an operator (or a staff member) fills in on 发货.
 *
 * `lines` empty means "everything still outstanding on this order", which is
 * what the 一键发货 button sends. A partial shipment names the lines and the
 * quantities; the server refuses anything above `quantity - shipped - refunded`
 * with `ORDER_SHIP_QUANTITY_EXCEEDED`.
 */
const shipInput = z.object({
  deliveryMode: shipmentDeliveryMode,
  lines: z
    .array(z.object({ orderItemId: id, quantity: z.number().int().min(1).max(9999) }))
    .max(200)
    .default([]),
  /** `express`. */
  expressCompanyId: id.optional(),
  trackingNo: z.string().min(1).max(64).optional(),
  /** `merchant_delivery`. */
  courierName: z.string().min(1).max(64).optional(),
  courierPhone: z.string().min(1).max(20).optional(),
  /** `virtual`: free text the buyer will see. Card keys and coupons are delivered automatically. */
  virtualContent: z.string().min(1).max(2000).optional(),
  remark: z.string().max(255).optional(),
});

/**
 * The CHECK constraints `shipments_express_needs_tracking` and
 * `shipments_virtual_needs_content` live in the database; repeating them here
 * means the operator is told in the form rather than by a 500.
 */
function shipShapeIsConsistent(body: z.infer<typeof shipInput>): boolean {
  if (body.deliveryMode === 'express') {
    return body.expressCompanyId !== undefined && body.trackingNo !== undefined;
  }
  if (body.deliveryMode === 'merchant_delivery') {
    return body.courierName !== undefined && body.courierPhone !== undefined;
  }
  return body.virtualContent !== undefined;
}

const shipShapeMessage =
  '快递发货需要物流公司和运单号，商家配送需要配送人和电话，虚拟发货需要发货内容';

export const shipBody = shipInput.refine(shipShapeIsConsistent, {
  message: shipShapeMessage,
  path: ['deliveryMode'],
});
export type ShipBody = z.infer<typeof shipBody>;

export const shipBodyExample = {
  deliveryMode: 'express',
  lines: [],
  expressCompanyId: '12',
  trackingNo: 'SF1234567890123',
} satisfies z.input<typeof shipBody>;

/**
 * 修改发货信息. Only the transport details change — never which lines went out,
 * because that is what `shipment_items` and `shippedQuantity` already agreed on.
 * Correcting the lines means cancelling the shipment and shipping again.
 */
export const shipmentUpdateBody = z.object({
  expressCompanyId: id.optional(),
  trackingNo: z.string().min(1).max(64).optional(),
  courierName: z.string().min(1).max(64).optional(),
  courierPhone: z.string().min(1).max(20).optional(),
  remark: z.string().max(255).optional(),
});
export type ShipmentUpdateBody = z.infer<typeof shipmentUpdateBody>;

export const shipmentCancelBody = z.object({
  reason: z.string().max(255).optional(),
});
export type ShipmentCancelBody = z.infer<typeof shipmentCancelBody>;

/**
 * One step of a courier's tracking feed, from stream F2's logistics index.
 *
 * `available: false` is the honest answer while no logistics provider is
 * configured: the shipment and its tracking number are still shown, the trace
 * list is simply empty. Legacy returned an empty array either way and the UI
 * could not tell "not configured" from "not scanned yet".
 */
export const shipmentTrace = z.object({
  at: instant,
  context: z.string(),
});
export type ShipmentTrace = z.infer<typeof shipmentTrace>;

export const shipmentTracking = z.object({
  shipmentId: id,
  shipmentNo: z.string(),
  expressCompanyName: z.string().nullable(),
  trackingNo: z.string().nullable(),
  /** `available: false` means no provider answered; `traces` is then empty. */
  available: z.boolean(),
  state: z.enum(['unknown', 'in_transit', 'delivering', 'delivered', 'exception']),
  traces: z.array(shipmentTrace),
  queriedAt: instant,
});
export type ShipmentTracking = z.infer<typeof shipmentTracking>;

export const shipmentTrackingExample = {
  shipmentId: '4001',
  shipmentNo: 'SH20260201100000001234',
  expressCompanyName: '顺丰速运',
  trackingNo: 'SF1234567890123',
  available: true,
  state: 'in_transit',
  traces: [
    { at: '2026-02-02T09:30:00+08:00', context: '快件已从杭州转运中心发出' },
    { at: '2026-02-02T09:05:00+08:00', context: '顺丰速运 已收取快件' },
  ],
  queriedAt: '2026-02-02T12:00:00+08:00',
} satisfies ShipmentTracking;

// The 快递公司 picker shape moved to `contracts/src/shipping/schemas.ts`
// (`expressCompany` / `expressCompanyList` / `expressCompanyListExample`) when
// stream F2 took the two routes over — CR-1-b2, settled. Import it from there.

// ---------------------------------------------------------------------------
// the order timeline
// ---------------------------------------------------------------------------

/** Mirrors `order_status_logs_change_type`. Frozen: a new value needs a migration. */
export const orderChangeType = z.enum([
  'created',
  'paid',
  'pay_failed',
  'cancelled',
  'auto_cancelled',
  'price_adjusted',
  'address_updated',
  'remark_updated',
  'shipped',
  'shipment_cancelled',
  'shipment_updated',
  'virtual_delivered',
  'received',
  'auto_received',
  'reviewed',
  'completed',
  'refund_applied',
  'refund_approved',
  'refund_rejected',
  'refund_cancelled',
  'refund_succeeded',
  'refund_failed',
  'coupon_returned',
  'coupon_granted',
  'invoice_requested',
  'invoice_issued',
  'invoice_rejected',
  'groupbuy_joined',
  'groupbuy_succeeded',
  'groupbuy_failed',
  'hidden_by_user',
  'deleted_by_admin',
]);
export type OrderChangeType = z.infer<typeof orderChangeType>;

export const orderOperatorKind = z.enum(['system', 'user', 'admin', 'gateway']);
export type OrderOperatorKind = z.infer<typeof orderOperatorKind>;

export const orderStatusLogEntry = z.object({
  id,
  changeType: orderChangeType,
  fromStatus: orderStatus.nullable(),
  toStatus: orderStatus.nullable(),
  message: z.string().nullable(),
  operatorKind: orderOperatorKind,
  /** The admin's or the buyer's display name, resolved for the timeline. */
  operatorName: z.string().nullable(),
  createdAt: instant,
});
export type OrderStatusLogEntry = z.infer<typeof orderStatusLogEntry>;

export const orderTimeline = z.object({ items: z.array(orderStatusLogEntry) });
export type OrderTimeline = z.infer<typeof orderTimeline>;

export const orderStatusLogExample = {
  id: '5001',
  changeType: 'shipped',
  fromStatus: 'paid',
  toStatus: 'shipped',
  message: '顺丰速运 SF1234567890123',
  operatorKind: 'admin',
  operatorName: '超级管理员',
  createdAt: '2026-02-02T09:00:00+08:00',
} satisfies OrderStatusLogEntry;

// ---------------------------------------------------------------------------
// the admin order console
// ---------------------------------------------------------------------------

/** Just enough of the buyer for the list row and the 客户信息 panel. */
export const orderUserBrief = z.object({
  id,
  nickname: z.string(),
  avatarUrl: z.string().nullable(),
  phone: z.string().nullable(),
});
export type OrderUserBrief = z.infer<typeof orderUserBrief>;

export const orderUserBriefExample = {
  id: '2001',
  nickname: '张三',
  avatarUrl: 'https://cdn.example.com/avatar/2001.jpg',
  phone: '13800138000',
} satisfies OrderUserBrief;

/**
 * The console list row: B1's `orderListItem` plus who bought it, where it goes
 * and how far it got.
 */
export const adminOrderListItem = orderListItem.extend({
  platform: clientPlatform,
  user: orderUserBrief,
  receiver: orderReceiver,
  refundedAmount: money,
  buyerRemark: z.string().nullable(),
  adminRemark: z.string().nullable(),
  /** `null` when the buyer never asked for one. */
  invoiceStatus: z.enum(['requested', 'issued', 'rejected', 'cancelled']).nullable(),
  paidAt: instant.nullable(),
  shippedAt: instant.nullable(),
  receivedAt: instant.nullable(),
  completedAt: instant.nullable(),
  cancelledAt: instant.nullable(),
  /** Soft-deleted by an operator. The list only shows these with `deleted: true`. */
  deletedAt: instant.nullable(),
});
export type AdminOrderListItem = z.infer<typeof adminOrderListItem>;

export const adminOrderListItemExample = {
  ...orderListItemExample,
  status: 'paid',
  paidAmount: '118.00',
  payExpiresAt: null,
  platform: 'wechat-mini',
  user: orderUserBriefExample,
  receiver: orderReceiverExample,
  refundedAmount: '0.00',
  buyerRemark: '请在工作日送达',
  adminRemark: null,
  invoiceStatus: null,
  paidAt: '2026-02-01T10:03:00+08:00',
  shippedAt: null,
  receivedAt: null,
  completedAt: null,
  cancelledAt: null,
  deletedAt: null,
} satisfies AdminOrderListItem;

export const adminOrderDetail = adminOrderListItem.extend({
  customForm: z.record(z.string(), z.unknown()).nullable(),
  userCouponId: id.nullable(),
  cancelReason: z.string().nullable(),
  /** Operator cost total, for the margin column. Never sent to the staff surface. */
  costAmount: money.nullable(),
  transactionNo: z.string().nullable(),
  /** Deadline for `shipped -> received`; the auto-receive job reads it. */
  autoReceiveAt: instant.nullable(),
  shipments: z.array(shipment),
  /** Live after-sales on this order, for the 退款 link into stream C's pages. */
  refundIds: z.array(id),
});
export type AdminOrderDetail = z.infer<typeof adminOrderDetail>;

export const adminOrderDetailExample = {
  ...adminOrderListItemExample,
  customForm: null,
  userCouponId: '9001',
  cancelReason: null,
  costAmount: '70.00',
  transactionNo: '4200001234202602011234567890',
  autoReceiveAt: null,
  shipments: [],
  refundIds: [],
} satisfies AdminOrderDetail;

/**
 * The legacy filter set, one query key per filter.
 *
 * Legacy packed 待发货 / 待收货 / 已完成 into a single `status` integer that
 * mixed `status`, `paid`, `refund_status` and `is_del` together, which is why
 * 已退款 and 待收货 could never be asked for at once. Here every axis is its
 * own key and the console's tab bar is a preset over them.
 */
export const adminOrderListQuery = pageQuery
  .extend({
    status: z.union([orderStatus, z.array(orderStatus)]).optional(),
    fulfillmentStatus: z
      .union([orderFulfillmentStatus, z.array(orderFulfillmentStatus)])
      .optional(),
    refundStatus: z.union([orderRefundStatus, z.array(orderRefundStatus)]).optional(),
    kind: orderKind.optional(),
    platform: clientPlatform.optional(),
    /** Order number, receiver name, receiver phone or a product name in the order. */
    keyword: z.string().max(64).optional(),
    userId: id.optional(),
    createdFrom: instant.optional(),
    createdTo: instant.optional(),
    paidFrom: instant.optional(),
    paidTo: instant.optional(),
    /** `true` lists the soft-deleted orders instead of the live ones. Legacy `is_system_del`. */
    deleted: z.stringbool().default(false),
  })
  .extend(sortQuery(['id', 'createdAt', 'paidAt', 'payableAmount']).shape);
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuery>;

export const pagedAdminOrders = paged(adminOrderListItem);

export const orderIdParams = z.object({ id });
export const shipmentIdParams = z.object({ id });

// ---------------------------------------------------------------------------
// console actions
// ---------------------------------------------------------------------------

export const orderRemarkBody = z.object({
  adminRemark: z.string().max(512),
});
export type OrderRemarkBody = z.infer<typeof orderRemarkBody>;

/**
 * 改价, before payment only.
 *
 * The operator names a **discount** and, optionally, a new freight amount; the
 * server recomputes `payableAmount` through the same arithmetic B1 prices with
 * (`payableOf` + `distribute`) and re-splits the per-line shares so that
 * `sum(order_items.discount_amount) === orders.coupon_discount` still holds to
 * the fen. Legacy let the operator type the final total and then wrote it
 * straight onto `pay_price`, leaving the line shares stale and every later
 * partial refund wrong — that is the defect this shape exists to remove, so
 * there is deliberately no "set the total" field.
 */
export const orderPriceBody = z.object({
  /** Taken off the goods total, on top of any coupon. `"0.00"` undoes a previous change. */
  operatorDiscount: money,
  /** Replaces the freight. Omit to keep what the freight rule quoted. */
  freightAmount: money.optional(),
  reason: z.string().max(255).optional(),
});
export type OrderPriceBody = z.infer<typeof orderPriceBody>;

/** 修改收货地址. The snapshot on the order changes; the buyer's address book does not. */
export const orderAddressBody = z.object({
  name: z.string().min(1).max(32),
  phone: z.string().min(1).max(20),
  province: z.string().min(1).max(64),
  city: z.string().min(1).max(64),
  district: z.string().max(64).optional(),
  detail: z.string().min(1).max(255),
  postCode: z.string().max(10).optional(),
});
export type OrderAddressBody = z.infer<typeof orderAddressBody>;

export const orderDeletionsBody = z.object({
  ids: z.array(id).min(1).max(100),
});
export type OrderDeletionsBody = z.infer<typeof orderDeletionsBody>;

export const orderDeletionsResult = z.object({
  /** Orders actually soft-deleted. An order still in flight is skipped, not refused. */
  deleted: z.number().int().min(0),
  skippedIds: z.array(id),
});
export type OrderDeletionsResult = z.infer<typeof orderDeletionsResult>;

// ---------------------------------------------------------------------------
// statistics header and export
// ---------------------------------------------------------------------------

/**
 * The numbers above the console table.
 *
 * The four `pending*` counters are live, whole-shop totals — an operator uses
 * them as a work queue, so they deliberately ignore the date range. Everything
 * under `range` is the selected window.
 */
export const orderStatistics = z.object({
  pendingShipment: z.number().int().min(0),
  pendingReceipt: z.number().int().min(0),
  refunding: z.number().int().min(0),
  pendingInvoice: z.number().int().min(0),
  range: z.object({ from: instant, to: instant }),
  orderCount: z.number().int().min(0),
  paidOrderCount: z.number().int().min(0),
  paidAmount: money,
  refundedAmount: money,
});
export type OrderStatistics = z.infer<typeof orderStatistics>;

export const orderStatisticsExample = {
  pendingShipment: 12,
  pendingReceipt: 30,
  refunding: 2,
  pendingInvoice: 1,
  range: { from: '2026-02-01T00:00:00+08:00', to: '2026-02-02T00:00:00+08:00' },
  orderCount: 48,
  paidOrderCount: 41,
  paidAmount: '5320.00',
  refundedAmount: '118.00',
} satisfies OrderStatistics;

export const orderStatisticsQuery = z.object({
  from: instant.optional(),
  to: instant.optional(),
});
export type OrderStatisticsQuery = z.infer<typeof orderStatisticsQuery>;

/**
 * 导出.
 *
 * The rows come back as CSV text inside the JSON response rather than as a
 * binary stream: `handle()` validates every response against its contract, so
 * a route cannot answer with a file, and the admin kit turns `content` into a
 * download client-side. Bounded by `exportMaxRows` in the `order` config group
 * (2000 by default) — `truncated` says when the window was wider than that.
 * XLSX and a real streamed download wait for F1's storage (CR-2-b2).
 */
export const orderExportResult = z.object({
  filename: z.string(),
  contentType: z.literal('text/csv'),
  rowCount: z.number().int().min(0),
  truncated: z.boolean(),
  /** UTF-8 CSV, header row included. The client prepends a BOM for Excel. */
  content: z.string(),
});
export type OrderExportResult = z.infer<typeof orderExportResult>;

/** Which sheet. `orders` is one row per order, `shipments` one row per dispatched line. */
export const orderExportKind = z.enum(['orders', 'shipments']);

export const orderExportQuery = adminOrderListQuery
  .omit({ page: true, pageSize: true })
  .extend({ kindOfExport: orderExportKind.default('orders') });
export type OrderExportQuery = z.infer<typeof orderExportQuery>;

// ---------------------------------------------------------------------------
// invoices
// ---------------------------------------------------------------------------

/** Mirrors `order_invoices_status`. */
export const invoiceStatus = z.enum(['requested', 'issued', 'rejected', 'cancelled']);
export type InvoiceStatus = z.infer<typeof invoiceStatus>;

/** Mirrors `order_invoices_header_type`. */
export const invoiceHeaderType = z.enum(['personal', 'company']);
export type InvoiceHeaderType = z.infer<typeof invoiceHeaderType>;

/** Mirrors `order_invoices_invoice_type`. */
export const invoiceType = z.enum(['plain', 'special']);
export type InvoiceType = z.infer<typeof invoiceType>;

export const orderInvoice = z.object({
  id,
  orderId: id,
  orderNo: z.string(),
  userId: id,
  status: invoiceStatus,
  headerType: invoiceHeaderType,
  invoiceType,
  name: z.string(),
  dutyNumber: z.string().nullable(),
  drawerPhone: z.string().nullable(),
  email: z.string().nullable(),
  registeredTel: z.string().nullable(),
  registeredAddress: z.string().nullable(),
  bankName: z.string().nullable(),
  bankAccount: z.string().nullable(),
  amount: money,
  invoiceNumber: z.string().nullable(),
  remark: z.string().nullable(),
  issuedAt: instant.nullable(),
  createdAt: instant,
});
export type OrderInvoice = z.infer<typeof orderInvoice>;

export const orderInvoiceExample = {
  id: '3001',
  orderId: '9001',
  orderNo: '202602011000000010123456',
  userId: '2001',
  status: 'requested',
  headerType: 'company',
  invoiceType: 'plain',
  name: '杭州某某科技有限公司',
  dutyNumber: '91330100MA2XXXXX0A',
  drawerPhone: '13800138000',
  email: 'finance@example.com',
  registeredTel: null,
  registeredAddress: null,
  bankName: null,
  bankAccount: null,
  amount: '118.00',
  invoiceNumber: null,
  remark: null,
  issuedAt: null,
  createdAt: '2026-02-03T10:00:00+08:00',
} satisfies OrderInvoice;

/**
 * 申请开票.
 *
 * A 增值税专用发票 needs a duty number and the four bank/registration fields;
 * a personal 普通发票 needs none of them. The rule is written here so the form
 * can enforce it, and again in the service.
 */
const invoiceRequestInput = z.object({
  headerType: invoiceHeaderType,
  invoiceType: invoiceType.default('plain'),
  name: z.string().min(1).max(100),
  dutyNumber: z.string().max(50).optional(),
  drawerPhone: z.string().max(20).optional(),
  email: z.string().email().max(100).optional(),
  registeredTel: z.string().max(30).optional(),
  registeredAddress: z.string().max(255).optional(),
  bankName: z.string().max(100).optional(),
  bankAccount: z.string().max(50).optional(),
  remark: z.string().max(255).optional(),
});

export const invoiceRequestBody = invoiceRequestInput
  .refine((b) => b.headerType !== 'company' || (b.dutyNumber ?? '').length > 0, {
    message: '企业抬头需要填写税号',
    path: ['dutyNumber'],
  })
  .refine(
    (b) =>
      b.invoiceType !== 'special' ||
      ((b.registeredAddress ?? '').length > 0 &&
        (b.registeredTel ?? '').length > 0 &&
        (b.bankName ?? '').length > 0 &&
        (b.bankAccount ?? '').length > 0),
    { message: '专用发票需要填写注册地址、电话、开户行和账号', path: ['registeredAddress'] },
  );
export type InvoiceRequestBody = z.infer<typeof invoiceRequestBody>;

export const invoiceIssueBody = z.object({
  invoiceNumber: z.string().min(1).max(50),
  remark: z.string().max(255).optional(),
});
export type InvoiceIssueBody = z.infer<typeof invoiceIssueBody>;

export const invoiceRejectBody = z.object({
  /** The buyer is told why, so it is not optional. */
  reason: z.string().min(1).max(255),
});
export type InvoiceRejectBody = z.infer<typeof invoiceRejectBody>;

export const myInvoiceListQuery = pageQuery.extend({
  status: z.union([invoiceStatus, z.array(invoiceStatus)]).optional(),
});
export type MyInvoiceListQuery = z.infer<typeof myInvoiceListQuery>;

export const adminInvoiceListQuery = pageQuery
  .extend({
    status: z.union([invoiceStatus, z.array(invoiceStatus)]).optional(),
    headerType: invoiceHeaderType.optional(),
    invoiceType: invoiceType.optional(),
    /** Invoice header, duty number or order number. */
    keyword: z.string().max(64).optional(),
    userId: id.optional(),
    createdFrom: instant.optional(),
    createdTo: instant.optional(),
  })
  .extend(sortQuery(['id', 'createdAt', 'amount']).shape);
export type AdminInvoiceListQuery = z.infer<typeof adminInvoiceListQuery>;

export const pagedInvoices = paged(orderInvoice);

// ---------------------------------------------------------------------------
// the mobile staff console
// ---------------------------------------------------------------------------

/**
 * Who may open the mobile console.
 *
 * Not a role: legacy read the uid list out of the `order_notice_admin_uids`
 * config key and enforced it in `CustomerMiddleware`. Here it is the same list,
 * typed as the `orderStaff` config group, and `auth: 'staff'` in the contract
 * is what `handle()` checks it with.
 */
export const staffIdentity = z.object({
  isStaff: z.boolean(),
  userId: id.nullable(),
  nickname: z.string().nullable(),
});
export type StaffIdentity = z.infer<typeof staffIdentity>;

/** The staff console's own header. No cost, no margin — those stay in the web console. */
export const staffStatistics = z.object({
  pendingShipment: z.number().int().min(0),
  pendingReceipt: z.number().int().min(0),
  refunding: z.number().int().min(0),
  today: z.object({ orderCount: z.number().int().min(0), paidAmount: money }),
  yesterday: z.object({ orderCount: z.number().int().min(0), paidAmount: money }),
  month: z.object({ orderCount: z.number().int().min(0), paidAmount: money }),
});
export type StaffStatistics = z.infer<typeof staffStatistics>;

export const staffStatisticsExample = {
  pendingShipment: 12,
  pendingReceipt: 30,
  refunding: 2,
  today: { orderCount: 48, paidAmount: '5320.00' },
  yesterday: { orderCount: 51, paidAmount: '6180.00' },
  month: { orderCount: 902, paidAmount: '108400.00' },
} satisfies StaffStatistics;

/** The staff list row is the console row without the soft-delete column. */
export const staffOrderListItem = adminOrderListItem.omit({ deletedAt: true });
export type StaffOrderListItem = z.infer<typeof staffOrderListItem>;

export const staffOrderDetail = adminOrderDetail.omit({ deletedAt: true, costAmount: true });
export type StaffOrderDetail = z.infer<typeof staffOrderDetail>;

export const staffOrderListItemExample: StaffOrderListItem = (() => {
  const { deletedAt: _deletedAt, ...rest } = adminOrderListItemExample;
  return rest;
})();

export const staffOrderDetailExample: StaffOrderDetail = (() => {
  const { deletedAt: _deletedAt, costAmount: _costAmount, ...rest } = adminOrderDetailExample;
  return rest;
})();

export const staffOrderListQuery = adminOrderListQuery.omit({ deleted: true });
export type StaffOrderListQuery = z.infer<typeof staffOrderListQuery>;

export const pagedStaffOrders = paged(staffOrderListItem);

/**
 * 同意/拒绝退款, from the phone.
 *
 * The staff console never refunds money itself: it forwards to stream C's
 * `refund.approve` / `refund.reject`, which is the only code allowed to talk to
 * the gateway. The response is C's `refundDetail`, unchanged.
 */
export const staffRefundReviewBody = z.object({
  decision: z.enum(['approve', 'reject']),
  /** Required when rejecting (`refunds_rejected_needs_reason`). */
  reason: z.string().max(255).optional(),
});
export type StaffRefundReviewBody = z.infer<typeof staffRefundReviewBody>;

/** Item-level export of one order's items, for the 打印/核对 sheet on the phone. */
export const orderItemsResult = z.object({ items: z.array(orderItem) });
export const orderItemsResultExample = { items: [orderItemExample] };
