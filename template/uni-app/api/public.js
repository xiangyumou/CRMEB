// 微信授权 / 站点公共配置
//
// Streams E1/E4 (storefront auth), E2 (WeChat OA and mini-program) and F1/F4 (public
// site config, attachments). Every call is live; docs/rewrite/status/h.md and h3.md
// have the per-call tables.

import request from '../utils/request.js';
import wechat from '../libs/wechat.js';
import { toLegacyCategoryVersion } from './mappers/catalog.js';
import { toLegacySession, toLegacyWechatLogin } from './mappers/user.js';
import { toLegacyJssdkConfig } from './mappers/wechat.js';
import { toLegacyBasicConfig, toLegacyLogo, toLegacyShare } from './mappers/system.js';
import { toLegacyNavigation } from './mappers/diy.js';
import { fromSiteConfig, toDataUrls } from './api.js';

/**
 * 商品分类版本号
 *
 * Two fields since CR-3-h. This used to fetch the whole tree — tens of kilobytes
 * on mobile data — and throw it away to learn one string, on every cold start,
 * from three call sites. The route also sends the version as an `ETag`;
 * `If-None-Match` on the tree route itself is CR-1-s.
 */
export function getCategoryVersion() {
  return request.get('/api/v1/catalog/categories/version', {}, {
    noAuth: true,
    map: toLegacyCategoryVersion,
  });
}

/**
 * 公众号 JS-SDK 配置
 */
export function getWechatConfig() {
  return request.get('/api/v1/wechat/jssdk-config', { url: wechat.signLink() }, {
    noAuth: true,
    map: toLegacyJssdkConfig,
  });
}

// ---------------------------------------------------------------------------
// 微信身份
//
// One generation of auth, not two. The legacy system carried `mp_auth` /
// `wechat/auth_login` **and** `routine/auth_*` / `v2/wechat/auth_*` side by side, each
// with its own token format and its own notion of "bound", and the uni-app picked
// between them at runtime — which is why there were four exports below for two
// operations. There are two routes now: 公众号 and 小程序, each answering
// `{status, session, bindToken}`.
//
// `status: 'phone-required'` means the openid resolved but nothing is bound to it yet;
// `bindToken` stands in for the openid for a few minutes so finishing the sign-in does
// not have to redeem the single-use WeChat `code` again. The legacy 「请重新授权」 loop
// came from exactly that.
// ---------------------------------------------------------------------------

/**
 * 公众号 code 换登录态
 */
export function wechatAuthLogin(data) {
  const src = data || {};
  return request.post('/api/v1/auth/sessions/wechat-oa', { code: String(src.code || '') }, {
    noAuth: true,
    map: toLegacyWechatLogin,
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
 * 旧版分两步：`authType` 先探测「这个 openid 要不要绑手机号」，再由 `authLogin` 用探
 * 测拿到的 key 真正换 token。新合约一步给完 —— 已绑定就直接是 `signed-in`，没绑定就是
 * `phone-required` 加一个 `bindToken`。`authType` 就是那一步。
 */
export function authType(data) {
  const src = data || {};
  return request
    .post('/api/v1/auth/sessions/wechat-mini', { code: String(src.code || '') }, {
      noAuth: true,
      map: toLegacyWechatLogin,
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
    { noAuth: true, map: toLegacyWechatLogin },
  );
}

/**
 * 小程序授权手机号登录。
 *
 * `phoneCode` is what `getPhoneNumber`'s callback gives in the current API — a code
 * redeemed server-side. The old `encryptedData` + `iv` path is deliberately not
 * ported: decrypting it client-side needed `session_key` to leave the server, which
 * is the one thing WeChat's own docs say never to do. The two call sites now pass
 * `e.detail.code`.
 */
export function routineBindingPhone(data) {
  const src = data || {};
  return request.post(
    '/api/v1/auth/sessions/wechat-mini/phone',
    {
      bindToken: String(src.key || src.bindToken || ''),
      phoneCode: String(src.phoneCode || ''),
    },
    { noAuth: true, map: toLegacyWechatLogin },
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
    { noAuth: true, map: toLegacySession },
  );
}

// iframe / 单点登录换 token (`remoteRegister`) is gone: it had no call site, and the
// route it stood for — hand me a token for a user I name — is the shape the whole
// contract is built to refuse.

// 站点公开配置 — F4 的 `GET /api/v1/site/config`，整个会话只读一次（`siteConfig()`，
// 在 `api/api.js`），每个旧函数取自己那一片（CR-7-h2 §1）。

/** App.vue 缓存成 `BASIC_CONFIG`；收银台读 `pay_weixin_open`。 */
export function basicConfig() {
  return fromSiteConfig(toLegacyBasicConfig);
}

/** 登录页（`type == 2`）和授权弹窗的 logo，`res.data.logo_url`。 */
export function getLogo(type) {
  return fromSiteConfig((dto) => toLegacyLogo(dto, type));
}

/** 默认分享卡片 `{title, synopsis, img}`。 */
export function getShare() {
  return fromSiteConfig(toLegacyShare);
}

// 「当前访客是否已关注公众号」 (`getSubscribe`) is gone: answering it means reading the
// OA's follower list for a person, and the storefront surface deliberately exposes
// nothing about who is on the other end. `diyComponents/follow.vue` now always renders
// the 未关注 state, which is what it already did whenever the call failed.

// ---------------------------------------------------------------------------
// 底部导航（装修）— F4 的 `GET /api/v1/diy/navigation`（CR-3-h2 §2）
// ---------------------------------------------------------------------------

/**
 * 应答 `{navigation, version}`，`navigation` 是原样保存的 `pageFoot` 组件；两个读者
 * （`components/pageFooter` 的 `setNavigationInfo`、`goods_cate1` 的 `newData`）要的
 * 就是这个组件本身，mapper 把它取出来。`null`（还没发布首页）= 用原生 tabBar。
 */
export function getNavigation() {
  return request.get('/api/v1/diy/navigation', {}, { noAuth: true, map: toLegacyNavigation });
}

// ---------------------------------------------------------------------------
// 海报用的图片转 base64 — F4 的 `POST /api/v1/attachments/base64`（CR-7-h2 §2）
// ---------------------------------------------------------------------------

/**
 * 旧路由一次收 `{image, code}` 两张，回两张；新路由一次一张 `{url}`，只收本店附件
 * （F4 的 SSRF 规则），`auth: 'user'`。所以这里发两次，拼回 `{image, code}`。
 *
 * 商品图是海报的主体，它失败就整体失败（调用方各自 `catch`）。二维码是可选的：
 * 没有就不发；转不了（比如它根本不是本店附件）就原样交回，海报照旧画——这正是
 * 以前没有这条路由时的样子。
 */
export function imageBase64(image, code) {
  return toDataUrls(image, code);
}
