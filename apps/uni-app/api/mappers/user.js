// 用户资料 / 收货地址 / 登录态 / 注销申请 DTOs → the 个人中心 view models.
//
// Contracts: packages/contracts/src/user/user.storefront.contract.ts
//            packages/contracts/src/auth/auth.storefront.contract.ts
//
// Three things about the API the mappers have to bridge:
//
//  * **The profile is only the profile.** The pages want the shopper, their order
//    counters, their wallet, their 分销 figures and the site's invoice switches in one
//    payload. `GET /api/v1/profile` is the shopper; the counters come
//    from `GET /api/v1/orders/counts`, which `getUserInfo` composes in.
//  * **A session is a resource.** `POST /auth/sessions/{password,sms,…}` answers with
//    `{token, expiresAt, user}` — an ISO instant, not the unix seconds the pages
//    subtract `$Cache.time()` from — so `toPageSession` converts it.
//  * **An address never carries a user id.** Nothing to map, but it is why
//    `fromPageAddressForm` drops `uid` if a page ever sends one.
//
// Retired next to a shopper: 余额, 积分, 会员等级/SVIP, 分销/推广, 签到, 多账号切换.
// They are pinned to falsy constants here so the pages that render them stay dead.

import { toId, toInt, text, mapList, unixSeconds, pageDate } from './_shared.js';

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
  // 多账号切换：一个 token 就是一个账号。
  switchUserInfo: [],
  // 新人礼：没有
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
 * `userProfile` (+ `orderCounts`) → the page's `userInfo`.
 *
 * `record_phone` (the number an order was placed with) and `phone` (the bound one)
 * are the same number. `invioce_func` / `special_invoice` are `true` because
 * the invoice routes are live and both 普票 and 专票 are in `invoiceRequestForm`.
 */
export function toPageProfile(dto, counts) {
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
    birthday: pageDate(dto.birthday),
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
 * `evaluated_count` / `refunding_count`, and 待评价 has no counter of its own —
 * 已完成 is the closest true thing.
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
 * The page's `userEdit(value)` → `PUT /api/v1/profile` body.
 *
 * Only what `userProfileForm` accepts. The phone is not here on purpose: changing it
 * needs an SMS code and goes through `PUT /api/v1/auth/phone`.
 */
export function fromPageProfileForm(data) {
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
export function toPageAddress(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    real_name: text(dto.receiverName),
    phone: text(dto.receiverPhone),
    province: text(dto.provinceName),
    city: text(dto.cityName),
    district: text(dto.districtName),
    // The picker round-trips the city node's `v`; province / district ids are not
    // in the page's form at all.
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
export function toPageAddressList(dto) {
  return mapList(dto && dto.items, toPageAddress);
}

/** `{address: userAddress | null}` → `{}` when there is none, which is what the page tests. */
export function toPageDefaultAddress(dto) {
  return dto && dto.address ? toPageAddress(dto.address) : {};
}

/**
 * The page's `editAddress(value)` → `userAddressForm`.
 *
 * The page nests the division under `value.address` and puts everything else flat,
 * and the division *names* are what the form requires — see the note on
 * `userAddressForm` about hand-typed 海外 addresses with no division id.
 */
export function fromPageAddressForm(data) {
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
export function toPageSession(dto) {
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
    userInfo: user ? toPageProfile(user) : {},
  };
}

/**
 * `wechatLoginResult` → what the WeChat login helpers read.
 *
 * `status: 'phone-required'` is not an error: the openid resolved but the shop wants
 * a phone number, and `bindToken` stands in for the openid so the second call does
 * not have to redeem the single-use WeChat `code` again.
 */
export function toPageWechatLogin(dto) {
  if (!dto) return {};
  const base = toPageSession(dto);
  return {
    ...base,
    // the pages spell it `is_bind` / `key`: "we know who you are, now give us a phone"
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
 * Not a flag flipped the moment the button is tapped: it is a reviewed request, so
 * the page has a status to show — and `cancelUser` resolving does not mean the
 * account is gone.
 */
export function toPageCancellation(dto) {
  const request = dto && dto.request !== undefined ? dto.request : dto;
  if (!request) return {};
  return {
    id: toId(request.id),
    uid: toId(request.userId),
    nickname: text(request.nickname),
    phone: text(request.phone),
    reason: text(request.reason),
    status: text(request.status),
    // the page shows 审核中 / 已通过 / 已驳回 off a number
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
 * The page's `type` → `smsScene`.
 *
 * The scene is part of the Redis key, so a code minted for 注销 cannot be replayed
 * against 登录 — which one key per phone would allow.
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

export function fromPageSmsScene(type) {
  return SMS_SCENE[String(type === undefined || type === null ? '' : type)] || 'login';
}

/**
 * The page's `registerVerify({phone, type, key, captchaType, captchaVerification})` →
 * `sendSmsCodeBody`.
 *
 * Only two of those five survive. `key` was the id of a server-rendered image captcha;
 * `captchaType` / `captchaVerification` are a 行为验证码's question and its answer.
 * There is no behaviour captcha — the SMS spend is bounded with per-phone and
 * per-address budgets plus a resend cooldown instead — so the body is exactly
 * `{phone, scene}`.
 */
export function fromPageSmsCodeInput(data) {
  const src = data || {};
  return { phone: text(src.phone), scene: fromPageSmsScene(src.type) };
}

/** `sendSmsCodeResult` → what the 倒计时 reads. */
export function toPageSmsCodeResult(dto) {
  if (!dto) return {};
  return {
    expires_in: toInt(dto.expiresInSec, 0),
    resend_after: toInt(dto.resendAfterSec, 0),
    // the pages only ever show a toast; `key` kept so every call site stays valid
    key: '',
  };
}

/** Everything that is just `{ok: true}` still has to resolve with an object. */
export function toPageOk(dto) {
  return { status: dto && dto.ok ? 1 : 0 };
}
