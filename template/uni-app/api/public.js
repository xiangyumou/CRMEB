// 微信授权 / 站点公共配置
//
// Storefront auth, WeChat (公众号 and 小程序), the public site config and attachments.

import request from '../utils/request.js';
import wechat from '../libs/wechat.js';
import { toPageCategoryVersion } from './mappers/catalog.js';
import { toPageSession, toPageWechatLogin } from './mappers/user.js';
import { toPageJssdkConfig } from './mappers/wechat.js';
import { toPageBasicConfig, toPageLogo, toPageShare } from './mappers/system.js';
import { toPageNavigation } from './mappers/diy.js';
import { fromSiteConfig, toDataUrls } from './api.js';

/**
 * 商品分类版本号
 *
 * Two fields, not the whole tree: three call sites ask on every cold start, and
 * the tree is tens of kilobytes on mobile data. The route also sends the version
 * as an `ETag`.
 */
export function getCategoryVersion() {
  return request.get('/api/v1/catalog/categories/version', {}, {
    noAuth: true,
    map: toPageCategoryVersion,
  });
}

/**
 * 公众号 JS-SDK 配置
 */
export function getWechatConfig() {
  return request.get('/api/v1/wechat/jssdk-config', { url: wechat.signLink() }, {
    noAuth: true,
    map: toPageJssdkConfig,
  });
}

// ---------------------------------------------------------------------------
// 微信身份
//
// Two routes, 公众号 and 小程序, each answering `{status, session, bindToken}` with one
// token format and one notion of "bound". The four exports below are the names the
// pages call for those two operations.
//
// `status: 'phone-required'` means the openid resolved but nothing is bound to it yet;
// `bindToken` stands in for the openid for a few minutes so finishing the sign-in does
// not have to redeem the single-use WeChat `code` again — redeeming it twice is what
// sends a shopper round a 「请重新授权」 loop.
// ---------------------------------------------------------------------------

/**
 * 公众号 code 换登录态
 */
export function wechatAuthLogin(data) {
  const src = data || {};
  return request.post('/api/v1/auth/sessions/wechat-oa', { code: String(src.code || '') }, {
    noAuth: true,
    map: toPageWechatLogin,
  });
}

/**
 * 公众号授权（`libs/wechat.js` 的位置参数版本）。`spread` (分销上级) 已废弃。
 */
export function wechatAuthV2(code) {
  return wechatAuthLogin({ code });
}

/**
 * 小程序 code 换登录态。
 *
 * 页面分两步调：`authType` 探测「这个 openid 要不要绑手机号」，`authLogin` 再换
 * token。路由一步给完 —— 已绑定就直接是 `signed-in`，没绑定就是
 * `phone-required` 加一个 `bindToken`。`authType` 就是那一步。
 */
export function authType(data) {
  const src = data || {};
  return request
    .post('/api/v1/auth/sessions/wechat-mini', { code: String(src.code || '') }, {
      noAuth: true,
      map: toPageWechatLogin,
    })
    .then((res) => {
      lastMiniLogin = res.data;
      return res;
    });
}

/**
 * 小程序授权登录（「授权登录」按钮）。
 *
 * There is no second round trip left to make: `authType` already minted the session,
 * and the `wx.login` code it spent is single-use. So this hands back what that call
 * resolved with, and asks for a fresh authorisation if the page somehow got here
 * without one.
 */
export function authLogin() {
  if (lastMiniLogin && lastMiniLogin.token) {
    return Promise.resolve({ data: lastMiniLogin, msg: '', status: 200 });
  }
  const message = '请重新授权';
  return Promise.reject({ message, msg: message, status: 401 });
}

/** `libs/routine.js` calls this one; same route, and it does carry a fresh code. */
export function routineLogin(data) {
  return authType(data);
}

/** The last mini-program sign-in, so `authLogin` has something to answer with. */
let lastMiniLogin = null;

// 授权类型探测 (`silenceAuth`) is gone: it asked "does this shop use 静默 or 手动
// 授权", a question the two auth generations made necessary. Its only call sites were
// already commented out.

