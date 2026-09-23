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
//    to streams A and E1; A2 and E4 shipped them as `/api/v1/staff/*` and H3 bound
//    them here. Their reshaping lives in `api/mappers/staff.js` too.

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
  fromLegacyStaffProductQuery,
  toLegacyStaffProduct,
  toLegacyStaffProductList,
  toLegacyProductLabels,
  toLegacyProductCategories,
  fromLegacyLabelAssignment,
  fromLegacyCategoryAssignment,
  toLegacyStaffSkus,
  fromLegacySkuPatch,
  toLegacyTemplateOptions,
  fromLegacyStaffProductForm,
  fromLegacyStaffUserQuery,
  toLegacyStaffUser,
  toLegacyStaffUserList,
  toLegacyUserGroups,
  toLegacyUserLabels,
  fromLegacyUserGroupInput,
  fromLegacyUserLabelInput,
} from './mappers/staff.js';
import { toLegacyShipment } from './mappers/fulfil.js';
import {
  fromLegacyStaffCouponQuery,
  toLegacyStaffCoupons,
  toLegacyUserCouponList,
  fromLegacyCouponGrant,
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
// 商品管理 — A2 的十条 `/api/v1/staff/*` 路由（CR-4-h2 全盘接受）。
//
// 契约 next/packages/contracts/src/catalog/catalog.staff.contract.ts，字段表在
// docs/rewrite/status/a2.md §1。都是 `auth: 'staff'`：店员不是角色，是 B2 的
// `orderStaff` 名单，在名单上就行，不在就是 403。
//
// 三处批量操作页面送的是**数组**，而路由按设计是单条（一个商品一个 `:id`），所以
// 扇出在这里做，页面不动：下架多选、以及下面 用户管理 的分组/标签/发券。
// ---------------------------------------------------------------------------

/**
 * 商品列表
 */
export function adminProductList(data) {
  return request.get('/api/v1/staff/products', fromLegacyStaffProductQuery(data), {
    map: toLegacyStaffProductList,
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
    data: results.map((res) => toLegacyStaffProduct(res.data)),
    msg: '操作成功',
    status: 200,
  }));
}

/**
 * 商品标签
 */
export function getProductLabel() {
  return request.get('/api/v1/staff/product-labels', {}, { map: toLegacyProductLabels });
}

/**
 * 商品分类
 */
export function getProductCate() {
  return request.get('/api/v1/staff/product-categories', {}, { map: toLegacyProductCategories });
}

/**
 * 批量修改商品标签
 */
export function postBatchProcess(data) {
  return request.post(
    '/api/v1/staff/products/label-assignments',
    fromLegacyLabelAssignment(data),
    { msg: '操作成功' },
  );
}

/**
 * 批量修改商品分类
 */
export function postManageSaveCate(data) {
  return request.post(
    '/api/v1/staff/products/category-assignments',
    fromLegacyCategoryAssignment(data),
    { msg: '操作成功' },
  );
}

/**
 * 商品规格
 */
export function getManageProductAttr(id) {
  return request.get(`/api/v1/staff/products/${id}/skus`, {}, { map: toLegacyStaffSkus });
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
      { items: rows.map((row) => fromLegacySkuPatch(row, fallbackId)) },
      { map: toLegacyStaffSkus, msg: '保存成功' },
    ),
  );
}

/**
 * 运费模板选项
 */
export function getTemplateOption() {
  return request.get('/api/v1/staff/shipping-templates', {}, { map: toLegacyTemplateOptions });
}

/**
 * 创建商品
 */
export function productCreate(data) {
  return request.post('/api/v1/staff/products', fromLegacyStaffProductForm(data), {
    map: toLegacyStaffProduct,
    msg: '保存成功',
  });
}

// ---------------------------------------------------------------------------
// 用户管理 — E4 的六条 `/api/v1/staff/*` 路由（CR-2-h2 §3）。
//
// 契约 next/packages/contracts/src/user/user.staff.contract.ts，字段表在
// docs/rewrite/status/e4.md。契约有意比控制台薄：手机号永远打码，没有真实姓名 /
// 生日 / 身份证 / 地址——「一个店员该看到一个客户的多少」。
//
// 这一节原来的三个包装器是照着 CR-2-h2 的草图写的，跟真正落地的契约对不上，E4 把
// 三处都点了名，都在下面改掉了。
// ---------------------------------------------------------------------------

/**
 * 用户列表
 */
export function getUserList(data) {
  return request.get('/api/v1/staff/users', fromLegacyStaffUserQuery(data), {
    map: toLegacyStaffUserList,
  });
}

/**
 * 用户详情
 */
export function getUserInfo(uid) {
  return request.get(`/api/v1/staff/users/${uid}`, {}, { map: toLegacyStaffUser });
}

/**
 * 用户分组列表
 */
export function getGroupList() {
  return request.get('/api/v1/staff/user-groups', {}, { map: toLegacyUserGroups });
}

