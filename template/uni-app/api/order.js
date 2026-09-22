// 购物车 / 订单 / 售后
//
// Every URL below is a literal `/api/v1/...` path from
// `next/packages/contracts/openapi.json`; `scripts/check-api-routes.mjs` proves it.
// Reshaping lives in `api/mappers/`. See `api/README.md` for the resolved shape.

import request from '../utils/request.js';
import {
  toLegacyCartList,
  toLegacyCartArray,
  toLegacyCartCount,
  toLegacyCartAddResult,
  toLegacyRebuyResult,
  fromLegacyCartQuery,
} from './mappers/cart.js';
import {
  toLegacyOrderList,
  toLegacyOrderDetail,
  toLegacyOrderCounts,
  toLegacyOrderConfirm,
  toLegacyOrderComputed,
  toLegacyOrderCreateResult,
  toLegacyCashierOrder,
  toLegacyOrderProduct,
  fromLegacyOrderListQuery,
  fromLegacyCheckoutInput,
  fromLegacyOrderCreateInput,
} from './mappers/order.js';
import { toLegacyPayResult, payResultMessage, paymentChannelFor } from './mappers/payment.js';
import {
  toLegacyRefund,
  toLegacyRefundList,
  toLegacyRefundReasons,
  toLegacyApplicableItems,
  fromLegacyRefundApplyInput,
  fromLegacyReturnShipmentInput,
  fromLegacyRefundState,
} from './mappers/refund.js';
import {
  toLegacyInvoice,
  toLegacyInvoiceList,
  toLegacyExpressView,
  pickShipment,
} from './mappers/fulfil.js';
import { toLegacyStaffOrderDetail } from './mappers/staff.js';
import { fromLegacyPage } from './mappers/_shared.js';
import { toLegacyApplicableCoupons, fromLegacyApplicableInput } from './mappers/coupon.js';
import { fromLegacyCommentInput } from './mappers/catalog.js';
import { clientPlatform } from '../config/app';

// ---------------------------------------------------------------------------
// 购物车
// ---------------------------------------------------------------------------

/**
 * 购物车数量
 * @param numType boolean true 数量总和, false/0 条数
 */
export function getCartCounts(numType) {
  return request.get('/api/v1/cart/count', {}, { map: (dto) => toLegacyCartCount(dto, numType) });
}

/**
 * 购物车列表
 * @param object data {page, limit, status} — status 1 有效, 0 失效
 */
export function getCartList(data) {
  return request.get('/api/v1/cart', fromLegacyCartQuery(data), { map: toLegacyCartList });
}

/**
 * 分类购物车列表
 */
export function vcartList() {
  return request.get('/api/v1/cart', { filter: 'all', pageSize: 100 }, { map: toLegacyCartArray });
}

/**
 * 修改购物车数量
 * @param int cartId
 * @param int number
 */
export function changeCartNum(cartId, number) {
  return request.patch(`/api/v1/cart/items/${cartId}`, { quantity: Number(number) || 1 }, {
    map: toLegacyCartAddResult,
    msg: '修改成功',
  });
}

/**
 * 清除购物车
 * @param object ids join(',') 切割成字符串
 */
export function cartDel(ids) {
  const itemIds = Array.isArray(ids) ? ids.map(String) : String(ids || '').split(',').filter(Boolean);
  return request.post('/api/v1/cart/items/removals', { itemIds, unavailableOnly: false }, {
    msg: '删除成功',
  });
}

/**
 * 重选规格 — one PATCH since CR-2-h was accepted.
 *
 * This used to be `DELETE` then `POST`, which left the buyer with no row at all
 * if the second call failed. `PATCH /api/v1/cart/items/:id {skuId}` does both in
 * one transaction and folds into an existing row of that variant; `cartId` in
 * the answer is the surviving row, which may not be the one that was PATCHed.
 */
