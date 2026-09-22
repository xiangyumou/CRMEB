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
  toLegacyStatisticsRows,
  toLegacyStatisticsChart,
  fromLegacyStatisticsRange,
  precedingStatisticsRange,
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
  fromLegacyRefundRemarkInput,
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

/**
 * 订单月统计 — the 详细数据 table.
 *
 * One request per page, deliberately: the window is at most 92 days, so the mapper
 * slices what came back rather than making the server paginate days (CR-4-h §1).
 */
export function getStatisticsMonth(where) {
  return request.get('/api/v1/staff/statistics/series', fromLegacyStatisticsRange(where), {
    map: (dto) => toLegacyStatisticsRows(dto, where),
  });
}

/**
 * 订单统计图 — the line chart and its 增长率.
 *
 * Two requests, because 增长率 compares the window with the one immediately before it
 * and only the first response says which window that was (the page may have named
 * neither end). Legacy made the same comparison, inside one call.
 */
export function getStatisticsTime(data) {
  // Both URLs are written out at the call rather than built from a fragment, which is
  // the only shape `scripts/check-api-routes.mjs` can read — it refuses a computed one
  // now rather than skipping it, because a call the guard cannot see is a call nothing
  // proves a contract for.
  const current = request.get('/api/v1/staff/statistics/series', fromLegacyStatisticsRange(data));
  return current.then((res) => {
    const previous = request.get(
      '/api/v1/staff/statistics/series',
      precedingStatisticsRange(res.data),
    );
    return previous.then((before) => ({
      ...res,
      data: toLegacyStatisticsChart(res.data, before.data, data && data.type),
    }));
  });
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

// 电子面单打印（`orderExportTemp` / `orderDeliveryInfo`）和配送员名单
// （`orderOrderDelivery`）已随 CR-4-h §4/§5 的裁决下线：两者都没有继任路由，送货人
// 改为在发货页当场填写姓名和手机号，`fromLegacyShipInput` 依旧把它们映射成
// `merchant_delivery` 的 `courierName` / `courierPhone`。

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

/**
 * 退款单备注 (CR-4-h §2)
 *
 * The note is appended to the refund's log rather than written over the web console's
 * `adminRemark`, so two people remarking on one refund cannot erase each other.
 */
export function setAdminRefundRemark(data) {
  const src = data || {};
  return request.post(
    `/api/v1/staff/refunds/${src.id}/remark`,
    fromLegacyRefundRemarkInput(src),
    { msg: '备注成功' },
  );
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(A) — 商品管理. B2's contract hands these screens to stream A; the
// capability exists under `/admin-api/catalog/*` but only for an admin session, and a
// 店员 has a shopper session with a role on it. See docs/rewrite/cr/CR-4-h2.md.
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
// CONTRACT-PENDING(E1) — 用户管理. B2's contract hands these screens to stream E1;
// same shape as 商品管理 — `/admin-api/users*` does it all, for an admin.
// See docs/rewrite/cr/CR-2-h2.md §3, which also asks how much of a customer a
// 店员 should be shown.
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
// CONTRACT-PENDING(B1) — 赠送优惠券. The coupon domain grants from the console
// (`POST /admin-api/coupons/:id/grants`) and nowhere else; see
// docs/rewrite/cr/CR-5-h2.md.
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
