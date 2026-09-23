// 优惠券 / 装修 / 站点配置 / 文章 / 注册登录辅助
//
// Every call below goes to a route in `packages/contracts/openapi.json`.

import request from '../utils/request.js';
import {
  toPageCouponList,
  toPageCouponArray,
  toPageCouponPopup,
  toPageNewUserCouponPopup,
  toPageUserCouponList,
  toPageClaimResult,
  fromPageCouponState,
} from './mappers/coupon.js';
import {
  toPageDiyPage,
  toPageDiyVersion,
  toPageTheme,
  toPageLayout,
} from './mappers/diy.js';
import {
  toPageCopyright,
  toPageCustomerService,
  toPageSplashAd,
  fromPageBase64Input,
  toPageBase64,
} from './mappers/system.js';
import { fromPageProductQuery, toPageProductList } from './mappers/catalog.js';
import {
  toPageArticleList,
  toPageArticleDetail,
  toPageArticleCategories,
} from './mappers/cms.js';
import { toPageCityTree } from './mappers/region.js';
import {
  toPageProfile,
  toPageWechatLogin,
  toPageOk,
  fromPageSmsCodeInput,
  toPageSmsCodeResult,
} from './mappers/user.js';
import { toPageSubscribeTemplates } from './mappers/wechat.js';
import { fromPagePaging, idList, text, withPickedIds } from './mappers/_shared.js';

// ---------------------------------------------------------------------------
// 优惠券
// ---------------------------------------------------------------------------

/**
 * 可领取的优惠券列表
 * @param object data {page, limit, type}
 */
export function getCoupons(data) {
  return request.get('/api/v1/coupons', fromPagePaging(data), {
    noAuth: true,
    map: toPageCouponList,
  });
}

/**
 * 首页优惠券弹窗
 */
export function getCouponV2() {
  return request.get('/api/v1/coupons', { page: 1, pageSize: 20 }, {
    noAuth: true,
    map: toPageCouponPopup,
  });
}

/**
 * 新用户优惠券弹窗
 */
export function getCouponNewUser() {
  return request.get('/api/v1/coupons/new-user', {}, { noAuth: true, map: toPageNewUserCouponPopup });
}

/**
 * 领取优惠卷
 * @param int couponId 模板 id
 */
export function setCouponReceive(couponId) {
  return request.post(`/api/v1/coupons/${couponId}/claims`, {}, {
    map: toPageClaimResult,
    msg: '领取成功',
  });
}

/**
 * 我的优惠券
 * @param int types 0 全部 1 未使用 2 已使用
 * @param object data {page, limit}
 */
export function getUserCoupons(types, data) {
  const query = fromPagePaging(data);
  query.state = fromPageCouponState(types);
  return request.get('/api/v1/user-coupons', query, { map: toPageUserCouponList });
}

// ---------------------------------------------------------------------------
// 装修 / 主题
// ---------------------------------------------------------------------------

/**
 * `GET /api/v1/diy/layouts/:type`（`category | user`）→ 版式数字 1 / 2 / 3。
 * 分类页的版式由 `getThemeInfo('category')` 读，个人中心的由 `api/user.js` 的
 * `getMenuList()` 读。
 */
export function diyLayout(type, map) {
  return request.get(`/api/v1/diy/layouts/${type}`, {}, { noAuth: true, map });
}

/**
 * 获取装修数据
 * @param string type 'home' | 'category' | 'user' | 'detail'
 * @param object data {theme_id} 预览用
 */