export function getResetCart(data) {
  const src = data || {};
  const body = { skuId: String(src.unique || '') };
  if (src.num !== undefined && src.num !== '') body.quantity = Number(src.num) || 1;
  return request.patch(`/api/v1/cart/items/${src.id}`, body, {
    map: toLegacyCartAddResult,
    msg: '添加购物车成功',
  });
}

// ---------------------------------------------------------------------------
// 订单
// ---------------------------------------------------------------------------

/**
 * 订单列表
 * @param object data {type, page, limit}
 */
export function getOrderList(data) {
  return request.get('/api/v1/orders', fromLegacyOrderListQuery(data), { map: toLegacyOrderList });
}

/**
 * 订单详情
 * @param string uni 订单 id
 */
export function getOrderDetail(uni) {
  return request.get(`/api/v1/orders/${uni}`, {}, { map: toLegacyOrderDetail });
}

/**
 * 订单统计数据
 */
export function orderData() {
  return request.get('/api/v1/orders/counts', {}, { map: toLegacyOrderCounts });
}

/**
 * 订单取消
 * @param string id
 */
export function orderCancel(id) {
  return request.post(`/api/v1/orders/${id}/cancel`, { reason: '用户取消' }, {
    map: toLegacyOrderDetail,
    msg: '取消成功',
  });
}

/**
 * 再次下单：把订单里的商品放回购物车
 * @param string uni 订单 id
 */
export function orderAgain(uni) {
  return request.post('/api/v1/cart/rebuys', { orderId: String(uni) }, { map: toLegacyRebuyResult });
}

/**
 * 订单确认获取订单详细信息
 * @param object data {cartId, addressId, couponId}
 */
export function orderConfirm(data) {
  return request.post('/api/v1/checkout/preview', fromLegacyCheckoutInput(data), {
    map: toLegacyOrderConfirm,
  });
}

/**
 * 计算订单金额
 * @param key  旧的 orderKey，新接口不需要，保留签名
 * @param data
 */
export function postOrderComputed(key, data) {
  return request.post('/api/v1/checkout/preview', fromLegacyCheckoutInput(data), {
    map: toLegacyOrderComputed,
  });
}

/**
 * 订单创建
 * @param string key 幂等键
 * @param object data
 */
export function orderCreate(key, data) {
  return request.post('/api/v1/orders', fromLegacyOrderCreateInput(key, data), {
    map: toLegacyOrderCreateResult,
    msg: '订单创建成功',
  });
}

/**
 * 订单支付
 * @param object data {uni: 订单 id}
 */
export function orderPay(data) {
  const src = data || {};
  return request.post(
    `/api/v1/orders/${src.uni}/payments`,
    { channel: paymentChannelFor(clientPlatform()) },
    { map: toLegacyPayResult, msg: payResultMessage },
  );
}

/**
 * 收银台订单信息
 * @param string orderId
 * @param string type 旧的支付来源，新接口不需要
 */
export function getCashierOrder(orderId, type) {
  return request.get(`/api/v1/orders/${orderId}`, {}, { map: toLegacyCashierOrder });
}

/**
 * 订单产品信息（评价页）
 * @param string unique  订单明细 id
 * @param string orderId 订单 id（调用方 `options.uni`）
 */
export function orderProduct(unique, orderId) {
  return request.get(`/api/v1/orders/${orderId}`, {}, {
    map: (dto) => toLegacyOrderProduct(dto, unique),
  });
}

/**
 * 订单评价
 * @param object data
 */
export function orderComment(data) {
  return request.post('/api/v1/catalog/reviews', fromLegacyCommentInput(data), {
    map: () => ({ to_lottery: 0 }),
    msg: '评价成功',
  });
}

/**
 * 获取当前金额能使用的优惠卷
 * @param string price
 * @param object data
 */
export function getCouponsOrderPrice(price, data) {
  return request.post('/api/v1/user-coupons/applicable', fromLegacyApplicableInput(price, data), {
    map: toLegacyApplicableCoupons,
  });
}

