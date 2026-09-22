// 用户资料 / 收货地址 / 登录态 / 注销申请 DTOs → the legacy 个人中心 view models.
//
// Contracts: next/packages/contracts/src/user/user.storefront.contract.ts
//            next/packages/contracts/src/auth/auth.storefront.contract.ts
//
// Three things the new model changed that the mappers have to bridge:
//
//  * **The profile is only the profile.** Legacy's `/user` answered with the shopper,
//    their order counters, their wallet, their 分销 figures and the site's invoice
//    switches in one payload. `GET /api/v1/profile` is the shopper; the counters come
//    from `GET /api/v1/orders/counts`, which `getUserInfo` composes in.
//  * **A session is a resource.** `POST /auth/sessions/{password,sms,…}` answers with
//    `{token, expiresAt, user}` — an ISO instant, not the unix seconds the pages
//    subtract `$Cache.time()` from — so `toLegacySession` converts it.
//  * **An address never carries a user id.** Nothing to map, but it is why
//    `fromLegacyAddressForm` drops `uid` if a page ever sends one.
//
// Retired next to a shopper: 余额, 积分, 会员等级/SVIP, 分销/推广, 签到, 多账号切换.
// They are pinned to falsy constants here so the pages that render them stay dead.

import { toId, toInt, text, mapList, unixSeconds, legacyDate } from './_shared.js';

/** The falsy bag every 个人中心 screen reads through. */
const RETIRED = {
  // 余额 / 积分
  now_money: '0.00',
  integral: 0,
  // 会员等级 / SVIP
  vip: false,
  vip_id: 0,
  is_money_level: 0,
  is_ever_level: 0,
  svip_open: false,
  // 分销
  is_promoter: 0,
  brokerage: 0,
  brokerage_price: '0.00',
  brokeragePrice: '0.00',
  spread_uid: 0,
  spread_spid: 0,
  spread_code: '',
  // 签到
  sign_num: 0,
  integralTotal: 0,
  // 多账号切换：v1/v2 两套登录态并存的遗物，新模型里一个 token 就是一个账号。
  switchUserInfo: [],
  // 新人礼：没有继任者
  new_user: 0,
};

/** Order counters are a second read; an empty one still has to have every key. */
const NO_ORDER_COUNTS = {
  order_count: 0,
  unpaid_count: 0,
  unshipped_count: 0,
  received_count: 0,
  evaluated_count: 0,
  complete_count: 0,
  refund_count: 0,
  refunding_count: 0,
  cancel_count: 0,
};

/**
 * `userProfile` (+ `orderCounts`) → the legacy `userInfo`.
 *
 * `record_phone` was the number an order was placed with and `phone` the bound one;
 * they are the same number now. `invioce_func` / `special_invoice` are `true` because
 * B2's invoice routes are live and both 普票 and 专票 are in `invoiceRequestForm`.
 */
export function toLegacyProfile(dto, counts) {
  if (!dto) return {};
  const phone = text(dto.phone);
  return {
    uid: toId(dto.id),
    id: toId(dto.id),
    account: text(dto.account),
    nickname: text(dto.nickname),
    avatar: text(dto.avatarUrl),
    phone,
    record_phone: phone,
    real_name: text(dto.realName),
    birthday: legacyDate(dto.birthday),
    // 个人中心 shows 「已绑定微信」 off this.
    user_type: text(dto.registerSource) || 'h5',
    is_bind_wechat: (dto.boundWechat || []).length > 0,
    has_password: dto.hasPassword === true,
    add_time: unixSeconds(dto.createdAt),
    orderStatusNum: orderCountsOf(counts),
    invioce_func: true,
    special_invoice: true,
    ...RETIRED,
  };
}

/**
 * `orderCounts` → `userInfo.orderStatusNum`.
 *
 * The 个人中心 badges read `unpaid_count` / `unshipped_count` / `received_count` /
 * `evaluated_count` / `refunding_count`, and 待评价 has no counter of its own in the
 * new model — 已完成 is the closest true thing, which is what legacy showed too.
 */
export function orderCountsOf(dto) {
  if (!dto) return { ...NO_ORDER_COUNTS };
  return {
    order_count: toInt(dto.all, 0),
    unpaid_count: toInt(dto.unpaid, 0),
    unshipped_count: toInt(dto.unshipped, 0),
    received_count: toInt(dto.unreceived, 0),
    evaluated_count: toInt(dto.finished, 0),
    complete_count: toInt(dto.finished, 0),
    refund_count: toInt(dto.refunding, 0),
    refunding_count: toInt(dto.refunding, 0),
    cancel_count: toInt(dto.cancelled, 0),
  };
}

