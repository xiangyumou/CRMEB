// 微信授权 / 站点公共配置
//
// Almost everything here belongs to streams E1 (storefront auth), E2 (WeChat OA and
// mini-program) and F1 (public site config), whose contracts are not written yet.
// Each call is pointed at the path the conventions and the reference map imply and
// marked CONTRACT-PENDING; docs/rewrite/status/h.md tracks them.

import request from '../utils/request.js';
import wechat from '../libs/wechat.js';
import { toLegacyCategoryVersion } from './mappers/catalog.js';
import { toLegacySession, toLegacyWechatLogin } from './mappers/user.js';
import { toLegacyJssdkConfig } from './mappers/wechat.js';

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

// CONTRACT-PENDING(F1) — 站点公开配置；见 docs/rewrite/cr/CR-7-h2.md。
export function basicConfig() {
  return request.get('/api/v1/site/config', {}, { noAuth: true });
}

export function getLogo() {
  return request.get('/api/v1/site/logo', {}, { noAuth: true });
}

export function getShare() {
  return request.get('/api/v1/site/share', {}, { noAuth: true });
}

// 「当前访客是否已关注公众号」 (`getSubscribe`) is gone: answering it means reading the
// OA's follower list for a person, and the storefront surface deliberately exposes
// nothing about who is on the other end. `diyComponents/follow.vue` now always renders
// the 未关注 state, which is what it already did whenever the call failed.

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(G1) — 底部导航（装修）。G1 的前台只有首页 / 指定页 / 主题 / 版本号
// 四条路由，底部导航不在其中；见 docs/rewrite/cr/CR-3-h2.md。
// ---------------------------------------------------------------------------

export function getNavigation(data) {
  return request.get('/api/v1/diy/navigation', data, { noAuth: true });
}

// CONTRACT-PENDING(F1) — 海报用的图片转 base64（服务端代抓，只允许本店附件，见
// docs/rewrite/cr/CR-7-h2.md 的 SSRF 说明）。
export function imageBase64(image, code) {
  return request.post('/api/v1/site/image-data-urls', { image, code }, { noAuth: true });
}
