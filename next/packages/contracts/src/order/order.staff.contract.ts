import { z } from 'zod';
import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  adminRefundDetail,
  adminRefundDetailExample,
  adminRefundExample,
  adminRefundListQuery,
  pagedAdminRefunds,
} from '../refund/schemas';
import {
  orderAddressBody,
  orderIdParams,
  orderPriceBody,
  orderRemarkBody,
  orderStatusLogExample,
  orderTimeline,
  pagedStaffOrders,
  shipBody,
  shipBodyExample,
  shipment,
  shipmentExample,
  shipmentIdParams,
  shipmentTracking,
  shipmentTrackingExample,
  staffIdentity,
  staffOrderDetail,
  staffOrderDetailExample,
  staffOrderListItemExample,
  staffOrderListQuery,
  staffRefundRemarkBody,
  staffRefundReviewBody,
  staffStatistics,
  staffStatisticsExample,
  staffStatisticsSeries,
  staffStatisticsSeriesExample,
  staffStatisticsSeriesQuery,
} from './order.fulfil.schemas';

/**
 * 移动端商家管理 — the staff console the shop owner opens inside the mini
 * program.
 *
 * **Who is staff is not a role.** Legacy kept the uid list in the
 * `order_notice_admin_uids` config key and enforced it with
 * `CustomerMiddleware` on the whole `admin` group (`api/route/v1.php:118`).
 * That is reproduced exactly: the list is the `orderStaff` config group, B2
 * registers a `StaffCheck` against it, and `auth: 'staff'` is what every route
 * here declares. No permission atoms — a staff member either has the console or
 * does not.
 *
 * Legacy's group had 37 routes. Nineteen of them were the product and user
 * management screens (`admin/product/*`, `admin/user/*`), which belong to
 * streams A and E1 and are not re-created here. Of the eighteen order routes,
 * three called endpoints that never existed (`split_cart_info`,
 * `split_delivery`, `offline`) — stream H should delete them from
 * `template/uni-app/api/admin.js`, they have always been broken.
 *
 * Every route answers with the same shapes as the web console, minus
 * `costAmount` and the soft-delete column: the phone has no business showing
 * margin, and a staff member cannot delete an order at all.
 */

/** Does this signed-in shopper see the 商家管理 entry at all? `auth: 'user'`, so it never 403s. */
export const staffMe = defineRoute({
  id: 'order.staffMe',
  method: 'GET',
  path: '/api/v1/staff/me',
  auth: 'user',
  summary: '是否为店员',
  tags: ['order'],
  response: staffIdentity,
  examples: [
    {
      name: 'is-staff',
      response: {
        isStaff: true,
        userId: '2001',
        nickname: '张三',
        abilities: { refundReview: false, adjustPrice: false },
      },
    },
    {
      name: 'ordinary-shopper',
      response: {
        isStaff: false,
        userId: '2002',
        nickname: '李四',
        abilities: { refundReview: false, adjustPrice: false },
      },
    },
  ],
});

export const staffStatisticsRoute = defineRoute({
  id: 'order.staffStatistics',
  method: 'GET',
  path: '/api/v1/staff/statistics',
  auth: 'staff',
  summary: '店员首页统计',
  tags: ['order'],
  response: staffStatistics,
  examples: [{ name: 'ok', response: staffStatisticsExample }],
});

/**
 * 统计明细 — the same numbers as the header, grouped by day (CR-4-h §1).
 *
 * The page above this route draws a line chart and a 详细数据 table from one
 * window, and legacy served it from two endpoints (`admin/order/time` for the
 * chart, `admin/order/statistics` for the table) that counted differently:
 * the chart summed `pay_price` over paid orders, the table paginated a
 * per-day aggregate built from a different WHERE. They could and did disagree
 * on the same day. Here both read one series.
 *
 * `from` / `to` are Asia/Shanghai calendar days, both inclusive, and default
 * to the last 30 days. A window wider than 92 days
 * (`STAFF_STATISTICS_MAX_DAYS`) is refused rather than truncated, so a client
 * never charts a silently shortened range.
 */
export const staffStatisticsSeriesRoute = defineRoute({
  id: 'order.staffStatisticsSeries',
  method: 'GET',
  path: '/api/v1/staff/statistics/series',
  auth: 'staff',
  summary: '统计明细（按日）',
  tags: ['order'],
  query: staffStatisticsSeriesQuery,
  response: staffStatisticsSeries,
  errors: ['ORDER_STATISTICS_RANGE_TOO_WIDE'],
  examples: [
    {
      name: 'three-days',
      query: { from: '2026-02-01', to: '2026-02-03', granularity: 'day' },
      response: staffStatisticsSeriesExample,
    },
  ],
});

