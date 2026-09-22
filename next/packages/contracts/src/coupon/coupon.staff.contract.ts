import { z } from 'zod';
import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  couponGrantResult,
  orderGiftCoupons,
  pagedStaffCoupons,
  staffCouponExample,
  staffCouponGrantBody,
  staffCouponListQuery,
  userCouponExample,
} from './schemas';

/**
 * 移动端店员发券, plus the 订单赠券 panel on the shopper's own order page (CR-5-h2).
 *
 * Three routes, two audiences:
 *
 *  - `GET /api/v1/orders/:id/gift-coupons` is the **shopper's**. Legacy showed
 *    the coupons an order had earned inside the order detail payload
 *    (`StoreOrderCreateServices` wrote them from `give_coupon_ids`); here the
 *    order detail stays a single shape owned by B1 and the coupons are their
 *    own call, so a wallet write never has to widen an order response.
 *  - `GET /api/v1/staff/coupons` and `POST /api/v1/staff/coupon-grants` are the
 *    **staff console's**. `auth: 'staff'` and no permission atom, exactly like
 *    every other route in `order.staff.contract.ts`: staff is the
 *    `order-staff.staffUserIds` roster, not a role, and a staff member either
 *    has the console or does not.
 *
 * The grant goes through `adminGrant` unchanged. That matters more than the
 * saved code: the supply decrement, the per-user limit and the
 * insert-then-decrement ordering that COUPON-008 pins are one implementation,
 * so the phone cannot oversell a campaign the web console protects.
 */

/**
 * `:id` is the surrogate id **or** the order number, the same as every other
 * storefront order route (CR-1-h), and a stranger gets the same `404` as an
 * unknown reference. Answering `403` here would confirm the order exists.
 */
export const orderGiftCouponList = defineRoute({
  id: 'coupon.orderGiftCoupons',
  method: 'GET',
  path: '/api/v1/orders/:id/gift-coupons',
  auth: 'user',
  summary: '订单赠送的优惠券',
  tags: ['coupon'],
  params: z.object({ id }),
  response: orderGiftCoupons,
  errors: ['ORDER_NOT_FOUND'],
  examples: [
    {
      name: 'two-gift-coupons',
      params: { id: '5001' },
      response: {
        items: [
          { ...userCouponExample, id: '9001', sourceKind: 'gift_order' },
          {
            ...userCouponExample,
            id: '9002',
            templateId: '2',
            title: '满 200 减 30',
            discountAmount: '30.00',
            minSpend: '200.00',
            sourceKind: 'gift_order',
          },
        ],
      },
    },
    {
      // Not an error: most orders earn nothing, and the page still asks.
      name: 'none',
      params: { id: '5002' },
      response: { items: [] },
    },
  ],
});

export const staffCouponList = defineRoute({
  id: 'coupon.staffList',
  method: 'GET',
  path: '/api/v1/staff/coupons',
  auth: 'staff',
  summary: '店员可发放的优惠券',
  tags: ['coupon'],
  query: staffCouponListQuery,
  response: pagedStaffCoupons,
  examples: [
    {
      name: 'first-page',
      query: { page: 1, pageSize: 20 },
      response: { items: [staffCouponExample], total: 1, page: 1, pageSize: 20 },
    },
    {
      name: 'by-keyword',
      query: { page: 1, pageSize: 20, keyword: '满 100' },
      response: { items: [staffCouponExample], total: 1, page: 1, pageSize: 20 },
    },
  ],
});

/**
 * Hand one coupon to one customer.
 *
 * The answer is `couponGrantResult`, the admin grant's own shape, so the two
 * surfaces report the same outcome: `{ granted: 1, skippedUserIds: [] }` when a
 * row was created, and `{ granted: 0, skippedUserIds: ['<userId>'] }` when the
 * customer already holds this coupon up to its `per_user_limit`. A second tap
 * is therefore a `200` that issued nothing, not a `409` — the same answer the
 * web console gives, and the honest one: nothing went wrong, the customer
 * simply already has it.
 *
 * A sold-out campaign *is* a refusal (`COUPON_SOLD_OUT`), because the staff
 * member has to pick a different coupon.
 */
export const staffCouponGrant = defineRoute({
  id: 'coupon.staffGrant',
  method: 'POST',
  path: '/api/v1/staff/coupon-grants',
  auth: 'staff',
  summary: '店员发放优惠券',
  tags: ['coupon'],
  body: staffCouponGrantBody,
  response: couponGrantResult,
  errors: ['COUPON_TEMPLATE_NOT_FOUND', 'COUPON_GRANT_USER_UNKNOWN', 'COUPON_SOLD_OUT'],
  examples: [
    {
      name: 'granted',
      body: { userId: '101', couponId: '1' },
      response: { granted: 1, skippedUserIds: [] },
    },
    {
      name: 'already-held',
      body: { userId: '101', couponId: '1' },
      response: { granted: 0, skippedUserIds: ['101'] },
    },
  ],
});
