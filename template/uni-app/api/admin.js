// 商家端（店员）接口
//
// Contract: next/packages/contracts/src/order/order.staff.contract.ts.
// Reshaping lives in `api/mappers/staff.js`.
//
// Three notes:
//
//  * **There is no 线下付款确认 and no 拆单发货.** Offline payment is not part of the
//    shop, and split shipments have no route.
//  * **There is no `{login: true}` option.** A staff call simply needs a token, which
//    is the client's default; `auth: 'staff'` is checked server-side against the
//    `orderStaff` config group.
//  * **商品管理 and 用户管理 are other domains' routes.** The catalog and the user
//    domain serve them as `/api/v1/staff/*`; their reshaping lives in
//    `api/mappers/staff.js` too.

import request from '../utils/request.js';
import {
  toPageStaffIdentity,
  toPageStaffStatistics,
  toPageStatisticsRows,
  toPageStatisticsChart,
  fromPageStatisticsRange,
  precedingStatisticsRange,
  toPageStaffOrderList,
  toPageStaffOrderDetail,
  toPageStaffRefund,
  toPageStaffRefundList,
  toPageOrderTimeline,
  toPageExpressCompanies,
  fromPageStaffOrderQuery,
  fromPageStaffRefundQuery,
  fromPageShipInput,
  fromPagePriceInput,
  fromPageRemarkInput,
  fromPageRefundRemarkInput,
  fromPageRefundReviewInput,
  fromPageStaffProductQuery,
  toPageStaffProduct,
  toPageStaffProductList,
  toPageProductLabels,
  toPageProductCategories,
  fromPageLabelAssignment,
  fromPageCategoryAssignment,
  toPageStaffSkus,
  fromPageSkuPatch,
  toPageTemplateOptions,
  fromPageStaffProductForm,
  fromPageStaffUserQuery,
  toPageStaffUser,
  toPageStaffUserList,
  toPageUserGroups,
  toPageUserLabels,
  fromPageUserGroupInput,
  fromPageUserLabelInput,
} from './mappers/staff.js';
import { toPageShipment } from './mappers/fulfil.js';
import {
  fromPageStaffCouponQuery,
  toPageStaffCoupons,
  toPageUserCouponList,
  fromPageCouponGrant,
  couponGrantMessage,
} from './mappers/coupon.js';

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
  return request.get('/api/v1/staff/me', {}, { map: toPageStaffIdentity });
}

/**
 * 统计数据
 */
export function getStatisticsInfo() {
  return request.get('/api/v1/staff/statistics', {}, { map: toPageStaffStatistics });
}

/**
 * 订单月统计 — the 详细数据 table.
 *
 * One request per page, deliberately: the window is at most 92 days, so the mapper
 * slices what came back rather than making the server paginate days.
 */
export function getStatisticsMonth(where) {
  return request.get('/api/v1/staff/statistics/series', fromPageStatisticsRange(where), {
    map: (dto) => toPageStatisticsRows(dto, where),
  });
}

/**
 * 订单统计图 — the line chart and its 增长率.
 *
 * Two requests, because 增长率 compares the window with the one immediately before it
 * and only the first response says which window that was (the page may have named
 * neither end).
 */
