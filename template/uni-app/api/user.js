// 用户中心 / 地址 / 站内信 / 发票
//
// 协议 (system) and 开票 (B2) have merged contracts. The rest belongs to stream E1
// (user, storefront auth) and E2 (notifications, WeChat codes); each of those calls is
// pointed at the path the conventions imply and marked CONTRACT-PENDING.

import request from '../utils/request.js';
import { toLegacyAgreement, fromLegacyAgreementKey } from './mappers/system.js';
import { toLegacyInvoice, fromLegacyInvoiceRequest } from './mappers/fulfil.js';
import { listTitles, findTitle, saveTitle, deleteTitle } from '../libs/invoiceTitles.js';

/**
 * 获取隐私协议 / 用户协议
 * @param string type
 */
export function getUserAgreement(type) {
  return request.get(`/api/v1/agreements/${fromLegacyAgreementKey(type)}`, {}, {
    noAuth: true,
    map: toLegacyAgreement,
  });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(E1) — user / auth.storefront
// ---------------------------------------------------------------------------

/**
 * 获取用户信息
 */
export function getUserInfo() {
  return request.get('/api/v1/me', {});
}

/**
 * 修改用户信息
 */
export function userEdit(data) {
  return request.put('/api/v1/me', data);
}

/**
 * 退出登录
 */
export function getLogout() {
  return request.post('/api/v1/auth/logout', {});
}

/**
 * 注销用户
 */
export function cancelUser() {
  return request.delete('/api/v1/me', {});
}

/**
 * 用户中心菜单
 */
export function getMenuList() {
  return request.get('/api/v1/me/menus', {}, { noAuth: true });
}

/**
 * 登录记录
 */
export function setVisit(data) {
  return request.post('/api/v1/me/visits', data, { noAuth: true });
}

/**
 * h5 账号密码登录
 */
export function loginH5(data) {
  return request.post('/api/v1/auth/sessions', data, { noAuth: true });
}

/**
 * h5 手机号验证码登录
 */
export function loginMobile(data) {
  return request.post('/api/v1/auth/sms-sessions', data, { noAuth: true });
}

/**
 * 验证码 key
 */
export function getCodeApi() {
  return request.get('/api/v1/auth/sms-key', {}, { noAuth: true });
}

/**
 * 发送短信验证码
 */
export function registerVerify(data) {
  return request.post('/api/v1/auth/sms-codes', data, { noAuth: true });
}

/**
 * 手机号注册
 */
export function register(data) {
  return request.post('/api/v1/auth/registrations', data, { noAuth: true });
}

/**
 * 手机号修改密码
 */
export function registerReset(data) {
  return request.post('/api/v1/auth/password-resets', data, { noAuth: true });
}

/**
 * 小程序绑定手机号
 */
export function mpBindingPhone(data) {
  return request.post('/api/v1/auth/wechat-mini/phone-bindings', data);
}

/**
 * 微信直接手机号登录
 */
export function phoneWxSilenceAuth(data) {
  return request.post('/api/v1/auth/wechat-oa/phone-sessions', data, { noAuth: true });
}

/**
 * 小程序直接手机号登录
 */
export function phoneSilenceAuth(data) {
  return request.post('/api/v1/auth/wechat-mini/phone-sessions', data, { noAuth: true });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(E1) — 收货地址
// ---------------------------------------------------------------------------

/**
 * 地址列表
 */
export function getAddressList(data) {
  return request.get('/api/v1/me/addresses', data);
}

/**
 * 默认地址
 */
export function getAddressDefault() {
  return request.get('/api/v1/me/addresses/default', {});
}

/**
 * 获取单个地址
 */
export function getAddressDetail(id) {
  return request.get(`/api/v1/me/addresses/${id}`, {});
}

/**
 * 修改 / 添加地址
 */
export function editAddress(data) {
  const src = data || {};
  if (src.id) return request.put(`/api/v1/me/addresses/${src.id}`, src);
  return request.post('/api/v1/me/addresses', src, { msg: '添加成功' });
}

/**
 * 删除地址
 */
export function delAddress(id) {
  return request.delete(`/api/v1/me/addresses/${id}`, {}, { msg: '删除成功' });
}

/**
 * 设置默认地址
 */
export function setAddressDefault(id) {
  return request.post(`/api/v1/me/addresses/${id}/default`, {}, { msg: '设置成功' });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING(E2) — 站内信 / 小程序码
// ---------------------------------------------------------------------------

/**
 * 消息中心-站内信列表
 */
export function messageSystem(data) {
  return request.get('/api/v1/me/messages', data);
}

/**
 * 站内信详情
 */
export function getMsgDetails(id) {
  return request.get(`/api/v1/me/messages/${id}`, {});
}

/**
 * 站内信已读 / 删除
 */
export function msgLookDel(data) {
  return request.post('/api/v1/me/messages/readings', data);
}

/**
 * 获取小程序二维码
 */
export function routineCode(data) {
  return request.get('/api/v1/wechat/qrcodes/mini', data);
}

// CONTRACT-PENDING(F1) — 海报用的图片转 base64。
/**
 * 图片链接转 base64
 */
export function imgToBase(data) {
  return request.post('/api/v1/site/image-data-urls', data);
}

// ---------------------------------------------------------------------------
// 发票抬头
//
// B2 did not port 抬头管理 (`order.invoice.contract.ts`): the header is frozen onto the
// invoice request, and the storefront is told to remember the last one locally. These
// five functions are therefore backed by `libs/invoiceTitles.js` — device storage, no
// HTTP — and still resolve the usual envelope so the pages cannot tell.
// ---------------------------------------------------------------------------

/** The envelope a local (non-HTTP) call resolves with. */
function local(data, msg) {
  return Promise.resolve({ data, msg: msg || '', status: 200 });
}

/**
 * 用户发票抬头列表
 */
export function invoiceList() {
  return local(listTitles());
}

/**
 * 添加 / 修改发票抬头
 */
export function invoiceSave(data) {
  return local(saveTitle(data), '保存成功');
}

/**
 * 删除发票抬头
 */
export function invoiceDelete(id) {
  deleteTitle(id);
  return local({}, '删除成功');
}

/**
 * 发票抬头详情
 */
export function invoiceDetail(id) {
  return local(findTitle(id) || {});
}

/**
 * 下单时可选的发票抬头
 */
export function invoiceOrder() {
  return local(listTitles());
}

/**
 * 订单开票申请。`invoice_id` names a locally saved 抬头; its fields are frozen onto the
 * request, which is the only copy that counts from here on.
 */
export function makeUpinvoice(data) {
  const src = data || {};
  const title = src.invoice_id ? findTitle(src.invoice_id) : null;
  const body = fromLegacyInvoiceRequest(title || src);
  return request.post(`/api/v1/orders/${src.order_id}/invoice`, body, {
    map: toLegacyInvoice,
    msg: '申请成功',
  });
}