/**
 * Legacy `userEdit(value)` → `PUT /api/v1/profile` body.
 *
 * Only what `userProfileForm` accepts. The phone is not here on purpose: changing it
 * needs an SMS code and goes through `PUT /api/v1/auth/phone`.
 */
export function fromLegacyProfileForm(data) {
  const src = data || {};
  const body = {};
  if (src.nickname !== undefined && src.nickname !== null && src.nickname !== '') {
    body.nickname = String(src.nickname);
  }
  const avatar = src.avatar !== undefined ? src.avatar : src.avatarUrl;
  if (avatar !== undefined && avatar !== null && avatar !== '') body.avatarUrl = String(avatar);
  if (src.real_name !== undefined && src.real_name !== null && src.real_name !== '') {
    body.realName = String(src.real_name);
  }
  if (src.birthday !== undefined) body.birthday = src.birthday || null;
  return body;
}

// ---------------------------------------------------------------------------
// 收货地址
// ---------------------------------------------------------------------------

/** `userAddress` → the flat row every address screen renders. */
export function toLegacyAddress(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    real_name: text(dto.receiverName),
    phone: text(dto.receiverPhone),
    province: text(dto.provinceName),
    city: text(dto.cityName),
    district: text(dto.districtName),
    // The picker round-trips the city node's `v`; province / district ids are not
    // in the legacy form at all.
    province_id: dto.provinceId === null || dto.provinceId === undefined ? 0 : toId(dto.provinceId),
    city_id: dto.cityId === null || dto.cityId === undefined ? 0 : toId(dto.cityId),
    district_id: dto.districtId === null || dto.districtId === undefined ? 0 : toId(dto.districtId),
    detail: text(dto.detail),
    post_code: text(dto.postCode),
    longitude: text(dto.lng),
    latitude: text(dto.lat),
    is_default: dto.isDefault ? 1 : 0,
    is_del: 0,
  };
}

/** `pagedUserAddresses` → the bare array both address screens page through. */
export function toLegacyAddressList(dto) {
  return mapList(dto && dto.items, toLegacyAddress);
}

/** `{address: userAddress | null}` → `{}` when there is none, which is what the page tests. */
export function toLegacyDefaultAddress(dto) {
  return dto && dto.address ? toLegacyAddress(dto.address) : {};
}

/**
 * Legacy `editAddress(value)` → `userAddressForm`.
 *
 * The page nests the division under `value.address` and puts everything else flat,
 * and the division *names* are what the form requires — see the note on
 * `userAddressForm` about hand-typed 海外 addresses with no division id.
 */
export function fromLegacyAddressForm(data) {
  const src = data || {};
  const region = src.address || {};
  const body = {
    receiverName: text(src.real_name).trim(),
    receiverPhone: text(src.phone).trim(),
    provinceName: text(region.province || src.province),
    cityName: text(region.city || src.city),
    detail: text(src.detail).trim(),
    isDefault: toInt(src.is_default, 0) === 1,
  };
  const district = text(region.district || src.district);
  if (district) body.districtName = district;
  const cityId = region.city_id !== undefined ? region.city_id : src.city_id;
  if (cityId) body.cityId = String(cityId);
  const provinceId = region.province_id !== undefined ? region.province_id : src.province_id;
  if (provinceId) body.provinceId = String(provinceId);
  const districtId = region.district_id !== undefined ? region.district_id : src.district_id;
  if (districtId) body.districtId = String(districtId);
  const postCode = src.post_code !== undefined ? src.post_code : src.postal_code;
  if (postCode) body.postCode = String(postCode);
  if (src.longitude) body.lng = String(src.longitude);
  if (src.latitude) body.lat = String(src.latitude);
  return body;
}

// ---------------------------------------------------------------------------
// 登录态
// ---------------------------------------------------------------------------

/**
 * `storefrontSession` → `{token, expires_time, uid, …}`.
 *
 * Every login page does `expires_time - $Cache.time()` to get a TTL in seconds, so
 * `expiresAt` has to arrive as unix seconds. The profile rides along, which is why
 * `uid` is available without a second read.
 */
