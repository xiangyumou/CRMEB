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
import {
  toLegacyArticleList,
  toLegacyArticleDetail,
  toLegacyArticleCategories,
} from './mappers/cms.js';
import { toLegacyCityTree } from './mappers/region.js';
import {
  toLegacyProfile,
  toLegacyWechatLogin,
  toLegacyOk,
  fromLegacySmsCodeInput,
  toLegacySmsCodeResult,
} from './mappers/user.js';
import { toLegacySubscribeTemplates } from './mappers/wechat.js';
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
  // CONTRACT-PENDING(G1) — 分类 / 个人中心 的版式开关 (`res.data.status`) 还没有路由；
  // 见 docs/rewrite/cr/CR-3-h2.md §3。两页拿不到就各自保持默认版式。
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

// ---------------------------------------------------------------------------
// 资讯（F2 / cms）
//
// Five legacy routes collapsed into two: `article/hot/list` and
// `article/banner/list` were the same query with one `where` swapped, so they are
// now `feature=hot` / `feature=banner` on the list.
// ---------------------------------------------------------------------------

/**
 * 文章分类
 */
export function getArticleCategoryList() {
  return request.get('/api/v1/article-categories', {}, {
    noAuth: true,
    map: toLegacyArticleCategories,
  });
}

/**
 * 文章列表
 * @param int cid 分类 id，0 表示全部
 * @param object data {page, limit}
 */
export function getArticleList(cid, data) {
  const query = fromLegacyPage(data);
  if (cid) query.categoryId = String(cid);
  return request.get('/api/v1/articles', query, { noAuth: true, map: toLegacyArticleList });
}

/**
 * 热门文章
 */
export function getArticleHotList() {
  return request.get('/api/v1/articles', { feature: 'hot' }, {
    noAuth: true,
    map: toLegacyArticleList,
  });
}

/**
 * 文章轮播
 */
export function getArticleBannerList() {
  return request.get('/api/v1/articles', { feature: 'banner' }, {
    noAuth: true,
    map: toLegacyArticleList,
  });
}

/**
 * 文章详情
 * @param int id
 */
export function getArticleDetails(id) {
  return request.get(`/api/v1/articles/${id}`, {}, {
    noAuth: true,
    map: toLegacyArticleDetail,
  });
}

/**
 * 省市区三级地区树
 */
export function getCity() {
  return request.get('/api/v1/cities', {}, { noAuth: true, map: toLegacyCityTree });
}

/**
 * DIY 文章组件
 */
export function getThemeArticle(data) {
  return request.get('/api/v1/articles', fromLegacyPage(data), {
    noAuth: true,
    map: toLegacyArticleList,
  });
}

/**
 * DIY 个人中心组件的用户卡片。只渲染头像和昵称，所以就是我的资料本身；
 * 和 `getUserInfo` 不同的是它不需要订单角标，一次读取就够。
 */