export function getThemeInfo(type, data) {
  const src = data || {};
  // A `theme_id` names one page and wins over the type: 微页面
  // (`pages/annex/special?theme_id=`) asks for it as `getThemeInfo('home', {theme_id})`,
  // and an admin preview of the home page does the same.
  if (src.theme_id) {
    return request.get(`/api/v1/diy/pages/${src.theme_id}`, {}, {
      noAuth: true,
      map: toPageDiyPage,
    });
  }
  if (type === 'home' || type === undefined) {
    return request.get('/api/v1/diy/pages/home', {}, { noAuth: true, map: toPageDiyPage });
  }
  // 个人中心是一整页装修（`pages/user` 把它交给 PageDesign，读 `.value`），
  // `GET /api/v1/diy/pages/user-center`。它的「版式」数字在
  // `getMenuList()` 里（`api/user.js`）。
  if (type === 'user') {
    return request.get('/api/v1/diy/pages/user-center', {}, { noAuth: true, map: toPageDiyPage });
  }
  // 分类页的版式开关：`goods_cate` 读 `res.data.status`，1 / 2 / 3。
  if (type === 'category') {
    return diyLayout('category', toPageLayout);
  }
  // 商品详情整页都是装修（`pages/goods_details` 把它交给 PageDesign，底部栏读其中的
  // `bottomMenu`）：`GET /api/v1/diy/pages/product-detail`。没发布过
  // 商品详情页的店铺拿到内置默认页（`id` 为 null），所以这条读永远有内容。
  if (type === 'detail') {
    return request.get('/api/v1/diy/pages/product-detail', {}, {
      noAuth: true,
      map: toPageDiyPage,
    });
  }
  // 其余类型没有按类型读装修页的路由。不上网，给一页空装修。
  return Promise.resolve({ data: {}, msg: '', status: 200 });
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
    map: toPageDiyVersion,
  });
}

/**
 * 一键换色
 * @param string name
 */
export function colorChange(name) {
  // No theme published is a 404 (`DIY_THEME_NOT_FOUND`), not an error to the
  // shopper: the built-in default palette.
  return request
    .get('/api/v1/diy/theme', {}, { noAuth: true, map: toPageTheme })
    .catch((err) => {
      if (err && err.status === 404) return { data: toPageTheme(null), msg: '', status: 200 };
      throw err;
    });
}

/**
 * 超级组件：商品。指定数据传 `ids`，指定分类传 `cate_ids`；
 * 商品排序 `order`（0 销量 / 1 价格）与排序规则 `sort`（0 降序 / 1 升序）只在指定分类下生效，
 * 指定数据按选择的顺序展示。
 */
export function getThemeProduct(data) {
  const src = data || {};
  const sorted = idList(src.ids).length === 0;
  const direction = String(src.sort) === '1' ? 'asc' : 'desc';
  const query = fromPageProductQuery({
    ids: src.ids,
    cate_ids: src.cate_ids,
    limit: src.limit,
    salesOrder: sorted && String(src.order) === '0' ? direction : '',
    priceOrder: sorted && String(src.order) === '1' ? direction : '',
  });
  return request.get('/api/v1/catalog/products', query, { noAuth: true, map: toPageProductList });
}

/**
 * 超级组件：优惠券。指定数据传 `ids`（券模板 id），按选择的顺序展示，已不可领取的券不展示。
 * 筛选数据下的券类型、门槛、时间等条件没有对应的查询参数，展示的是可领取的券。
 */