export function toLegacySession(dto) {
  if (!dto) return {};
  const session = dto.session ? dto.session : dto;
  const user = session.user || null;
  return {
    token: text(session.token),
    expires_time: unixSeconds(session.expiresAt),
    uid: user ? toId(user.id) : 0,
    // `smsLoginResult.registered` / `wechatLoginResult.registered` — the client shows
    // 欢迎加入 once on a true.
    new_user: dto.registered ? 1 : 0,
    userInfo: user ? toLegacyProfile(user) : {},
  };
}

/**
 * `wechatLoginResult` → what the WeChat login helpers read.
 *
 * `status: 'phone-required'` is not an error: the openid resolved but the shop wants
 * a phone number, and `bindToken` stands in for the openid so the second call does
 * not have to redeem the single-use WeChat `code` again.
 */
export function toLegacyWechatLogin(dto) {
  if (!dto) return {};
  const base = toLegacySession(dto);
  return {
    ...base,
    // legacy spelled it `is_bind` / `key`: "we know who you are, now give us a phone"
    status: text(dto.status),
    is_phone_required: dto.status === 'phone-required',
    is_bind: dto.status === 'phone-required' ? 1 : 0,
    key: text(dto.bindToken),
    bindToken: text(dto.bindToken),
    expires_in: toInt(dto.bindTokenExpiresInSec, 0),
  };
}

// ---------------------------------------------------------------------------
// 注销申请
// ---------------------------------------------------------------------------

/**
 * `cancellationRequest` → the 注销 page's view model.
 *
 * Legacy flipped `is_del = 1` the moment the button was tapped. It is a reviewed
 * request now, so the page has a status to show — and `cancelUser` resolving no
 * longer means the account is gone.
 */
export function toLegacyCancellation(dto) {
  const request = dto && dto.request !== undefined ? dto.request : dto;
  if (!request) return {};
  return {
    id: toId(request.id),
    uid: toId(request.userId),
    nickname: text(request.nickname),
    phone: text(request.phone),
    reason: text(request.reason),
    status: text(request.status),
    // the page shows 审核中 / 已通过 / 已驳回 off a number in legacy
    status_num: CANCELLATION_STATUS[request.status] === undefined ? 0 : CANCELLATION_STATUS[request.status],
    remark: text(request.reviewRemark),
    review_time: unixSeconds(request.reviewedAt),
    add_time: unixSeconds(request.createdAt),
  };
}

const CANCELLATION_STATUS = { pending: 0, approved: 1, rejected: -1, withdrawn: -2 };

// ---------------------------------------------------------------------------
// 短信 / 验证码
// ---------------------------------------------------------------------------

/**
 * Legacy `type` → `smsScene`.
 *
 * The scene is part of the Redis key, so a code minted for 注销 cannot be replayed
 * against 登录 — which the legacy single-key-per-phone design allowed.
 */
const SMS_SCENE = {
  login: 'login',
  register: 'register',
  reset: 'reset-password',
  'reset-password': 'reset-password',
  binding: 'bind-phone',
  bind: 'bind-phone',
  'bind-phone': 'bind-phone',
  change: 'change-phone',
  'change-phone': 'change-phone',
};

export function fromLegacySmsScene(type) {
  return SMS_SCENE[String(type === undefined || type === null ? '' : type)] || 'login';
}

/**
 * Legacy `registerVerify({phone, type, key, captchaType, captchaVerification})` →
 * `sendSmsCodeBody`.
 *
 * `key` was the id of a server-rendered image captcha and has no successor. The
 * slider's answer becomes `captchaToken`, which the route ignores while the slider is
 * switched off — see docs/rewrite/cr/CR-2-h2.md.
 */
export function fromLegacySmsCodeInput(data) {
  const src = data || {};
  const body = { phone: text(src.phone), scene: fromLegacySmsScene(src.type) };
  const token = src.captchaVerification || src.captchaToken;
  if (token) body.captchaToken = String(token);
  return body;
}

/** `sendSmsCodeResult` → what the 倒计时 reads. */
export function toLegacySmsCodeResult(dto) {
  if (!dto) return {};
  return {
    expires_in: toInt(dto.expiresInSec, 0),
    resend_after: toInt(dto.resendAfterSec, 0),
    // the pages only ever show a toast; `key` kept so the old call sites stay valid
    key: '',
  };
}

/** Everything that is just `{ok: true}` still has to resolve with an object. */
export function toLegacyOk(dto) {
  return { status: dto && dto.ok ? 1 : 0 };
}
