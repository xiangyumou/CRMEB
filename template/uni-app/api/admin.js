// 商家端（店员）接口
//
// Contract: next/packages/contracts/src/order/order.staff.contract.ts (merged with B2).
// Reshaping lives in `api/mappers/staff.js`.
//
// Three notes that explain most of the diff against the old module:
//
//  * **线下付款确认 (`setOfflinePay`) and 拆单发货 (`orderSplitInfo` /
//    `orderSplitDelivery`) are gone.** Offline payment is a retired feature, and B2's
//    contract records that `split_cart_info` / `split_delivery` never had a route at
//    all — "stream H should delete them, they have always been broken".
//  * **The old `{login: true}` option is gone.** A staff call simply needs a token,
//    which is the default in the new client; `auth: 'staff'` is checked server-side
//    against the `orderStaff` config group.
//  * **商品管理 and 用户管理 are not B2's.** B2's contract hands those nineteen screens
//    to streams A and E1, so they stay CONTRACT-PENDING against those streams.

import request from '../utils/request.js';
import {
  toLegacyStaffIdentity,
  toLegacyStaffStatistics,
  toLegacyStaffOrderList,
  toLegacyStaffOrderDetail,
  toLegacyStaffRefund,
  toLegacyStaffRefundList,
  toLegacyOrderTimeline,
  toLegacyExpressCompanies,
  fromLegacyStaffOrderQuery,
  fromLegacyStaffRefundQuery,
  fromLegacyShipInput,
  fromLegacyPriceInput,
  fromLegacyRemarkInput,
  fromLegacyRefundReviewInput,
} from './mappers/staff.js';
import { toLegacyShipment } from './mappers/fulfil.js';

/** Local helper: the 审核 toast depends on the decision the page made. */
function asInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// 店员身份 / 统计
// ---------------------------------------------------------------------------

/**
 * 是否为店员（决定「商家管理」入口是否显示）
 */
export function getStaffIdentity() {
  return request.get('/api/v1/staff/me', {}, { map: toLegacyStaffIdentity });
}

/**
 * 统计数据
 */