export function getThemeUser() {
  return request.get('/api/v1/profile', {}, { map: (dto) => toLegacyProfile(dto) });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(F1) — 站点公开配置：版权、客服入口、开屏广告。后台写得下
// (`/admin-api/system/config/:group`)，前台读不出来；见 docs/rewrite/cr/CR-7-h2.md。
// ---------------------------------------------------------------------------

export function getCrmebCopyRight() {
  return request.get('/api/v1/site/copyright', {}, { noAuth: true });
}

export function getCustomerType() {
  return request.get('/api/v1/site/customer-service', {}, { noAuth: true });
}

export function getOpenAdv() {
  return request.get('/api/v1/site/splash-ad', {}, { noAuth: true });
}

// ---------------------------------------------------------------------------
// 微信订阅消息（合约已合并）
// ---------------------------------------------------------------------------

/**
 * 小程序订阅消息模板 id.
 *
 * The contract asks per moment in the journey — `order-create`, `order-pay`,
 * `order-ship`, `refund` — where legacy answered with one map of every template it had
 * configured, keyed by an internal name. The page caches the whole thing once and
 * `utils/SubscribeMessage.js` keys into it, so the four reads are composed back into
 * one object here. An empty array is a normal answer: a shop with no templates
 * configured simply skips `wx.requestSubscribeMessage`, and a red toast about a
 * feature it deliberately does not use would be worse than silence — which is why
 * every one of the four is allowed to fail.
 */
const SUBSCRIBE_SCENES = ['order-create', 'order-pay', 'order-ship', 'refund'];

export function getTempIds() {
  return Promise.all(
    SUBSCRIBE_SCENES.map((scene) =>
      request
        .get('/api/v1/wechat/subscribe-templates', { scene }, { noAuth: true })
        .then((res) => toLegacySubscribeTemplates(res.data))
        .catch(() => []),
    ),
  ).then((lists) => {
    const data = {};
    SUBSCRIBE_SCENES.forEach((scene, i) => {
      data[scene] = lists[i];
    });
    return { data, msg: '', status: 200 };
  });
}

// 首页拼团人气条。`subpackage/diyComponents/combination.vue` 读的和
// `pages/activity/goods_combination` 读的是同一份 `{avatars, pink_count}`，所以这里
// 不再复制一遍实现，直接转出 `api/activity.js` 的那一个（它带着 CR-1-h2 的 marker）。
export { getPink as pink } from './activity.js';

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(E1) — 滑块/点选验证码。`pages/users/components/verify/**` 是一整套
// 行为验证码前端，前台没有出题和核验的路由；见 docs/rewrite/cr/CR-2-h2.md。
// ---------------------------------------------------------------------------

export function getAjcaptcha(data) {
  return request.get('/api/v1/auth/captcha', data, { noAuth: true });
}

export function ajcaptchaCheck(data) {
  return request.post('/api/v1/auth/captcha/verifications', data, { noAuth: true });
}

// ---------------------------------------------------------------------------
// 短信验证码 / 手机号
// ---------------------------------------------------------------------------

/**
 * 验证码 key。见 `api/user.js` 的 `getCodeApi`：图形验证码没有继任者，本地返回空 key。
 */
export function verifyCode() {
  return Promise.resolve({ data: { key: '' }, msg: '', status: 200 });
}

/**
 * 发送短信验证码（位置参数版本，`pages/users/user_phone` 这样调）
 */
export function registerVerify(phone, reset, key, captchaType, captchaVerification) {
  return sendSmsCode({
    phone,
    type: reset === undefined ? 'reset' : reset,
    captchaVerification,
  });
}

/**
 * 已登录用户改密码。旧接口走的是「手机号 + 验证码 + 新密码」的找回路径；新模型里
 * `PUT /api/v1/auth/password` 才是这一个 —— 它认当前登录态，改完把所有设备下线。
 */
export function phoneRegisterReset(data) {
  const src = data || {};
  return request.put(
    '/api/v1/auth/password',
    { code: String(src.captcha || src.code || ''), password: String(src.password || '') },
    { map: toLegacyOk, msg: '修改成功' },
  );
}

/**
 * 公众号绑定手机号并登录。`key` 是公众号登录在 `phone-required` 时发的 `bindToken`。
 */
export function bindingPhone(data) {
  const src = data || {};
  return request.post(
    '/api/v1/auth/sessions/wechat-oa/phone',
    {
      bindToken: String(src.key || src.bindToken || ''),
      phone: String(src.phone || ''),
      code: String(src.captcha || src.code || ''),
    },
    { noAuth: true, map: toLegacyWechatLogin },
  );
}

/**
 * 绑定手机号（已登录）。
 *
 * 旧接口的两步 `step` 流程（手机号已属于另一个账号时问「是否合并」）没有继任者：
 * 合并两个账号会把订单、退款、发票一起搬家，新模型直接 `AUTH_PHONE_TAKEN`。页面读
 * `res.data.is_bind` 拿不到值，就走它原来的成功分支。
 */
export function bindingUserPhone(data) {
  const src = data || {};
  return request.post(
    '/api/v1/auth/phone',
    { phone: String(src.phone || ''), code: String(src.captcha || src.code || '') },
    { map: toLegacyOk, msg: '绑定成功' },
  );
}

/**
 * 更换手机号。只要新号码上的验证码 —— 旧号码上也要一条读着漂亮，却正好锁死了这个
 * 页面存在的全部人群：换了号的人。
 */
export function updatePhone(data) {
  const src = data || {};
  return request.put(
    '/api/v1/auth/phone',
    { phone: String(src.phone || ''), code: String(src.captcha || src.code || '') },
    { map: toLegacyOk, msg: '修改成功' },
  );
}

/** Shared by both spellings of 发送验证码. */
function sendSmsCode(data) {
  return request.post('/api/v1/auth/sms-codes', fromLegacySmsCodeInput(data), {
    noAuth: true,
    map: toLegacySmsCodeResult,
    msg: '发送成功',
  });
}

// 多账号切换 (`switchH5Login`) 没有继任者：v1/v2 两套登录态并存才需要它，新模型里
// 一个 token 就是一个账号。`pages/users/user_info` 的 h5 切换分支已删除。
