// 微信授权 / 站点公共配置
//
// Almost everything here belongs to streams E1 (storefront auth), E2 (WeChat OA and
// mini-program) and F1 (public site config), whose contracts are not written yet.
// Each call is pointed at the path the conventions and the reference map imply and
// marked CONTRACT-PENDING; docs/rewrite/status/h.md tracks them.

import request from '../utils/request.js';
import wechat from '../libs/wechat.js';
import { toLegacyCategoryVersion } from './mappers/catalog.js';

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

// CONTRACT-PENDING(E2) — 公众号 JS-SDK 配置。
export function getWechatConfig() {
  return request.get('/api/v1/wechat/js-config', { url: wechat.signLink() }, { noAuth: true });
}

// CONTRACT-PENDING(E2) — 公众号 code 换登录态。
export function wechatAuthLogin(data) {
  return request.post('/api/v1/auth/wechat-oa/sessions', data, { noAuth: true });
}

// CONTRACT-PENDING(E2) — 公众号静默授权。
export function wechatAuthV2(code, spread) {
  return request.post('/api/v1/auth/wechat-oa/authorizations', { code, spread }, { noAuth: true });
}

// CONTRACT-PENDING(E2) — 公众号 / 小程序授权类型探测。
export function silenceAuth(data) {
  return request.get('/api/v1/auth/wechat/authorization-type', data, { noAuth: true });
}

// CONTRACT-PENDING(E2) — 小程序 code 换登录态。
export function authType(data) {
  return request.get('/api/v1/auth/wechat-mini/authorization-type', data, { noAuth: true });
}

export function authLogin(data) {
  return request.post('/api/v1/auth/wechat-mini/sessions', data, { noAuth: true });
}

export function routineLogin(data) {
  return request.post('/api/v1/auth/wechat-mini/sessions', data, { noAuth: true });
}

// CONTRACT-PENDING(E1) — 公众号绑定手机号。
export function wechatBindingPhone(data) {
  return request.post('/api/v1/auth/wechat-oa/phone-bindings', data, { noAuth: true });
}

// CONTRACT-PENDING(E1) — 小程序绑定手机号。
export function routineBindingPhone(data) {
  return request.post('/api/v1/auth/wechat-mini/phone-bindings', data, { noAuth: true });
}

// CONTRACT-PENDING(E1) — 小程序手机号一键登录。
export function phoneLogin(data) {
  return request.post('/api/v1/auth/wechat-mini/phone-sessions', data, { noAuth: true });
}

// CONTRACT-PENDING(E1) — iframe / 单点登录换 token。
export function remoteRegister(data) {
  return request.get('/api/v1/auth/remote-sessions', data, { noAuth: true });
}

// CONTRACT-PENDING(F1) — 站点公开配置。
export function basicConfig() {
  return request.get('/api/v1/site/config', {}, { noAuth: true });
}

export function getLogo() {
  return request.get('/api/v1/site/logo', {}, { noAuth: true });
}

export function getShare() {
  return request.get('/api/v1/site/share', {}, { noAuth: true });
}

// CONTRACT-PENDING(E2) — 订阅消息开关。
export function getSubscribe() {
  return request.get('/api/v1/wechat/subscribe-config', {}, { noAuth: true });
}

// CONTRACT-PENDING(G1) — 底部导航（装修）。
export function getNavigation(data) {
  return request.get('/api/v1/diy/navigation', data, { noAuth: true });
}

// CONTRACT-PENDING(F1) — 海报用的图片转 base64（服务端代抓，走 storage 的 safe-fetch）。
export function imageBase64(image, code) {
  return request.post('/api/v1/site/image-data-urls', { image, code }, { noAuth: true });
}
