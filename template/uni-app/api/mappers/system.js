// system / storage DTOs → the legacy payloads.
//
// Contracts: next/packages/contracts/src/system/system.settings.contract.ts
//            next/packages/contracts/src/storage/storage.storefront.contract.ts

import { toInt, text, legacyDateTime } from './_shared.js';

/** `GET /api/v1/agreements/:key` → what `getUserAgreement` resolved with. */
export function toLegacyAgreement(dto) {
  if (!dto) return { title: '', content: '' };
  return {
    key: text(dto.key),
    title: text(dto.title),
    content: text(dto.content),
    update_time: legacyDateTime(dto.updatedAt),
  };
}

/** Legacy agreement slug (`user`, `privacy`, `sale`) — unchanged, but normalised. */
export function fromLegacyAgreementKey(type) {
  const key = text(type, 'user');
  if (key === 'userinfo' || key === 'user_info') return 'user';
  return key;
}

/**
 * `POST /api/v1/uploads` → the legacy upload payload.
 * `utils/util.js` wraps the raw HTTP response itself, so this is the *inner* shape.
 */
export function toLegacyUpload(dto) {
  if (!dto) return {};
  return {
    url: text(dto.url),
    name: text(dto.name),
    type: text(dto.mime),
    size: toInt(dto.size, 0),
    width: toInt(dto.width, 0),
    height: toInt(dto.height, 0),
  };
}

/** The four purposes `POST /api/v1/uploads` accepts (`userUploadPurpose`). */
const UPLOAD_PURPOSES = ['avatar', 'review', 'refund', 'staff'];

/**
 * Which bucket an upload lands in; the query `POST /api/v1/uploads` takes.
 *
 * A caller that knows its purpose says so (`{ purpose: 'refund' }`) and is taken
 * at its word — but only if it names one the contract has, so a typo lands in
 * `review` rather than being refused by the server with a 422 the page cannot
 * explain. Everything else is guessed from the legacy upload path, which is all
 * the old pages pass.
 *
 * `staff` is 商家管理's 添加商品 (CR-5-h §2): a shop asset, not a shopper's, with
 * its own directory, size ceiling and hourly budget, and refused outright unless
 * the caller is on the 店员 list. It must be asked for explicitly — the legacy
 * path there is `upload/image`, the same one 评价 and 订单备注 send, so there is
 * nothing in the URL to tell them apart.
 */
export function uploadPurposeFor(legacyUrl) {
  const path = text(legacyUrl);
  if (UPLOAD_PURPOSES.indexOf(path) !== -1) return path;
  if (path.indexOf('avatar') !== -1) return 'avatar';
  if (path.indexOf('refund') !== -1) return 'refund';
  return 'review';
}

// ---------------------------------------------------------------------------
// 站点公开配置 (F4 — GET /api/v1/site/config, system.site.contract.ts)
//
// One response, six legacy readers. The app fetches it once per session
// (`siteConfig()` in api/api.js) and each legacy function selects its slice here,
// so the pages keep the field names they were written against.
// ---------------------------------------------------------------------------

function obj(value) {
  return value && typeof value === 'object' ? value : {};
}

/**
 * `basicConfig` → what App.vue caches as `BASIC_CONFIG` and the cashier reads.
 *
 * Readers: `site_name` (登录页), `wap_login_logo` (公众号登录页), the 备案 footer
 * (`record_No`, `icp_url`, `network_security`, `network_security_url`),
 * `pay_weixin_open` (收银台), `special_invoice_status` (开票), `site_func`
 * (`libs/permission.js`). Every pay flag other than WeChat reads `0`: WeChat Pay v3
 * is the only gateway in scope (f4.md deviation 3). The three login-method switches
 * (`wechat_status`, `wechat_auth_switch`, `phone_auth_switch`) have no source in the
 * contract and are deliberately absent, which is what the app saw before this
 * route existed — CR-2-h3.
 */