/**
 * 公众号绑定手机号并登录。
 *
 * `key` is the `bindToken` the OA sign-in handed back on `phone-required`. The OA has
 * no `getPhoneNumber`, so the proof is an SMS code — which is exactly what the page
 * already collects.
 */
export function wechatBindingPhone(data) {
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
 * 小程序授权手机号登录。
 *
 * `phoneCode` is what `getPhoneNumber`'s callback gives in the current API — a code
 * redeemed server-side. The `encryptedData` + `iv` path is deliberately unsupported:
 * decrypting it client-side needs `session_key` to leave the server, which is the one
 * thing WeChat's own docs say never to do. The two call sites pass `e.detail.code`.
 */
export function routineBindingPhone(data) {
  const src = data || {};
  return request.post(
    '/api/v1/auth/sessions/wechat-mini/phone',
    {
      bindToken: String(src.key || src.bindToken || ''),
      phoneCode: String(src.phoneCode || ''),
    },
    { noAuth: true, map: toPageWechatLogin },
  );
}

/**
 * 小程序「手机号 + 短信验证码」登录。
 *
 * Not a WeChat route: a typed phone and a typed SMS code is a plain SMS sign-in on any
 * platform, and `POST /auth/sessions/sms` registers the phone if it is new. The
 * `wx.login` code the page fetched first is unused; the openid is bound by the next
 * `authLogin`. See `api/user.js`'s `phoneSilenceAuth`, which is the same screen.
 */
export function phoneLogin(data) {
  const src = data || {};
  return request.post(
    '/api/v1/auth/sessions/sms',
    { phone: String(src.phone || ''), code: String(src.captcha || src.code || '') },
    { noAuth: true, map: toPageSession },
  );
}

// iframe / 单点登录换 token (`remoteRegister`) is gone: it had no call site, and the
// route it stood for — hand me a token for a user I name — is the shape the whole
// contract is built to refuse.

// 站点公开配置 — `GET /api/v1/site/config`，整个会话只读一次（`siteConfig()`，
// 在 `api/api.js`），每个函数取自己那一片。

/** App.vue 缓存成 `BASIC_CONFIG`；收银台读 `pay_weixin_open`。 */
export function basicConfig() {
  return fromSiteConfig(toPageBasicConfig);
}

/** 登录页（`type == 2`）和授权弹窗的 logo，`res.data.logo_url`。 */
export function getLogo(type) {
  return fromSiteConfig((dto) => toPageLogo(dto, type));
}

/** 默认分享卡片 `{title, synopsis, img}`。 */
export function getShare() {
  return fromSiteConfig(toPageShare);
}

// There is no 「当前访客是否已关注公众号」 (`getSubscribe`): answering it means reading the
// OA's follower list for a person, and the storefront surface deliberately exposes
// nothing about who is on the other end. `diyComponents/follow.vue` always renders
// the 未关注 state.

// ---------------------------------------------------------------------------
// 底部导航（装修）— `GET /api/v1/diy/navigation`
// ---------------------------------------------------------------------------

/**
 * 应答 `{navigation, version}`，`navigation` 是原样保存的 `pageFoot` 组件；两个读者
 * （`components/pageFooter` 的 `setNavigationInfo`、`goods_cate1` 的 `newData`）要的
 * 就是这个组件本身，mapper 把它取出来。`null`（还没发布首页）= 用原生 tabBar。
 */
export function getNavigation() {
  return request.get('/api/v1/diy/navigation', {}, { noAuth: true, map: toPageNavigation });
}

// ---------------------------------------------------------------------------
// 海报用的图片转 base64 — `POST /api/v1/attachments/base64`
// ---------------------------------------------------------------------------

/**
 * 页面一次要 `{image, code}` 两张；路由一次一张 `{url}`，只收本店附件
 * （防 SSRF），`auth: 'user'`。所以这里发两次，拼回 `{image, code}`。
 *
 * 商品图是海报的主体，它失败就整体失败（调用方各自 `catch`）。二维码是可选的：
 * 没有就不发；转不了（比如它根本不是本店附件）就原样交回，海报照旧画。
 */
export function imageBase64(image, code) {
  return toDataUrls(image, code);
}