export function getStatisticsInfo() {
  return request.get('/api/v1/staff/statistics', {}, { map: toLegacyStaffStatistics });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(B2) — 统计明细. `staffStatistics` has no per-day breakdown, so the
// 统计 detail page (成交额/订单数 按日) has nothing to call. See docs/rewrite/cr/CR-4-h.md.
// ---------------------------------------------------------------------------

/**
 * 订单月统计
 */
export function getStatisticsMonth(where) {
  return request.get('/api/v1/staff/statistics/orders', where);
}

/**
 * 订单统计图
 */
export function getStatisticsTime(data) {
  return request.get('/api/v1/staff/statistics/timeline', data);
}

// ---------------------------------------------------------------------------
// 订单
// ---------------------------------------------------------------------------

/**
 * 订单列表
 */
export function getAdminOrderList(where) {
  return request.get('/api/v1/staff/orders', fromLegacyStaffOrderQuery(where), {
    map: toLegacyStaffOrderList,
  });
}

/**
 * 订单详情
 */
export function getAdminOrderDetail(orderId) {
  return request.get(`/api/v1/staff/orders/${orderId}`, {}, { map: toLegacyStaffOrderDetail });
}

/**
 * 订单记录
 */
export function getAdminOrderTimeline(orderId) {
  return request.get(`/api/v1/staff/orders/${orderId}/status-logs`, {}, {
    map: toLegacyOrderTimeline,
  });
}

/**
 * 订单改价。调用处会把当前 `pay_price` 一起传进来，见 `fromLegacyPriceInput`。
 */
export function setAdminOrderPrice(data) {
  const src = data || {};
  return request.post(`/api/v1/staff/orders/${src.order_id}/price`, fromLegacyPriceInput(src), {
    map: toLegacyStaffOrderDetail,
    msg: '改价成功',
  });
}

/**
 * 订单备注
 */
export function setAdminOrderRemark(data) {
  const src = data || {};
  return request.post(`/api/v1/staff/orders/${src.order_id}/remark`, fromLegacyRemarkInput(src), {
    map: toLegacyStaffOrderDetail,
    msg: '备注成功',
  });
}

/**
 * 订单发货信息获取（发货页读取订单本身）
 */
export function getAdminOrderDelivery(orderId) {
  return request.get(`/api/v1/staff/orders/${orderId}`, {}, { map: toLegacyStaffOrderDetail });
}

/**
 * 订单发货保存
 */
export function setAdminOrderDelivery(id, data) {
  return request.post(`/api/v1/staff/orders/${id}/shipments`, fromLegacyShipInput(data), {
    map: toLegacyShipment,
    msg: '发货成功',
  });
}

/**
 * 快递公司
 */
export function getLogistics() {
  return request.get('/api/v1/staff/express-companies', {}, { map: toLegacyExpressCompanies });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(F2) — 电子面单与配送员. 面单模板要等物流服务商接入；配送员名单在旧版
// 是后台配置的「送货人」，新合约只收姓名和电话。见 docs/rewrite/cr/CR-4-h.md。
// ---------------------------------------------------------------------------

/**
 * 电子面单模板
 */
export function orderExportTemp(data) {
  return request.get('/api/v1/staff/shipping/waybill-templates', data);
}

/**
 * 打印默认配置
 */
export function orderDeliveryInfo() {
  return request.get('/api/v1/staff/shipping/defaults', {});
}

/**
 * 配送员列表
 */
export function orderOrderDelivery() {
  return request.get('/api/v1/staff/couriers', {});
}

// ---------------------------------------------------------------------------
// 售后
// ---------------------------------------------------------------------------

/**
 * 退款列表
 */
export function adminRefundList(data) {
  return request.get('/api/v1/staff/refunds', fromLegacyStaffRefundQuery(data), {
    map: toLegacyStaffRefundList,
  });
}

/**
 * 退款单详情
 */
export function getAdminRefundDetail(refundId) {
  return request.get(`/api/v1/staff/refunds/${refundId}`, {}, { map: toLegacyStaffRefund });
}

/**
 * 审核退款：`type == 2` 是拒绝（带 `refuse_reason`），其余是同意。
 *
 * 旧版还允许店员自己填一个退款金额直接退（「直接退款」），新模型里退款金额由买家的申请
 * 决定，C 域独占打款，所以那条路没有继任者。见 docs/rewrite/cr/CR-4-h.md。
 */
export function setOrderRefund(data) {
  const src = data || {};
  return request.post(
    `/api/v1/staff/refunds/${src.order_id || src.id}/review`,
    fromLegacyRefundReviewInput(src),
    { map: toLegacyStaffRefund, msg: asInt(src.type) === 2 ? '已拒绝' : '已同意' },
  );
}

/**
 * 同意退货
 */
export function agreeExpress(data) {
  const src = data || {};
  return request.post(`/api/v1/staff/refunds/${src.id}/review`, { decision: 'approve' }, {
    map: toLegacyStaffRefund,
    msg: '操作成功',
  });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(B2) — 售后备注. Only the web console can remark a refund
// (`/admin-api/refunds/:id/remark`); the staff surface has no equivalent.
// ---------------------------------------------------------------------------

/**
 * 退款单备注
 */
export function setAdminRefundRemark(data) {
  const src = data || {};
  return request.post(`/api/v1/staff/refunds/${src.id}/remark`, src, { msg: '备注成功' });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(A) — 商品管理. B2's contract hands these screens to stream A
// (`admin/product/*`, nine of the nineteen non-order staff routes).
// ---------------------------------------------------------------------------

/**
 * 商品列表
 */
export function adminProductList(data) {
  return request.get('/api/v1/staff/products', data);
}

/**
 * 商品上下架
 */
export function productSetShow(data) {
  const src = data || {};
  return request.post(`/api/v1/staff/products/${src.id}/visibility`, src, { msg: '操作成功' });
}

/**
 * 商品标签
 */
export function getProductLabel() {
  return request.get('/api/v1/staff/product-labels', {});
}

/**
 * 商品分类
 */
export function getProductCate() {
  return request.get('/api/v1/staff/product-categories', {});
}

/**
 * 批量修改商品标签
 */
export function postBatchProcess(data) {
  return request.post('/api/v1/staff/products/label-assignments', data, { msg: '操作成功' });
}

/**
 * 批量修改商品分类
 */
export function postManageSaveCate(data) {
  return request.post('/api/v1/staff/products/category-assignments', data, { msg: '操作成功' });
}

/**
 * 商品规格
 */
export function getManageProductAttr(id) {
  return request.get(`/api/v1/staff/products/${id}/skus`, {});
}

/**
 * 商品规格保存
 */
export function postUpdateAttrs(id, data) {
  return request.put(`/api/v1/staff/products/${id}/skus`, data, { msg: '保存成功' });
}

/**
 * 运费模板选项
 */
export function getTemplateOption() {
  return request.get('/api/v1/staff/shipping-templates', {});
}

/**
 * 创建商品
 */
export function productCreate(data) {
  return request.post('/api/v1/staff/products', data, { msg: '保存成功' });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(E1) — 用户管理. B2's contract hands these screens to stream E1
// (`admin/user/*`, the other ten non-order staff routes).
// ---------------------------------------------------------------------------

/**
 * 用户列表
 */
export function getUserList(data) {
  return request.get('/api/v1/staff/users', data);
}

/**
 * 用户详情
 */
export function getUserInfo(uid) {
  return request.get(`/api/v1/staff/users/${uid}`, {});
}

/**
 * 用户分组列表
 */
export function getGroupList() {
  return request.get('/api/v1/staff/user-groups', {});
}

/**
 * 设置用户分组
 */
export function postUserSetGroup(uid, groupId) {
  return request.post(`/api/v1/staff/users/${uid}/group`, { groupId: String(groupId) }, {
    msg: '设置成功',
  });
}

/**
 * 用户标签
 */
export function getUserLabel(uid) {
  return request.get(`/api/v1/staff/users/${uid}/labels`, {});
}

/**
 * 设置用户标签
 */
export function postUserSetLabel(uid, labelId) {
  return request.post(`/api/v1/staff/users/${uid}/labels`, { labelId: String(labelId) }, {
    msg: '设置成功',
  });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(B1) — 赠送优惠券. The coupon domain has no staff-side grant route.
// ---------------------------------------------------------------------------

/**
 * 可赠送的优惠券
 */
export function getUserCoupon(data) {
  return request.get('/api/v1/staff/coupons', data);
}

/**
 * 赠送优惠券
 */
export function postUserSetCoupon(uid, couponId) {
  return request.post(`/api/v1/staff/users/${uid}/coupons`, { couponId: String(couponId) }, {
    msg: '赠送成功',
  });
}