/**
 * 订单收货
 * @param string uni 订单 id
 */
export function orderTake(uni) {
  return request.post(`/api/v1/orders/${uni}/receipt`, {}, {
    map: toLegacyOrderDetail,
    msg: '确认收货成功',
  });
}

/**
 * 删除已完成订单 — 只是把订单从「我的订单」里隐藏，商家那边一行都不会少（CR-4-h §6）。
 *
 * 只有已完成 / 已取消 / 已退款的订单可以删除，重复点击会得到 404：删过之后这张订单
 * 对买家来说已经不在列表里了。
 * @param string uni 订单 id 或 24 位订单号
 */
export function orderDel(uni) {
  return request.delete(`/api/v1/orders/${uni}`, {}, { msg: '删除成功' });
}

/**
 * 订单查询物流信息.
 *
 * Legacy answered this with one call because the order row carried the single
 * `delivery_id` it had. An order now has a `shipments` collection and the trace feed
 * hangs off a shipment, so this composes three reads — the order, its parcels and the
 * tracking of the parcel the page will show — back into the old
 * `{order, express: {result: {list}}}` payload.
 *
 * @param string uni 订单 id
 * @param string type 旧的「退货物流」分支：订单详情把 refund_type 钉成 0，这里不再可达
 */
export function express(uni, type) {
  return expressView(
    () => request.get(`/api/v1/orders/${uni}`, {}, { map: toLegacyOrderDetail }),
    () => request.get(`/api/v1/orders/${uni}/shipments`, {}),
    (shipmentId) => request.get(`/api/v1/shipments/${shipmentId}/tracking`, {}),
  );
}

/** 商家端物流轨迹 — the same composition against the staff surface. */
export function adminExpress(uni, type) {
  return expressView(
    () => request.get(`/api/v1/staff/orders/${uni}`, {}, { map: toLegacyStaffOrderDetail }),
    () => request.get(`/api/v1/staff/orders/${uni}/shipments`, {}),
    (shipmentId) => request.get(`/api/v1/staff/shipments/${shipmentId}/tracking`, {}),
  );
}

/**
 * The composition itself, handed three thunks rather than three path fragments: every
 * URL then sits at a `request.*` call as a literal, which is the only shape
 * `scripts/check-api-routes.mjs` can read. A guard that cannot see a call is worse
 * than no guard, because the table it prints looks complete.
 */
function expressView(readOrder, readShipments, readTracking) {
  return Promise.all([readOrder(), readShipments()]).then(([orderRes, shipRes]) => {
    const parcel = pickShipment(shipRes.data);
    if (!parcel) {
      return { data: toLegacyExpressView(orderRes.data, null, null), msg: '', status: 200 };
    }
    return readTracking(parcel.id)
      .then((trackRes) => ({
        data: toLegacyExpressView(orderRes.data, parcel, trackRes.data),
        msg: '',
        status: 200,
      }))
      // A parcel with no trace feed is still a parcel: show it without the timeline.
      .catch(() => ({
        data: toLegacyExpressView(orderRes.data, parcel, null),
        msg: '',
        status: 200,
      }));
  });
}

// CONTRACT-PENDING(B1) — 下单后赠送的优惠券。支付成功页的「恭喜获得优惠券」弹层读它，
// 合约里没有对应路由；见 docs/rewrite/cr/CR-5-h2.md §1。
/**
 * 订单赠送的优惠券
 * @param string orderId
 */
export function orderCoupon(orderId) {
  return request.get(`/api/v1/orders/${orderId}/gift-coupons`, {});
}

// ---------------------------------------------------------------------------
// 发票
// ---------------------------------------------------------------------------

/**
 * 开票记录
 */
export function orderInvoiceList(data) {
  return request.get('/api/v1/invoices', fromLegacyPage(data), { map: toLegacyInvoiceList });
}