export function getStatisticsTime(data) {
  // Both URLs are written out at the call rather than built from a fragment, which is
  // the only shape `scripts/check-api-routes.mjs` can read — it refuses a computed one
  // rather than skipping it, because a call the guard cannot see is a call nothing
  // proves a contract for.
  const current = request.get('/api/v1/staff/statistics/series', fromPageStatisticsRange(data));
  return current.then((res) => {
    const previous = request.get(
      '/api/v1/staff/statistics/series',
      precedingStatisticsRange(res.data),
    );
    return previous.then((before) => ({
      ...res,
      data: toPageStatisticsChart(res.data, before.data, data && data.type),
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
  return request.get('/api/v1/staff/orders', fromPageStaffOrderQuery(where), {
    map: toPageStaffOrderList,
  });
}

/**
 * 订单详情
 */
export function getAdminOrderDetail(orderId) {
  return request.get(`/api/v1/staff/orders/${orderId}`, {}, { map: toPageStaffOrderDetail });
}

/**
 * 订单记录
 */
export function getAdminOrderTimeline(orderId) {
  return request.get(`/api/v1/staff/orders/${orderId}/status-logs`, {}, {
    map: toPageOrderTimeline,
  });
}

/**
 * 订单改价。调用处会把当前 `pay_price` 一起传进来，见 `fromPagePriceInput`。
 */
export function setAdminOrderPrice(data) {
  const src = data || {};
  return request.post(`/api/v1/staff/orders/${src.order_id}/price`, fromPagePriceInput(src), {
    map: toPageStaffOrderDetail,
    msg: '改价成功',
  });
}

/**
 * 订单备注
 */
export function setAdminOrderRemark(data) {
  const src = data || {};
  return request.post(`/api/v1/staff/orders/${src.order_id}/remark`, fromPageRemarkInput(src), {
    map: toPageStaffOrderDetail,
    msg: '备注成功',
  });
}

/**
 * 订单发货信息获取（发货页读取订单本身）
 */
export function getAdminOrderDelivery(orderId) {
  return request.get(`/api/v1/staff/orders/${orderId}`, {}, { map: toPageStaffOrderDetail });
}

/**
 * 订单发货保存
 */
export function setAdminOrderDelivery(id, data) {
  return request.post(`/api/v1/staff/orders/${id}/shipments`, fromPageShipInput(data), {
    map: toPageShipment,
    msg: '发货成功',
  });
}

/**
 * 快递公司
 */
export function getLogistics() {
  return request.get('/api/v1/staff/express-companies', {}, { map: toPageExpressCompanies });
}

// 电子面单打印（`orderExportTemp` / `orderDeliveryInfo`）和配送员名单
// （`orderOrderDelivery`）都不支持，没有对应路由：送货人
// 在发货页当场填写姓名和手机号，`fromPageShipInput` 依旧把它们映射成
// `merchant_delivery` 的 `courierName` / `courierPhone`。

// ---------------------------------------------------------------------------
// 售后
// ---------------------------------------------------------------------------

/**
 * 退款列表
 */
export function adminRefundList(data) {
  return request.get('/api/v1/staff/refunds', fromPageStaffRefundQuery(data), {
    map: toPageStaffRefundList,
  });
}

/**
 * 退款单详情
 */
export function getAdminRefundDetail(refundId) {
  return request.get(`/api/v1/staff/refunds/${refundId}`, {}, { map: toPageStaffRefund });
}

/**
 * 审核退款：`type == 2` 是拒绝（带 `refuse_reason`），其余是同意。
 *
 * 没有「直接退款」（店员自己填金额直接退）：退款金额由买家的申请决定，打款只归退款域，
 * 店员只能同意或拒绝。
 */
export function setOrderRefund(data) {
  const src = data || {};
  return request.post(
    `/api/v1/staff/refunds/${src.order_id || src.id}/review`,
    fromPageRefundReviewInput(src),
    { map: toPageStaffRefund, msg: asInt(src.type) === 2 ? '已拒绝' : '已同意' },
  );
}

/**
 * 同意退货
 */
export function agreeExpress(data) {
  const src = data || {};
  return request.post(`/api/v1/staff/refunds/${src.id}/review`, { decision: 'approve' }, {
    map: toPageStaffRefund,
    msg: '操作成功',
  });
}

/**
 * 退款单备注
 *
 * The note is appended to the refund's log rather than written over the web console's
 * `adminRemark`, so two people remarking on one refund cannot erase each other.
 */
export function setAdminRefundRemark(data) {
  const src = data || {};
  return request.post(
    `/api/v1/staff/refunds/${src.id}/remark`,
    fromPageRefundRemarkInput(src),
    { msg: '备注成功' },
  );
}

// ---------------------------------------------------------------------------
// 商品管理 — 商品域的十条 `/api/v1/staff/*` 路由。
//
// 契约 next/packages/contracts/src/catalog/catalog.staff.contract.ts。
// 都是 `auth: 'staff'`：店员不是角色，是订单域的
// `orderStaff` 名单，在名单上就行，不在就是 403。
//
// 三处批量操作页面送的是**数组**，而路由按设计是单条（一个商品一个 `:id`），所以
// 扇出在这里做，页面不动：下架多选、以及下面 用户管理 的分组/标签/发券。
// ---------------------------------------------------------------------------

/**
 * 商品列表
 */
export function adminProductList(data) {
  return request.get('/api/v1/staff/products', fromPageStaffProductQuery(data), {
    map: toPageStaffProductList,
  });
}

/**
 * 商品上下架
 *
 * 列表底部的批量下架/上架送的是 `{id: [...], is_show}`，单行的开关送的是
 * `{id, is_show}`。路由一次只翻一个商品，所以多选在这里扇出；页面只读 `res.msg`。
 */
export function productSetShow(data) {
  const src = data || {};
  const ids = (Array.isArray(src.id) ? src.id : [src.id])
    .map((value) => String(value === undefined || value === null ? '' : value).trim())
    .filter((value) => value !== '');
  const visible = Number(src.is_show) === 1;
  return Promise.all(
    ids.map((id) =>
      request.post(`/api/v1/staff/products/${id}/visibility`, { visible }),
    ),
  ).then((results) => ({
    data: results.map((res) => toPageStaffProduct(res.data)),
    msg: '操作成功',
    status: 200,
  }));
}

/**
 * 商品标签
 */
export function getProductLabel() {
  return request.get('/api/v1/staff/product-labels', {}, { map: toPageProductLabels });
}

/**
 * 商品分类
 */
export function getProductCate() {
  return request.get('/api/v1/staff/product-categories', {}, { map: toPageProductCategories });
}

/**
 * 批量修改商品标签
 */
export function postBatchProcess(data) {
  return request.post(
    '/api/v1/staff/products/label-assignments',
    fromPageLabelAssignment(data),
    { msg: '操作成功' },
  );
}

/**
 * 批量修改商品分类
 */
export function postManageSaveCate(data) {
  return request.post(
    '/api/v1/staff/products/category-assignments',
    fromPageCategoryAssignment(data),
    { msg: '操作成功' },
  );
}

/**
 * 商品规格
 */
export function getManageProductAttr(id) {
  return request.get(`/api/v1/staff/products/${id}/skus`, {}, { map: toPageStaffSkus });
}

/**
 * 商品规格保存
 *
 * 多规格页 (`specs.vue`) 每行都带着 `unique`，直接转成 patch。单规格的抽屉
 * (`components/editPrice`) 开在列表行上，而列表路由不返回 SKU —— 那一行没有
 * `unique`。这时先读一次 `GET …/skus` 拿到唯一那条 SKU 的 id，再 PUT：多一次往返，
 * 换掉「让页面自己去猜一个 SKU id」这种只会在生产上出错的做法。
 */
export function postUpdateAttrs(id, data) {
  const rows = Array.isArray(data && data.attr_value) ? data.attr_value : [];
  const needsId = rows.some((row) => !row || row.unique === undefined || row.unique === '');
  const skus = needsId
    ? request.get(`/api/v1/staff/products/${id}/skus`, {}).then((res) => {
        const items = (res.data && res.data.items) || [];
        return items.length ? String(items[0].id) : '';
      })
    : Promise.resolve('');
  return skus.then((fallbackId) =>
    request.put(
      `/api/v1/staff/products/${id}/skus`,
      { items: rows.map((row) => fromPageSkuPatch(row, fallbackId)) },
      { map: toPageStaffSkus, msg: '保存成功' },
    ),
  );
}

/**
 * 运费模板选项
 */
export function getTemplateOption() {
  return request.get('/api/v1/staff/shipping-templates', {}, { map: toPageTemplateOptions });
}

/**
 * 创建商品
 */
export function productCreate(data) {
  return request.post('/api/v1/staff/products', fromPageStaffProductForm(data), {
    map: toPageStaffProduct,
    msg: '保存成功',
  });
}

// ---------------------------------------------------------------------------
// 用户管理 — 用户域的六条 `/api/v1/staff/*` 路由。
//
// 契约 next/packages/contracts/src/user/user.staff.contract.ts。契约有意比控制台薄：手机号永远打码，没有真实姓名 /
// 生日 / 身份证 / 地址——「一个店员该看到一个客户的多少」。
// ---------------------------------------------------------------------------

/**
 * 用户列表
 */
export function getUserList(data) {
  return request.get('/api/v1/staff/users', fromPageStaffUserQuery(data), {
    map: toPageStaffUserList,
  });
}

/**
 * 用户详情
 */
export function getUserInfo(uid) {
  return request.get(`/api/v1/staff/users/${uid}`, {}, { map: toPageStaffUser });
}

/**
 * 用户分组列表
 */
export function getGroupList() {
  return request.get('/api/v1/staff/user-groups', {}, { map: toPageUserGroups });
}

/**
 * 设置用户分组
 *
 * 列表页底部的批量「修改分组」送的是 uid 数组，路由一次只改一个人，所以扇出在这里。
 * `groupId` 为 null（未分组）原样送，不再被 `String()` 变成 `"null"`。
 */
export function postUserSetGroup(uid, groupId) {
  const body = fromPageUserGroupInput(groupId);
  return fanOutByUid(uid, (id) => request.post(`/api/v1/staff/users/${id}/group`, body), '设置成功');
}

/**
 * 用户标签
 *
 * 一次请求同时给出「全部标签」和「这个客户有哪些」（`assigned`），所以路由上的 `uid`
 * 必须是真实客户 id（`/^[1-9]\d*$/`）——字面量 `0` 是一个 422。
 *
 * 两处调用只要「全部标签」：筛选抽屉，和批量打标签的抽屉（它从空集开始）。没有单独的
 * 目录路由，所以不带 uid 调用时先取任意一个客户（`pageSize: 1`，不带筛选——当前筛选
 * 结果为空时筛选抽屉照样要有标签可选），再读它的标签并把 `assigned` 清掉。店里一个客
 * 户都没有时标签没有可打的对象，返回空目录。
 */
export function getUserLabel(uid) {
  const id = uid === undefined || uid === null ? '' : String(uid).trim();
  if (/^[1-9]\d*$/.test(id)) {
    return request.get(`/api/v1/staff/users/${id}/labels`, {}, { map: toPageUserLabels });
  }
  return request.get('/api/v1/staff/users', { page: 1, pageSize: 1 }).then((res) => {
    const first = res.data && Array.isArray(res.data.items) ? res.data.items[0] : null;
    if (!first) return { data: [], msg: '', status: 200 };
    return request.get(`/api/v1/staff/users/${first.id}/labels`, {}, {
      map: (dto) => toPageUserLabels(dto, { catalogue: true }),
    });
  });
}

/**
 * 设置用户标签
 *
 * body 是 `{labelIds: string[]}`；调用处本来就传数组，不能 `String(labelId)`
 * 拼成 `"[object Object],[object Object]"`。批量同样扇出。
 */
export function postUserSetLabel(uid, labelId) {
  const body = fromPageUserLabelInput(labelId);
  return fanOutByUid(uid, (id) => request.post(`/api/v1/staff/users/${id}/labels`, body), '设置成功');
}

/**
 * 批量操作的扇出：页面在「全选 → 操作」时送 uid 数组，路由按设计一次只动一个人。
 * 页面只读 `res.msg`，所以这里把每一次的返回按顺序收齐，msg 由调用方给。
 */
function fanOutByUid(uid, call, msg) {
  const ids = (Array.isArray(uid) ? uid : [uid])
    .map((value) => String(value === undefined || value === null ? '' : value).trim())
    .filter((value) => value !== '');
  return Promise.all(ids.map(call)).then((results) => ({
    data: results.map((res) => toPageStaffUser(res.data)),
    msg,
    status: 200,
  }));
}

// ---------------------------------------------------------------------------
// 赠送优惠券 — `GET /api/v1/staff/coupons` 和 `POST /api/v1/staff/coupon-grants`
// ，查看优惠券 — `GET /api/v1/staff/users/:uid/coupons`；
// 契约 next/packages/contracts/src/coupon/coupon.staff.contract.ts。
// ---------------------------------------------------------------------------

/**
 * 可赠送的优惠券 / 客户持有的优惠券
 *
 * 抽屉有两种用法。发券（`num` 为 0 / 1）不带 uid，读
 * `GET /api/v1/staff/coupons`，店里可发的券。详情页的「查看优惠券」（`num == 2`）
 * 带着 `uid` 问「这位客户手里有哪些券」：`GET /api/v1/staff/users/:uid/coupons`
 * ，答的是和「我的优惠券」同一个条目，所以用 `toPageUserCouponList`，
 * 可用的排在前面。这时抽屉不显示搜索框，`coupon_title` 不传。
 */
export function getUserCoupon(data) {
  const uid = data && data.uid !== undefined && data.uid !== null ? String(data.uid).trim() : '';
  if (uid && uid !== '0') {
    return request.get(`/api/v1/staff/users/${uid}/coupons`, {}, { map: toPageUserCouponList });
  }
  return request.get('/api/v1/staff/coupons', fromPageStaffCouponQuery(data), {
    map: toPageStaffCoupons,
  });
}

/**
 * 赠送优惠券
 *
 * 路由是扁平的 `POST /api/v1/staff/coupon-grants`，body `{userId, couponId}`，一次一位客户。页面送
 * uid 数组（单人时是一个元素的数组），扇出在这里；已达上限的客户是 200 +
 * `skippedUserIds`，toast 要把它说出来。
 */
export function postUserSetCoupon(uid, couponId) {
  const ids = (Array.isArray(uid) ? uid : [uid])
    .map((value) => String(value === undefined || value === null ? '' : value).trim())
    .filter((value) => value !== '');
  return Promise.all(
    ids.map((id) => request.post('/api/v1/staff/coupon-grants', fromPageCouponGrant(id, couponId))),
  ).then((results) => {
    const payloads = results.map((res) => res.data);
    return { data: payloads, msg: couponGrantMessage(payloads), status: 200 };
  });
}
