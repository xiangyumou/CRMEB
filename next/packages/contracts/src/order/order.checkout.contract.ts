import { z } from 'zod';
import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  checkoutCreateBody,
  checkoutLineExample,
  checkoutPreview,
  checkoutPreviewBody,
  checkoutPreviewExample,
  orderCancelBody,
  orderCounts,
  orderCountsExample,
  orderDetail,
  orderDetailExample,
  orderListQuery,
  orderListItemExample,
  pagedOrders,
} from './schemas';

/**
 * Checkout and the buyer's own orders.
 *
 * Six routes, and the shape of the first two is the whole design: `preview`
 * and `create` take the *same* input, and the server prices both from scratch.
 * Legacy handed the client a cache key from `order/confirm`, priced it in
 * `order/computed/:key`, and then created from the key again — three chances
 * for the cached draft and the world to disagree.
 *
 * `POST /api/v1/orders/:id/cancel` replaces `order/cancel`, which legacy
 * registered inside the **cart** route group. Fulfilment (receipt, delivery)
 * and payment live on the same resource but belong to streams B2 and C.
 */

export const checkoutPreviewRoute = defineRoute({
  id: 'order.checkoutPreview',
  method: 'POST',
  path: '/api/v1/checkout/preview',
  auth: 'user',
  summary: '确认订单（服务端重新计价）',
  tags: ['order'],
  body: checkoutPreviewBody,
  response: checkoutPreview,
  errors: [
    'ORDER_EMPTY',
    'ORDER_ITEM_UNAVAILABLE',
    'ORDER_VIRTUAL_CARD_QUANTITY',
    'ORDER_PURCHASE_LIMIT_REACHED',
    'ORDER_BELOW_MIN_PURCHASE',
    'ORDER_ADDRESS_NOT_FOUND',
    'COUPON_NOT_USABLE',
    'COUPON_NOT_APPLICABLE',
    'COUPON_MIN_SPEND_NOT_MET',
  ],
  examples: [
    {
      name: 'cart-with-coupon',
      body: {
        source: 'cart',
        cartItemIds: [],
        addressId: '301',
        userCouponId: '9001',
        kind: 'normal',
      },
      response: checkoutPreviewExample,
    },
    {
      name: 'buy-now-no-address-yet',
      body: {
        source: 'buy-now',
        cartItemIds: [],
        item: { skuId: '21', quantity: 1 },
        addressId: null,
        userCouponId: null,
        kind: 'normal',
      },
      response: {
        ...checkoutPreviewExample,
        lines: [
          {
            ...checkoutLineExample,
            cartItemId: null,
            quantity: 1,
            subtotal: '60.00',
            discountAmount: '0.00',
            totalAmount: '60.00',
          },
        ],
        receiver: null,
        totalQuantity: 1,
        itemsAmount: '60.00',
        // No address yet, so freight cannot be worked out and is quoted as zero.
        freightAmount: '0.00',
        couponDiscount: '0.00',
        adjustments: [],
        payableAmount: '60.00',
        userCouponId: null,
      },
    },
  ],
});

export const orderCreate = defineRoute({
  id: 'order.create',
  method: 'POST',
  path: '/api/v1/orders',
  auth: 'user',
  summary: '提交订单',
  tags: ['order'],
  body: checkoutCreateBody,
  response: orderDetail,
  status: 201,
  errors: [
    'ORDER_EMPTY',
    'ORDER_ITEM_UNAVAILABLE',
    'ORDER_OUT_OF_STOCK',
    'ORDER_VIRTUAL_CARD_QUANTITY',
    'ORDER_PURCHASE_LIMIT_REACHED',
    'ORDER_BELOW_MIN_PURCHASE',
    'ORDER_ADDRESS_REQUIRED',
    'ORDER_ADDRESS_NOT_FOUND',
    'ORDER_CUSTOM_FORM_INCOMPLETE',
    'ORDER_PRICE_CHANGED',
    'COUPON_NOT_USABLE',
    'COUPON_NOT_APPLICABLE',
    'COUPON_MIN_SPEND_NOT_MET',
  ],
  examples: [
    {
      name: 'ok',
      body: {
        source: 'cart',
        cartItemIds: ['5001'],
        addressId: '301',
        userCouponId: '9001',
        kind: 'normal',
        idempotencyKey: 'ck-20260201-7f3a9b21',
        buyerRemark: '请在工作日送达',
        expectedPayableAmount: '118.00',
      },
      response: orderDetailExample,
    },
    {
      name: 'replayed-submit',
      // The same key a second time: the first order comes back, not a new one.
      body: {
        source: 'cart',
        cartItemIds: ['5001'],
        addressId: '301',
        userCouponId: '9001',
        kind: 'normal',
        idempotencyKey: 'ck-20260201-7f3a9b21',
      },
      response: orderDetailExample,
    },
  ],
});

export const orderList = defineRoute({
  id: 'order.list',
  method: 'GET',
  path: '/api/v1/orders',
  auth: 'user',
  summary: '我的订单',
  tags: ['order'],
  query: orderListQuery,
  response: pagedOrders,
  examples: [
    {
      name: 'unpaid-tab',
      query: { page: 1, pageSize: 20, tab: 'unpaid' },
      response: { items: [orderListItemExample], total: 1, page: 1, pageSize: 20 },
    },
    {
      name: 'empty',
      query: { page: 1, pageSize: 20, tab: 'cancelled' },
      response: { items: [], total: 0, page: 1, pageSize: 20 },
    },
  ],
});

export const orderCountsRoute = defineRoute({
  id: 'order.counts',
  method: 'GET',
  path: '/api/v1/orders/counts',
  auth: 'user',
  summary: '订单角标数量',
  tags: ['order'],
  response: orderCounts,
  examples: [{ name: 'ok', response: orderCountsExample }],
});

export const orderGetDetail = defineRoute({
  id: 'order.detail',
  method: 'GET',
  path: '/api/v1/orders/:id',
  auth: 'user',
  summary: '订单详情',
  tags: ['order'],
  params: z.object({ id }),
  response: orderDetail,
  errors: ['ORDER_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '9001' }, response: orderDetailExample }],
});

/**
 * 取消订单.
 *
 * A POSTed sub-resource, not `DELETE /orders/:id`: cancelling is a state
 * transition with side effects (the coupon comes back, the stock comes back),
 * and the order row survives it.
 */
export const orderCancel = defineRoute({
  id: 'order.cancel',
  method: 'POST',
  path: '/api/v1/orders/:id/cancel',
  auth: 'user',
  summary: '取消订单',
  tags: ['order'],
  params: z.object({ id }),
  body: orderCancelBody,
  response: orderDetail,
  errors: [
    'ORDER_NOT_FOUND',
    'ORDER_NOT_CANCELLABLE',
    'ORDER_ALREADY_PAID',
    'ORDER_PAYMENT_STATE_UNKNOWN',
    'ORDER_COUPON_RELEASE_FAILED',
  ],
  examples: [
    {
      name: 'ok',
      params: { id: '9001' },
      body: { reason: '不想要了' },
      response: {
        ...orderDetailExample,
        status: 'cancelled',
        payExpiresAt: null,
        cancelledAt: '2026-02-01T10:05:00+08:00',
        cancelReason: '不想要了',
      },
    },
  ],
});
