// 用户中心 / 地址 / 登录 / 站内信 / 发票
//
// Contracts: next/packages/contracts/src/user/user.storefront.contract.ts
//            next/packages/contracts/src/auth/auth.storefront.contract.ts
// Reshaping lives in `api/mappers/user.js`.
//
// Three notes that explain most of the diff against the old module:
//
//  * **`/api/v1/profile`, not `/api/v1/me`.** Every route in the user contract is
//    scoped to the caller and none of them takes a user id — which is what makes
//    "user A reads user B's address" unrepresentable rather than merely checked for.
//  * **A session is a resource.** There is no `POST /auth/logout`: the verb was
//    already in the method, so 退出登录 is `DELETE /auth/sessions/current`.
//  * **注销 is a reviewed request, not a flag.** `cancelUser` files an application; it
//    resolving no longer means the account is gone. The page's `LOGOUT` afterwards is
//    still right — the shopper asked to leave.

import request from '../utils/request.js';
import { toLegacyAgreement, fromLegacyAgreementKey } from './mappers/system.js';
import { toLegacyInvoice, fromLegacyInvoiceRequest } from './mappers/fulfil.js';
import {
  toLegacyProfile,
  fromLegacyProfileForm,
  toLegacyAddress,
  toLegacyAddressList,
  toLegacyDefaultAddress,
  fromLegacyAddressForm,
  toLegacySession,
  toLegacyWechatLogin,
  toLegacyCancellation,
  fromLegacySmsCodeInput,
  toLegacySmsCodeResult,
  toLegacyOk,
} from './mappers/user.js';
import {
  toLegacyMessage,
  toLegacyMessageList,
  toLegacyMarkRead,
} from './mappers/notification.js';
import { fromLegacyPage } from './mappers/_shared.js';
import { fromLegacyMiniCodeQuery, toLegacyMiniCode } from './mappers/wechat.js';
import { toLegacyUserMenus } from './mappers/diy.js';
import { toDataUrls, diyLayout } from './api.js';
import store from '../store';
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
// 用户资料
// ---------------------------------------------------------------------------

/**
 * 获取用户信息.
 *
 * Two reads. Legacy's `/user` answered with the shopper *and* their order counters in
 * one payload; `GET /api/v1/profile` is only the shopper, so the counters come from
 * `GET /api/v1/orders/counts`. The badges are decoration — a failure there still shows
 * the 个人中心.
 */
export function getUserInfo() {
  return Promise.all([
    request.get('/api/v1/profile', {}),
    request.get('/api/v1/orders/counts', {}).catch(() => ({ data: null })),
  ]).then(([profile, counts]) => ({
    data: toLegacyProfile(profile.data, counts.data),
    msg: '',
    status: 200,
  }));
}

/**
 * 修改用户信息（昵称、头像）
 */
export function userEdit(data) {
  return request.put('/api/v1/profile', fromLegacyProfileForm(data), {
    map: (dto) => toLegacyProfile(dto),
    msg: '修改成功',
  });
}

/**
 * 退出登录
 */
export function getLogout() {
  return request.delete('/api/v1/auth/sessions/current', {}, { map: toLegacyOk });
}

/**
 * 申请注销账号.
 *
 * Legacy flipped `is_del = 1` the instant the button was tapped — no confirmation, no
 * review, no way back. It is a row an operator has to act on now, and approval
 * anonymises rather than deletes, because orders, refunds and invoices still point at
 * the id. The page logs out either way, which is still the right thing to do.
 */
export function cancelUser(data) {
  const src = data || {};
  const body = {};
  if (src.reason) body.reason = String(src.reason);
  return request.post('/api/v1/account-cancellations', body, {
    map: toLegacyCancellation,
    msg: '注销申请已提交，请等待审核',
  });
}

/**
 * 我的注销申请（`{}` 表示没有申请过）
 */
export function getUserCancellation() {
  return request.get('/api/v1/account-cancellations/current', {}, {
    map: toLegacyCancellation,
  });
}

/**
 * 撤回注销申请
 */
export function withdrawUserCancellation() {
  return request.delete('/api/v1/account-cancellations/current', {}, {
    map: toLegacyCancellation,
    msg: '已撤回',
  });
}

// ---------------------------------------------------------------------------
// 登录 / 注册 / 找回密码
// ---------------------------------------------------------------------------

/**
 * h5 账号密码登录.
 *
 * `spread` / `agent_id` (分销上级) are dropped: 分销 is a retired feature.
 */
export function loginH5(data) {
  const src = data || {};
  const body = { account: String(src.account || ''), password: String(src.password || '') };
  return request.post('/api/v1/auth/sessions/password', body, {
    noAuth: true,
    map: toLegacySession,
  });
}