/**
 * 设置用户分组
 *
 * 列表页底部的批量「修改分组」送的是 uid 数组，路由一次只改一个人，所以扇出在这里。
 * `groupId` 为 null（未分组）原样送，不再被 `String()` 变成 `"null"`。
 */
export function postUserSetGroup(uid, groupId) {
  const body = fromLegacyUserGroupInput(groupId);
  return fanOutByUid(uid, (id) => request.post(`/api/v1/staff/users/${id}/group`, body), '设置成功');
}

/**
 * 用户标签
 *
 * 一次请求同时给出「全部标签」和「这个客户有哪些」（`assigned`），所以路由上的 `uid`
 * 必须是真实客户 id（`/^[1-9]\d*$/`）——旧代码传字面量 `0`，那是一个 422（E4 第 2 条）。
 *
 * 两处调用只要「全部标签」：筛选抽屉，和批量打标签的抽屉（它从空集开始）。没有单独的
 * 目录路由，所以不带 uid 调用时先取任意一个客户（`pageSize: 1`，不带筛选——当前筛选
 * 结果为空时筛选抽屉照样要有标签可选），再读它的标签并把 `assigned` 清掉。店里一个客
 * 户都没有时标签没有可打的对象，返回空目录。
 */
export function getUserLabel(uid) {
  const id = uid === undefined || uid === null ? '' : String(uid).trim();
  if (/^[1-9]\d*$/.test(id)) {
    return request.get(`/api/v1/staff/users/${id}/labels`, {}, { map: toLegacyUserLabels });
  }
  return request.get('/api/v1/staff/users', { page: 1, pageSize: 1 }).then((res) => {
    const first = res.data && Array.isArray(res.data.items) ? res.data.items[0] : null;
    if (!first) return { data: [], msg: '', status: 200 };
    return request.get(`/api/v1/staff/users/${first.id}/labels`, {}, {
      map: (dto) => toLegacyUserLabels(dto, { catalogue: true }),
    });
  });
}

/**
 * 设置用户标签
 *
 * body 是 `{labelIds: string[]}`；调用处本来就传数组，旧包装器却写 `String(labelId)`，
 * 把它拼成 `"[object Object],[object Object]"`（E4 第 1 条）。批量同样扇出。
 */
export function postUserSetLabel(uid, labelId) {
  const body = fromLegacyUserLabelInput(labelId);
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
    data: results.map((res) => toLegacyStaffUser(res.data)),
    msg,
    status: 200,
  }));
}

// ---------------------------------------------------------------------------
// 赠送优惠券 — B3 的 `GET /api/v1/staff/coupons` 和 `POST /api/v1/staff/coupon-grants`
// （CR-5-h2 §2），查看优惠券 — `GET /api/v1/staff/users/:uid/coupons`（CR-1-h3）；
// 契约 next/packages/contracts/src/coupon/coupon.staff.contract.ts。
// ---------------------------------------------------------------------------

/**
 * 可赠送的优惠券 / 客户持有的优惠券
 *
 * 抽屉有两种用法。发券（`num` 为 0 / 1）不带 uid，读 B3 的
 * `GET /api/v1/staff/coupons`，店里可发的券。详情页的「查看优惠券」（`num == 2`）
 * 带着 `uid` 问「这位客户手里有哪些券」：`GET /api/v1/staff/users/:uid/coupons`
 * （CR-1-h3），答的是和「我的优惠券」同一个条目，所以用 `toLegacyUserCouponList`，
 * 可用的排在前面。这时抽屉不显示搜索框，`coupon_title` 不传。
 */
export function getUserCoupon(data) {
  const uid = data && data.uid !== undefined && data.uid !== null ? String(data.uid).trim() : '';
  if (uid && uid !== '0') {
    return request.get(`/api/v1/staff/users/${uid}/coupons`, {}, { map: toLegacyUserCouponList });
  }
  return request.get('/api/v1/staff/coupons', fromLegacyStaffCouponQuery(data), {
    map: toLegacyStaffCoupons,
  });
}

/**
 * 赠送优惠券
 *
 * 旧的嵌套路径 `POST /api/v1/staff/users/:uid/coupons` 没有落地，B3 给的是扁平的
 * `POST /api/v1/staff/coupon-grants`，body `{userId, couponId}`，一次一位客户。页面送
 * uid 数组（单人时是一个元素的数组），扇出在这里；已达上限的客户是 200 +
 * `skippedUserIds`，toast 要把它说出来。
 */
export function postUserSetCoupon(uid, couponId) {
  const ids = (Array.isArray(uid) ? uid : [uid])
    .map((value) => String(value === undefined || value === null ? '' : value).trim())
    .filter((value) => value !== '');
  return Promise.all(
    ids.map((id) => request.post('/api/v1/staff/coupon-grants', fromLegacyCouponGrant(id, couponId))),
  ).then((results) => {
    const payloads = results.map((res) => res.data);
    return { data: payloads, msg: couponGrantMessage(payloads), status: 200 };
  });
}
