// 优惠券 / 装修 / 站点配置 / 文章 / 注册登录辅助
//
// Split by owning stream: the coupon and diy calls below are live against merged
// contracts; everything marked CONTRACT-PENDING is listed in docs/rewrite/status/h.md.

import request from '../utils/request.js';
import {
  toLegacyCouponList,
  toLegacyCouponArray,
  toLegacyUserCouponList,
  toLegacyClaimResult,
  fromLegacyCouponState,
} from './mappers/coupon.js';
import { toLegacyDiyPage, toLegacyDiyVersion, toLegacyTheme } from './mappers/diy.js';
import { toLegacyProductList } from './mappers/catalog.js';
import { fromLegacyPage } from './mappers/_shared.js';

// ---------------------------------------------------------------------------
// 优惠券
// ---------------------------------------------------------------------------

/**
 * 可领取的优惠券列表
 * @param object data {page, limit, type}
 */
export function getCoupons(data) {
  return request.get('/api/v1/coupons', fromLegacyPage(data), {
    noAuth: true,
    map: toLegacyCouponList,
  });
}

/**
 * 首页优惠券弹窗
 */
export function getCouponV2() {
  return request.get('/api/v1/coupons', { page: 1, pageSize: 20 }, {
    noAuth: true,
    map: toLegacyCouponArray,
  });
}

/**
 * 新用户优惠券弹窗
 */
export function getCouponNewUser() {
  return request.get('/api/v1/coupons/new-user', {}, { noAuth: true, map: toLegacyCouponArray });
}

/**
 * 领取优惠卷
 * @param int couponId 模板 id
 */
export function setCouponReceive(couponId) {
  return request.post(`/api/v1/coupons/${couponId}/claims`, {}, {
    map: toLegacyClaimResult,
    msg: '领取成功',
  });
}

/**
 * 我的优惠券
 * @param int types 0 全部 1 未使用 2 已使用
 * @param object data {page, limit}
 */
export function getUserCoupons(types, data) {
  const query = fromLegacyPage(data);
  query.state = fromLegacyCouponState(types);
  return request.get('/api/v1/user-coupons', query, { map: toLegacyUserCouponList });
}

// ---------------------------------------------------------------------------
// 装修 / 主题
// ---------------------------------------------------------------------------

/**
 * 获取装修数据
 * @param string type 'home' | 'category' | 'user' …
 * @param object data {theme_id} 预览用
 */
export function getThemeInfo(type, data) {
  const src = data || {};
  if (type === 'home' || type === undefined) {
    return request.get('/api/v1/diy/pages/home', {}, { noAuth: true, map: toLegacyDiyPage });
  }
  if (src.theme_id) {
    return request.get(`/api/v1/diy/pages/${src.theme_id}`, {}, {
      noAuth: true,
      map: toLegacyDiyPage,
    });
  }
  // CONTRACT-PENDING(G1) — 分类 / 个人中心 的版式开关 (`res.data.status`) 还没有路由。
  return request.get(`/api/v1/diy/layouts/${type}`, {}, { noAuth: true });
}

// ---------------------------------------------------------------------------
// 装修（合约已合并）
// ---------------------------------------------------------------------------

/**
 * 获取 DIY 版本号
 * @param string name 页面标识
 */
export function getDiyVersion(name) {
  return request.get('/api/v1/diy/version', name ? { id: String(name) } : {}, {
    noAuth: true,
    map: toLegacyDiyVersion,
  });
}

/**
 * 一键换色
 * @param string name
 */
export function colorChange(name) {
  return request.get('/api/v1/diy/theme', {}, { noAuth: true, map: toLegacyTheme });
}

/**
 * DIY 组件：商品列表
 */
export function getThemeProduct(data) {
  const query = fromLegacyPage(data);
  const src = data || {};
  if (src.cid) query.categoryId = String(src.cid);
  return request.get('/api/v1/catalog/products', query, { noAuth: true, map: toLegacyProductList });
}

/**
 * DIY 组件：优惠券列表
 */
export function getThemeCoupon(data) {
  return request.get('/api/v1/coupons', fromLegacyPage(data), {
    noAuth: true,
    map: toLegacyCouponArray,
  });
}