/**
 * 手机号验证码登录（未注册则自动注册）.
 *
 * A phone with no account gets one, because the alternative — a 404 telling the
 * shopper to go and register with the same phone and the same code — is the single
 * most abandoned step in the legacy funnel.
 */
export function loginMobile(data) {
  const src = data || {};
  return request.post(
    '/api/v1/auth/sessions/sms',
    { phone: String(src.phone || ''), code: String(src.captcha || src.code || '') },
    { noAuth: true, map: toLegacySession },
  );
}

/**
 * 验证码 key.
 *
 * The legacy image captcha was a server-rendered PNG keyed by this string, and the key
 * was then quoted back on `registerVerify`. Neither captcha is left — the image one had
 * no successor and the 行为验证码 was ruled out by E4 — so this resolves locally with an
 * empty key and makes no request. The remaining call sites keep working unchanged.
 */
export function getCodeApi() {
  return local({ key: '' });
}

/**
 * 发送短信验证码
 */
export function registerVerify(data) {
  return request.post('/api/v1/auth/sms-codes', fromLegacySmsCodeInput(data), {
    noAuth: true,
    map: toLegacySmsCodeResult,
    msg: '发送成功',
  });
}

/**
 * 手机号注册。旧接口把手机号叫 `account`。
 */
export function register(data) {
  const src = data || {};
  const body = {
    phone: String(src.phone || src.account || ''),
    code: String(src.captcha || src.code || ''),
    password: String(src.password || ''),
  };
  if (src.nickname) body.nickname = String(src.nickname);
  return request.post('/api/v1/auth/registrations', body, {
    noAuth: true,
    map: toLegacySession,
    msg: '注册成功',
  });
}

/**
 * 手机号找回密码
 */
export function registerReset(data) {
  const src = data || {};
  return request.post(
    '/api/v1/auth/password-resets',
    {
      phone: String(src.phone || src.account || ''),
      code: String(src.captcha || src.code || ''),
      password: String(src.password || ''),
    },
    { noAuth: true, map: toLegacyOk, msg: '修改成功' },
  );
}

/**
 * 修改密码（已登录）。原密码或短信验证码二选一。
 */
export function changePassword(data) {
  const src = data || {};
  const body = { password: String(src.password || '') };
  if (src.oldPassword || src.old_pwd) body.oldPassword = String(src.oldPassword || src.old_pwd);
  else body.code = String(src.captcha || src.code || '');
  return request.put('/api/v1/auth/password', body, { map: toLegacyOk, msg: '修改成功' });
}

/**
 * 公众号绑定手机号并登录.
 *
 * `key` is the `bindToken` the OA sign-in handed back on `phone-required`; it stands in
 * for the openid so this call does not have to redeem the single-use WeChat `code`
 * again — the legacy flow's 「请重新授权」 loop came from exactly that.
 */