/**
 * 开票申请详情。
 *
 * 旧接口返回的是「带发票的订单」，页面整页都按订单渲染，所以这里取回发票后再取它的订单，
 * 拼回 `{...订单, invoice}`。调用处传的是开票申请 id（`user_invoice_list` 已改）。
 *
 * @param string id 开票申请 id
 */
export function orderInvoiceDetail(id) {
  return request.get(`/api/v1/invoices/${id}`, {}, { map: toLegacyInvoice }).then((invRes) => {
    const invoice = invRes.data;
    return request
      .get(`/api/v1/orders/${invoice.order_id}`, {}, { map: toLegacyOrderDetail })
      .then((orderRes) => ({
        data: Object.assign({}, orderRes.data, { invoice }),
        msg: '',
        status: 200,
      }));
  });
}

/**
 * 取消开票申请
 */
export function orderInvoiceCancel(id) {
  return request.post(`/api/v1/invoices/${id}/cancel`, {}, {
    map: toLegacyInvoice,
    msg: '已取消申请',
  });
}

// ---------------------------------------------------------------------------
// 售后
// ---------------------------------------------------------------------------

/**
 * 退款单列表（旧名：新订单列表 2.1 版本）
 * @param object data {type, page, limit}
 */
export function getNewOrderList(data) {
  const src = data || {};
  const query = { state: fromLegacyRefundState(src.type) };
  if (src.page !== undefined) query.page = Number(src.page) || 1;
  if (src.limit !== undefined) query.pageSize = Number(src.limit) || 20;
  return request.get('/api/v1/refunds', query, { map: toLegacyRefundList });
}

/**
 * 退款订单详情
 * @param string uni 退款单 id
 */
export function refundOrderDetail(uni) {
  return request.get(`/api/v1/refunds/${uni}`, {}, { map: toLegacyRefund });
}

/**
 * 退款订单详情（订单详情页复用）
 */
export function getRefundOrderDetail(uni) {
  return request.get(`/api/v1/refunds/${uni}`, {}, { map: toLegacyRefund });
}

/**
 * 放弃申请退款
 * @param string uni 退款单 id
 */
export function cancelRefundOrder(uni) {
  return request.post(`/api/v1/refunds/${uni}/cancel`, {}, { map: toLegacyRefund, msg: '已撤销申请' });
}

/**
 * 删除已退款和拒绝退款的订单
 * @param string uni 退款单 id
 */
export function refundOrderDel(uni) {
  return request.delete(`/api/v1/refunds/${uni}`, {}, { msg: '删除成功' });
}

/**
 * 获取退款理由
 */
export function ordeRefundReason() {
  return request.get('/api/v1/refund-reasons', {}, { map: toLegacyRefundReasons, noAuth: true });
}

/**
 * 退款商品列表
 * @param string orderId
 */
export function refundGoodsList(orderId) {
  return request.get(`/api/v1/refunds/applicable-items/${encodeURIComponent(String(orderId))}`, {}, {
    map: toLegacyApplicableItems,
  });
}

/**
 * 申请退款商品列表
 * @param object data {orderId}
 */
export function postRefundGoods(data) {
  const src = data || {};
  const orderId = String(src.orderId || src.id);
  return request.get(`/api/v1/refunds/applicable-items/${encodeURIComponent(orderId)}`, {}, {
    map: toLegacyApplicableItems,
  });
}

/**
 * 退款商品提交
 * @param string id 订单 id
 * @param object data
 */
export function returnGoodsSubmit(id, data) {
  return request.post('/api/v1/refunds', fromLegacyRefundApplyInput(id, data), {
    map: toLegacyRefund,
    msg: '申请已提交',
  });
}

/**
 * 退货物流单号提交
 * @param object data {id, delivery_code, delivery_id, delivery_phone}
 */
export function refundExpress(data) {
  const src = data || {};
  return request.post(
    `/api/v1/refunds/${src.id}/return-shipment`,
    fromLegacyReturnShipmentInput(src),
    { map: toLegacyRefund, msg: '提交成功' },
  );
}