// ---------------------------------------------------------------------------
// 搜索历史
// ---------------------------------------------------------------------------

/**
 * 个人搜索历史
 */
export function searchList(data) {
  return request.get('/api/v1/me/search-history', {}, {
    map: (dto) => (dto && dto.items ? dto.items.map((k) => ({ keyword: String(k.keyword || '') })) : []),
  });
}

/**
 * 删除搜索历史
 */
export function clearSearch() {
  return request.delete('/api/v1/me/search-history', {}, { msg: '清除成功' });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING — 待其他 stream 的合约落地
// ---------------------------------------------------------------------------

// CONTRACT-PENDING(F2) — cms 域：文章分类 / 列表 / 详情 / 热门 / 轮播。
export function getArticleCategoryList() {
  return request.get('/api/v1/articles/categories', {}, { noAuth: true });
}

export function getArticleList(cid, data) {
  return request.get('/api/v1/articles', Object.assign({ categoryId: String(cid) }, fromLegacyPage(data)), {
    noAuth: true,
  });
}

export function getArticleHotList() {
  return request.get('/api/v1/articles', { feature: 'hot' }, { noAuth: true });
}

export function getArticleBannerList() {
  return request.get('/api/v1/articles', { feature: 'banner' }, { noAuth: true });
}

export function getArticleDetails(id) {
  return request.get(`/api/v1/articles/${id}`, {}, { noAuth: true });
}

// CONTRACT-PENDING(F2) — 省市区。
export function getCity() {
  return request.get('/api/v1/regions', {}, { noAuth: true });
}

// CONTRACT-PENDING(F2) — DIY 文章组件。
export function getThemeArticle(data) {
  return request.get('/api/v1/articles', fromLegacyPage(data), { noAuth: true });
}

// CONTRACT-PENDING(E1) — DIY 个人中心组件的用户卡片。
export function getThemeUser() {
  return request.get('/api/v1/me/profile', {}, { noAuth: true });
}

// CONTRACT-PENDING(F1) — 站点公开配置：版权、客服入口、开屏广告。
export function getCrmebCopyRight() {
  return request.get('/api/v1/site/copyright', {}, { noAuth: true });
}

export function getCustomerType() {
  return request.get('/api/v1/site/customer-service', {}, { noAuth: true });
}

export function getOpenAdv() {
  return request.get('/api/v1/site/splash-ad', {}, { noAuth: true });
}

// CONTRACT-PENDING(E2) — 订阅消息模板 id。
export function getTempIds() {
  return request.get('/api/v1/wechat/subscribe-templates', {}, { noAuth: true });
}

// CONTRACT-PENDING(D) — 首页拼团数据。
export function pink() {
  return request.get('/api/v1/groupbuys', {}, { noAuth: true });
}

// CONTRACT-PENDING(E1) — 图形/滑块验证码、短信验证码、手机号绑定与找回。
export function getAjcaptcha(data) {
  return request.get('/api/v1/auth/captcha', data, { noAuth: true });
}

export function ajcaptchaCheck(data) {
  return request.post('/api/v1/auth/captcha/verifications', data, { noAuth: true });
}

export function verifyCode() {
  return request.get('/api/v1/auth/sms-key', {}, { noAuth: true });
}

export function registerVerify(phone, reset, key, captchaType, captchaVerification) {
  return request.post(
    '/api/v1/auth/sms-codes',
    {
      phone,
      purpose: reset === undefined ? 'reset' : reset,
      key,
      captchaType,
      captchaVerification,
    },
    { noAuth: true },
  );
}

export function phoneRegisterReset(data) {
  return request.post('/api/v1/auth/password-resets', data, { noAuth: true });
}

export function bindingPhone(data) {
  return request.post('/api/v1/auth/phone-bindings', data, { noAuth: true });
}

export function bindingUserPhone(data) {
  return request.post('/api/v1/me/phone', data);
}

export function updatePhone(data) {
  return request.put('/api/v1/me/phone', data);
}

export function switchH5Login() {
  return request.post('/api/v1/auth/session-transfers', {});
}