export const staffOrderList = defineRoute({
  id: 'order.staffOrderList',
  method: 'GET',
  path: '/api/v1/staff/orders',
  auth: 'staff',
  summary: '店员订单列表',
  tags: ['order'],
  query: staffOrderListQuery,
  response: pagedStaffOrders,
  examples: [
    {
      name: 'unshipped',
      query: { page: 1, pageSize: 20, status: 'paid', fulfillmentStatus: 'unfulfilled' },
      response: { items: [staffOrderListItemExample], total: 1, page: 1, pageSize: 20 },
    },
  ],
});

export const staffOrderDetailRoute = defineRoute({
  id: 'order.staffOrderDetail',
  method: 'GET',
  path: '/api/v1/staff/orders/:id',
  auth: 'staff',
  summary: '店员订单详情',
  tags: ['order'],
  params: orderIdParams,
  response: staffOrderDetail,
  errors: ['ORDER_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '9001' }, response: staffOrderDetailExample }],
});

export const staffOrderTimeline = defineRoute({
  id: 'order.staffOrderTimeline',
  method: 'GET',
  path: '/api/v1/staff/orders/:id/status-logs',
  auth: 'staff',
  summary: '店员查看订单记录',
  tags: ['order'],
  params: orderIdParams,
  response: orderTimeline,
  errors: ['ORDER_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '9001' }, response: { items: [orderStatusLogExample] } }],
});

export const staffOrderRemark = defineRoute({
  id: 'order.staffRemark',
  method: 'POST',
  path: '/api/v1/staff/orders/:id/remark',
  auth: 'staff',
  summary: '店员备注订单',
  tags: ['order'],
  params: orderIdParams,
  body: orderRemarkBody,
  response: staffOrderDetail,
  errors: ['ORDER_NOT_FOUND'],
  examples: [
    {
      name: 'ok',
      params: { id: '9001' },
      body: { adminRemark: '已电话联系买家' },
      response: { ...staffOrderDetailExample, adminRemark: '已电话联系买家' },
    },
  ],
});

export const staffOrderPrice = defineRoute({
  id: 'order.staffAdjustPrice',
  method: 'POST',
  path: '/api/v1/staff/orders/:id/price',
  auth: 'staff',
  summary: '店员改价',
  tags: ['order'],
  params: orderIdParams,
  body: orderPriceBody,
  response: staffOrderDetail,
  errors: ['ORDER_NOT_FOUND', 'ORDER_PRICE_NOT_ADJUSTABLE', 'ORDER_PRICE_INVALID'],
  examples: [
    {
      name: 'ten-off',
      params: { id: '9001' },
      body: { operatorDiscount: '10.00' },
      response: {
        ...staffOrderDetailExample,
        status: 'pending_payment',
        paidAmount: null,
        paidAt: null,
        payExpiresAt: '2026-02-01T10:30:00+08:00',
        couponDiscount: '20.00',
        payableAmount: '108.00',
        items: [
          { ...staffOrderDetailExample.items[0]!, discountAmount: '20.00', totalAmount: '100.00' },
        ],
      },
    },
  ],
});

export const staffOrderAddress = defineRoute({
  id: 'order.staffUpdateAddress',
  method: 'POST',
  path: '/api/v1/staff/orders/:id/address',
  auth: 'staff',
  summary: '店员修改收货地址',
  tags: ['order'],
  params: orderIdParams,
  body: orderAddressBody,
  response: staffOrderDetail,
  errors: ['ORDER_NOT_FOUND', 'ORDER_ADDRESS_NOT_EDITABLE'],
  examples: [
    {
      name: 'ok',
      params: { id: '9001' },
      body: {
        name: '张三',
        phone: '13800138001',
        province: '浙江省',
        city: '杭州市',
        district: '滨江区',
        detail: '江南大道 588 号',
      },
      response: {
        ...staffOrderDetailExample,
        receiver: {
          ...staffOrderDetailExample.receiver,
          addressId: null,
          phone: '13800138001',
          district: '滨江区',
          detail: '江南大道 588 号',
          postCode: null,
        },
      },
    },
  ],
});

export const staffShipments = defineRoute({
  id: 'order.staffShipments',
  method: 'GET',
  path: '/api/v1/staff/orders/:id/shipments',
  auth: 'staff',
  summary: '店员查看发货单',
  tags: ['order'],
  params: orderIdParams,
  response: z.object({ items: z.array(shipment) }),
  errors: ['ORDER_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '9001' }, response: { items: [shipmentExample] } }],
});

export const staffShip = defineRoute({
  id: 'order.staffShip',
  method: 'POST',
  path: '/api/v1/staff/orders/:id/shipments',
  auth: 'staff',
  summary: '店员发货',
  tags: ['order'],
  params: orderIdParams,
  body: shipBody,
  response: shipment,
  status: 201,
  errors: [
    'ORDER_NOT_FOUND',
    'ORDER_NOT_SHIPPABLE',
    'ORDER_SHIP_QUANTITY_EXCEEDED',
    'ORDER_SHIP_LINE_INVALID',
    'ORDER_VIRTUAL_AUTO_DELIVERED',
    'ORDER_EXPRESS_COMPANY_NOT_FOUND',
  ],
  examples: [
    { name: 'express', params: { id: '9001' }, body: shipBodyExample, response: shipmentExample },
  ],
});

export const staffShipmentTracking = defineRoute({
  id: 'order.staffShipmentTracking',
  method: 'GET',
  path: '/api/v1/staff/shipments/:id/tracking',
  auth: 'staff',
  summary: '店员查看物流',
  tags: ['order'],
  params: shipmentIdParams,
  response: shipmentTracking,
  errors: ['ORDER_SHIPMENT_NOT_FOUND'],
  examples: [{ name: 'in-transit', params: { id: '4001' }, response: shipmentTrackingExample }],
});

// Moved to stream F2 as `shipping.staffExpressCompanyPicker` (CR-1-b2),
// same path and same body.

// ---------------------------------------------------------------------------
// after-sales, handed to stream C
// ---------------------------------------------------------------------------

/**
 * The refund routes read and write stream C's aggregate through `refund`'s
 * staff entry points (CR-14-k: not the admin services, whose atoms a staff
 * actor never holds) — B2 owns the surface, C owns the money. The shapes below are C's
 * own, imported unchanged, so a field C adds shows up here without a second
 * edit.
 */
export const staffRefundList = defineRoute({
  id: 'order.staffRefundList',
  method: 'GET',
  path: '/api/v1/staff/refunds',
  auth: 'staff',
  summary: '店员售后列表',
  tags: ['order'],
  query: adminRefundListQuery,
  response: pagedAdminRefunds,
  examples: [
    {
      name: 'pending-review',
      query: { page: 1, pageSize: 20, status: 'applied' },
      response: { items: [adminRefundExample], total: 1, page: 1, pageSize: 20 },
    },
  ],
});

export const staffRefundDetail = defineRoute({
  id: 'order.staffRefundDetail',
  method: 'GET',
  path: '/api/v1/staff/refunds/:id',
  auth: 'staff',
  summary: '店员售后详情',
  tags: ['order'],
  params: z.object({ id }),
  response: adminRefundDetail,
  errors: ['REFUND_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '601' }, response: adminRefundDetailExample }],
});

/**
 * 同意/拒绝退款 from the phone.
 *
 * One route with a `decision` rather than two sub-resources, because that is
 * the single button pair the uni-app screen has; it delegates to C's staff
 * `approve` / `reject`, which own every refusal code listed here. `FORBIDDEN`
 * (`reason: '店员审核售后未开启'`) until the shop turns on
 * `order-staff.allowStaffRefundReview` (CR-14-k).
 */
export const staffRefundReview = defineRoute({
  id: 'order.staffRefundReview',
  method: 'POST',
  path: '/api/v1/staff/refunds/:id/review',
  auth: 'staff',
  summary: '店员审核售后',
  tags: ['order'],
  params: z.object({ id }),
  body: staffRefundReviewBody,
  response: adminRefundDetail,
  errors: [
    'REFUND_NOT_FOUND',
    'REFUND_NOT_ACTIONABLE',
    'REFUND_AMOUNT_MISMATCH',
    'REFUND_NO_ORIGINAL_PAYMENT',
    'REFUND_GATEWAY_REFUSED',
    'REFUND_STATE_UNKNOWN',
  ],
  examples: [
    {
      name: 'approve',
      params: { id: '601' },
      body: { decision: 'approve' },
      response: { ...adminRefundDetailExample, status: 'approved' },
    },
    {
      name: 'reject',
      params: { id: '601' },
      body: { decision: 'reject', reason: '商品已签收超过 7 天' },
      response: {
        ...adminRefundDetailExample,
        status: 'rejected',
        rejectReason: '商品已签收超过 7 天',
      },
    },
  ],
});

/**
 * 售后备注 from the phone (CR-4-h §2).
 *
 * The web console has `POST /admin-api/refunds/:id/remark`, which overwrites
 * `refunds.admin_remark`. This one appends to the refund's log instead: the
 * schema is frozen, there is no `refunds.staff_remark`, and taking over the
 * console's single column would let a staff member erase an operator's note
 * without either of them seeing it happen. The note comes back in `logs`, attributed
 * and in order, and the refund's status is untouched.
 */
export const staffRefundRemark = defineRoute({
  id: 'order.staffRefundRemark',
  method: 'POST',
  path: '/api/v1/staff/refunds/:id/remark',
  auth: 'staff',
  summary: '店员售后备注',
  tags: ['order'],
  params: z.object({ id }),
  body: staffRefundRemarkBody,
  response: adminRefundDetail,
  errors: ['REFUND_NOT_FOUND'],
  examples: [
    {
      name: 'noted',
      params: { id: '601' },
      body: { remark: '已电话联系买家' },
      response: {
        ...adminRefundDetailExample,
        logs: [
          ...adminRefundDetailExample.logs,
          {
            toStatus: 'applied',
            message: '店员备注：已电话联系买家',
            createdAt: '2026-02-26T14:00:00+08:00',
          },
        ],
      },
    },
  ],
});