export function phoneWxSilenceAuth(data) {
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
 * 小程序「手机号 + 短信验证码」登录.
 *
 * Not a WeChat route any more. `POST /auth/sessions/wechat-mini/phone` takes the code
 * `getPhoneNumber` hands over, not a typed SMS code, and the old client-side
 * `encryptedData` + `iv` decryption is deliberately not ported — it needed `session_key`
 * to leave the server. A typed phone and SMS code is a plain SMS sign-in on any
 * platform, so that is what this is; the `wx.login` code the page fetched first is
 * simply unused. Binding the openid happens on the next `authLogin`.
 */
export function phoneSilenceAuth(data) {
  const src = data || {};
  return request.post(
    '/api/v1/auth/sessions/sms',
    { phone: String(src.phone || ''), code: String(src.captcha || src.code || '') },
    { noAuth: true, map: toLegacySession },
  );
}

// ---------------------------------------------------------------------------
// 收货地址
// ---------------------------------------------------------------------------

/**
 * 地址列表（页面读的是裸数组）
 */
export function getAddressList(data) {
  return request.get('/api/v1/addresses', fromLegacyPage(data), { map: toLegacyAddressList });
}

/**
 * 默认地址。没有默认地址时 `{}`，页面测的就是这个。
 */
export function getAddressDefault() {
  return request.get('/api/v1/addresses/default', {}, { map: toLegacyDefaultAddress });
}

/**
 * 获取单个地址
 */
export function getAddressDetail(id) {
  return request.get(`/api/v1/addresses/${id}`, {}, { map: toLegacyAddress });
}

/**
 * 修改 / 添加地址
 */
export function editAddress(data) {
  const src = data || {};
  const body = fromLegacyAddressForm(src);
  if (src.id) {
    return request.put(`/api/v1/addresses/${src.id}`, body, {
      map: toLegacyAddress,
      msg: '修改成功',
    });
  }
  return request.post('/api/v1/addresses', body, { map: toLegacyAddress, msg: '添加成功' });
}

/**
 * 删除地址
 */
export function delAddress(id) {
  return request.delete(`/api/v1/addresses/${id}`, {}, { msg: '删除成功' });
}

/**
 * 设置默认地址
 */
export function setAddressDefault(id) {
  return request.post(`/api/v1/addresses/${id}/default`, {}, {
    map: toLegacyAddress,
    msg: '设置成功',
  });
}

// ---------------------------------------------------------------------------
// 小程序一键绑定手机号（已登录用户）— E4 的 `POST /api/v1/auth/phone/wechat-mini`
// （CR-2-h2 §2）。body `{phoneCode}` 是 `getPhoneNumber` 给的 code，由服务端兑换；
// 应答 `{ok: true}`，页面只 toast `res.msg` 再重读用户信息。
// ---------------------------------------------------------------------------

/**
 * 小程序绑定手机号
 * @param object data {phoneCode}
 */
export function mpBindingPhone(data) {
  const src = data || {};
  return request.post('/api/v1/auth/phone/wechat-mini', { phoneCode: String(src.phoneCode || '') }, {
    msg: '绑定成功',
  });
}

// ---------------------------------------------------------------------------
// 个人中心的版式 — F4 的 `GET /api/v1/diy/layouts/user`（CR-3-h2 §3）
//
// `pages/user` 从这里只读 `diy_data.value`（`member_style`，1–5，决定小程序顶栏配色
// 和订单图标那一套）；菜单格子如今是个人中心装修页上的组件，那一页由
// `getThemeInfo('user')` 读 `GET /api/v1/diy/pages/user-center`（`api/api.js`）。
// ---------------------------------------------------------------------------

/**
 * 用户中心菜单（版式）
 */
export function getMenuList() {
  return diyLayout('user', toLegacyUserMenus);
}

// ---------------------------------------------------------------------------
// 站内信
//
// Legacy had one write for three operations — `msgLookDel({id, key, value, all})`,
// where `key` named a column and `value` the number to put in it. That is a SQL
// statement with a URL in front of it; the contract has a route per operation, and
// this module dispatches on the same argument so the page needs no edit.
// ---------------------------------------------------------------------------

/**
 * 消息中心列表
 * @param object data {page, limit}
 */
export function messageSystem(data) {
  return request.get('/api/v1/my-messages', fromLegacyPage(data), {
    map: toLegacyMessageList,
  });
}

/**
 * 站内信详情
 */
export function getMsgDetails(id) {
  return request.get(`/api/v1/my-messages/${id}`, {}, { map: toLegacyMessage });
}

/**
 * 站内信已读 / 删除
 * @param object data {id, key: 'look'|'is_del', value, all}
 */
export function msgLookDel(data) {
  const src = data || {};
  if (src.key === 'is_del') {
    return request.delete(`/api/v1/my-messages/${src.id}`, {}, { msg: '删除成功' });
  }
  if (src.all) {
    return request.post('/api/v1/my-messages/read-all', {}, { map: toLegacyMarkRead });
  }
  return request.post(`/api/v1/my-messages/${src.id}/read`, {}, { map: toLegacyMarkRead });
}

/**
 * 未读消息数
 */
export function getMsgUnreadCount() {
  return request.get('/api/v1/my-messages/unread-count', {}, {
    map: (dto) => ({ count: dto && dto.unread ? Number(dto.unread) : 0 }),
  });
}

// ---------------------------------------------------------------------------
// 小程序码 — E4 的 `GET /api/v1/wechat/mini-qrcodes`（CR-6-h2）
// ---------------------------------------------------------------------------

/**
 * 获取小程序二维码：当前用户的推广码，扫码落到首页并记下推广人（`spid`）。
 * 唯一的调用方 poster-poster 不传参数、读 `res.data.url`。
 */
export function routineCode() {
  return request.get(
    '/api/v1/wechat/mini-qrcodes',
    fromLegacyMiniCodeQuery('home', '', store.state.app.uid),
    { map: toLegacyMiniCode },
  );
}

// ---------------------------------------------------------------------------

/**
 * 图片链接转 base64 — 和 `api/public.js` 的 `imageBase64` 是同一件事的两个名字
 * （F4 的 `POST /api/v1/attachments/base64`，一次一张，拼回 `{image, code}`）。
 * poster-poster 送 `{image, code}`，`code` 是它的小程序码 URL。
 */
export function imgToBase(data) {
  const src = data || {};
  return toDataUrls(src.image, src.code);
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