export function getThemeCoupon(data) {
  const query = fromPagePaging(data);
  withPickedIds(query, (data || {}).ids);
  return request.get('/api/v1/coupons', query, {
    noAuth: true,
    map: toPageCouponArray,
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
// 资讯（cms）
//
// 热门和轮播是同一个列表查询换一个条件：`feature=hot` / `feature=banner`。
// ---------------------------------------------------------------------------

/**
 * 文章分类
 */
export function getArticleCategoryList() {
  return request.get('/api/v1/article-categories', {}, {
    noAuth: true,
    map: toPageArticleCategories,
  });
}

/**
 * 文章列表
 * @param int cid 分类 id，0 表示全部
 * @param object data {page, limit}
 */
export function getArticleList(cid, data) {
  const query = fromPagePaging(data);
  if (cid) query.categoryId = String(cid);
  return request.get('/api/v1/articles', query, { noAuth: true, map: toPageArticleList });
}

/**
 * 热门文章
 */
export function getArticleHotList() {
  return request.get('/api/v1/articles', { feature: 'hot' }, {
    noAuth: true,
    map: toPageArticleList,
  });
}

/**
 * 文章轮播
 */
export function getArticleBannerList() {
  return request.get('/api/v1/articles', { feature: 'banner' }, {
    noAuth: true,
    map: toPageArticleList,
  });
}

/**
 * 文章详情
 * @param int id
 */
export function getArticleDetails(id) {
  return request.get(`/api/v1/articles/${id}`, {}, {
    noAuth: true,
    map: toPageArticleDetail,
  });
}

/**
 * 省市区三级地区树
 */
export function getCity() {
  return request.get('/api/v1/cities', {}, { noAuth: true, map: toPageCityTree });
}

/**
 * 超级组件：文章。指定数据传 `ids`，按选择的顺序展示，未发布的文章不展示；
 * 筛选数据传分类 `cid`（一个或以 `,` 连接的多个）。
 */
export function getThemeArticle(data) {
  const src = data || {};
  const query = fromPagePaging(src);
  if (!withPickedIds(query, src.ids)) {
    const categories = idList(src.cid);
    if (categories.length) query.categoryIds = categories.join(',');
  }
  return request.get('/api/v1/articles', query, {
    noAuth: true,
    map: toPageArticleList,
  });
}

/**
 * DIY 个人中心组件的用户卡片。只渲染头像和昵称，所以就是我的资料本身；
 * 和 `getUserInfo` 不同的是它不需要订单角标，一次读取就够。
 */
export function getThemeUser() {
  return request.get('/api/v1/profile', {}, { map: (dto) => toPageProfile(dto) });
}

// ---------------------------------------------------------------------------
// 站点公开配置 — `GET /api/v1/site/config`
//
// 一个公开路由，六个读者（这里三个，`api/public.js` 三个）。整个会话只读一次：
// `siteConfig()` 缓存那一次请求的 promise，每个函数用 `api/mappers/system.js` 里
// 各自的 mapper 取自己那一片，页面读的字段名不变。失败不缓存，下一次调用
// 重试。
// ---------------------------------------------------------------------------

let siteConfigRead = null;

/** The one `GET /api/v1/site/config` per session, shared by every reader below. */
export function siteConfig() {
  if (!siteConfigRead) {
    siteConfigRead = request.get('/api/v1/site/config', {}, { noAuth: true }).catch((err) => {
      siteConfigRead = null;
      throw err;
    });
  }
  return siteConfigRead;
}

/** Tests only: forget the cached read. */
export function resetSiteConfig() {
  siteConfigRead = null;
}

/** A page's reader of one slice of the site config, in the usual envelope. */
export function fromSiteConfig(select) {
  return siteConfig().then((res) => ({ data: select(res.data), msg: '', status: 200 }));
}

/** 版权文字 / 版权图片（首页、个人中心、登录页、隐私弹窗） */
export function getCrmebCopyRight() {
  return fromSiteConfig(toPageCopyright);
}

/** 客服入口：每个读者只要 `customer_qrcode` */
export function getCustomerType() {
  return fromSiteConfig(toPageCustomerService);
}

/** 开屏广告（`pages/guide`） */
export function getOpenAdv() {
  return fromSiteConfig(toPageSplashAd);
}

/**
 * 海报图片转 base64 的两次请求，`api/public.js` 的 `imageBase64` 和 `api/user.js` 的
 * `imgToBase` 共用（`POST /api/v1/attachments/base64`，一次一张 `{url}`）。
 * 商品图失败就整体失败；二维码可选，转不了就原样交回。
 */
export function toDataUrls(image, code) {
  // An image that already is a `data:` URL — or no image at all — needs no
  // round trip: the route would refuse either (a 422 on every poster).
  const one = (url) =>
    /^data:image\//i.test(text(url).trim()) || !text(url).trim()
      ? Promise.resolve({ data: text(url).trim(), msg: '', status: 200 })
      : request.post('/api/v1/attachments/base64', fromPageBase64Input(url), { map: toPageBase64 });
  const codeUrl = text(code).trim();
  return Promise.all([
    one(image),
    codeUrl ? one(codeUrl).catch(() => ({ data: codeUrl })) : Promise.resolve({ data: '' }),
  ]).then(([img, qr]) => ({ data: { image: img.data, code: qr.data }, msg: '', status: 200 }));
}

// ---------------------------------------------------------------------------
// 微信订阅消息（合约已合并）
// ---------------------------------------------------------------------------

/**
 * 小程序订阅消息模板 id.
 *
 * The contract asks per moment in the journey — `order-create`, `order-pay`,
 * `order-ship`, `refund`, while the page wants one map of every configured template,
 * keyed by an internal name. The page caches the whole thing once and
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
        .then((res) => toPageSubscribeTemplates(res.data))
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
// 不再复制一遍实现，直接转出 `api/activity.js` 的那一个（兜底逻辑在那边）。
export { getPink as pink } from './activity.js';

// 没有行为验证码（滑块 / 点选）：客户端自己出题自己判卷的滑块挡不住任何人，却给每个
// 登录页加了一次往返。短信开销由「每手机号每小时 / 每天」「每来源地址每天」的预算和
// 一个重发冷却兜住。服务端留了 `registerCaptchaVerifier` 这个缝，真要接第三方验证码
// 时只改那一处。各页的「获取验证码」按钮直接发短信。

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
 *
 * 第三、四、五个参数（图形验证码 key、行为验证码类型和答案）都没有继任者，签名里
 * 不再留占位符；调用处也已经不传了。
 */
export function registerVerify(phone, reset) {
  return sendSmsCode({ phone, type: reset === undefined ? 'reset' : reset });
}

/**
 * 已登录用户改密码：`PUT /api/v1/auth/password` 认当前登录态（外加短信验证码），
 * 改完把所有设备下线。
 */
export function phoneRegisterReset(data) {
  const src = data || {};
  return request.put(
    '/api/v1/auth/password',
    { code: String(src.captcha || src.code || ''), password: String(src.password || '') },
    { map: toPageOk, msg: '修改成功' },
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
    { noAuth: true, map: toPageWechatLogin },
  );
}

/**
 * 绑定手机号（已登录）。
 *
 * 手机号已属于另一个账号时不问「是否合并」（页面的 `step` 分支）：合并两个账号会把
 * 订单、退款、发票一起搬家，路由直接 `AUTH_PHONE_TAKEN`。页面读 `res.data.is_bind`
 * 拿不到值，就走成功分支。
 */
export function bindingUserPhone(data) {
  const src = data || {};
  return request.post(
    '/api/v1/auth/phone',
    { phone: String(src.phone || ''), code: String(src.captcha || src.code || '') },
    { map: toPageOk, msg: '绑定成功' },
  );
}

/**
 * 更换手机号。只要新号码上的验证码 —— 原号码上也要一条读着漂亮，却正好锁死了这个
 * 页面存在的全部人群：换了号的人。
 */
export function updatePhone(data) {
  const src = data || {};
  return request.put(
    '/api/v1/auth/phone',
    { phone: String(src.phone || ''), code: String(src.captcha || src.code || '') },
    { map: toPageOk, msg: '修改成功' },
  );
}

/** Shared by both spellings of 发送验证码. */
function sendSmsCode(data) {
  return request.post('/api/v1/auth/sms-codes', fromPageSmsCodeInput(data), {
    noAuth: true,
    map: toPageSmsCodeResult,
    msg: '发送成功',
  });
}

// 没有多账号切换 (`switchH5Login`)：一个 token 就是一个账号。