export function toLegacyBasicConfig(dto) {
  const src = obj(dto);
  const logo = obj(src.logo);
  const filing = obj(src.filing);
  const payments = obj(src.payments);
  return {
    site_name: text(src.name),
    site_logo: text(logo.main),
    wap_login_logo: text(logo.login || logo.main),
    record_No: text(filing.icpNumber),
    icp_url: text(filing.icpUrl),
    network_security: text(filing.publicSecurityNumber),
    network_security_url: text(filing.publicSecurityUrl),
    pay_weixin_open: payments.wechat ? 1 : 0,
    ali_pay_status: 0,
    yue_pay_status: 0,
    offline_pay_status: 0,
    friend_pay_status: 0,
    // B2's invoice form carries both 普票 and 专票 (see toLegacyProfile)
    special_invoice_status: '1',
    // 拼团 is the one activity module this build keeps
    site_func: ['combination'],
    version: text(src.version),
  };
}

/**
 * `getLogo(type)` → `{logo_url}`. `type == 2` is the 登录页 logo; the default is the
 * one the 授权弹窗 shows. Either falls back to the other so a shop that set one logo
 * shows it everywhere.
 */
export function toLegacyLogo(dto, type) {
  const logo = obj(obj(dto).logo);
  const url = Number(type) === 2 ? logo.login || logo.main : logo.main || logo.login;
  return { logo_url: text(url) };
}

/** `getShare` → `{title, synopsis, img}` for `wx.updateAppMessageShareData` and `onShareAppMessage`. */
export function toLegacyShare(dto) {
  const share = obj(obj(dto).share);
  return {
    title: text(share.title),
    synopsis: text(share.synopsis),
    img: text(share.image),
  };
}

/**
 * `getCrmebCopyRight` → the 版权 line and image, plus the site name/logo the MP
 * privacy popup and 编辑资料 modal read out of the same cached object (both
 * spellings, because both are read).
 */
export function toLegacyCopyright(dto) {
  const src = obj(dto);
  const copyright = obj(src.copyright);
  const logo = obj(src.logo);
  const siteLogo = text(logo.square || logo.main);
  return {
    copyrightContext: text(copyright.text),
    copyrightImage: text(copyright.imageUrl),
    copyrightLink: text(copyright.link),
    site_name: text(src.name),
    siteName: text(src.name),
    site_logo: siteLogo,
    siteLogo,
  };
}

/**
 * `getCustomerType` → every reader wants `customer_qrcode` (客服二维码, which F4 keeps
 * independent of `kind`). `customer_type` / `customer_phone` ride along for the one
 * reader that keeps the whole object (订单详情).
 */
export function toLegacyCustomerService(dto) {
  const support = obj(obj(dto).support);
  return {
    customer_type: text(support.kind, 'none'),
    customer_phone: text(support.phone),
    customer_qrcode: text(support.qrcodeUrl),
  };
}

/**
 * `getOpenAdv` → `pages/guide`: `status` 0 skips the splash; otherwise a `pic` swiper
 * of `value[{img, link}]` shown for `time` seconds. There is no video splash.
 */
export function toLegacySplashAd(dto) {
  const ad = obj(obj(dto).splashAd);
  const image = text(ad.imageUrl);
  const enabled = !!ad.enabled && image !== '';
  return {
    status: enabled ? 1 : 0,
    type: 'pic',
    value: enabled ? [{ img: image, link: text(ad.link) }] : [],
    time: toInt(ad.seconds, 5),
    video_link: '',
  };
}

// ---------------------------------------------------------------------------
// 海报图片转 base64 (F4 — POST /api/v1/attachments/base64)
// ---------------------------------------------------------------------------

/** One image per call: `{url}`, this shop's own attachment only (F4's SSRF rules). */
export function fromLegacyBase64Input(url) {
  return { url: text(url).trim() };
}

/** `{dataUrl}` → the bare data URL the poster canvas draws. */
export function toLegacyBase64(dto) {
  return text(dto && dto.dataUrl);
}
