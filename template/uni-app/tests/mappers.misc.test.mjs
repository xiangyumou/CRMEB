// coupon, payment, diy, system and the shared primitives.

import { example, exampleBody, assertRenderable } from './helpers.mjs';
import {
  toId,
  toInt,
  money,
  moneyNumber,
  legacyDateTime,
  legacyMinute,
  legacyDate,
  legacyTime,
  unixSeconds,
  list,
  text,
  flag,
  pagedList,
  fromLegacyPage,
} from '../api/mappers/_shared.js';
import {
  toLegacyCouponTemplate,
  toLegacyCouponList,
  toLegacyCouponArray,
  toLegacyCouponPopup,
  toLegacyNewUserCouponPopup,
  toLegacyUserCoupon,
  toLegacyUserCouponList,
  toLegacyClaimResult,
  toLegacyApplicableCoupons,
  fromLegacyApplicableInput,
  fromLegacyCouponState,
  toLegacyGiftCoupons,
  fromLegacyStaffCouponQuery,
  toLegacyStaffCoupon,
  toLegacyStaffCoupons,
  fromLegacyCouponGrant,
  couponGrantMessage,
} from '../api/mappers/coupon.js';
import {
  paymentChannelFor,
  toLegacyPayResult,
  payResultMessage,
  toLegacyPayStatus,
} from '../api/mappers/payment.js';
import {
  toLegacyDiyPage,
  toLegacyDiyVersion,
  toLegacyTheme,
  toLegacyNavigation,
  toLegacyLayout,
  toLegacyUserMenus,
} from '../api/mappers/diy.js';
import {
  toLegacyAgreement,
  fromLegacyAgreementKey,
  toLegacyUpload,
  uploadPurposeFor,
  toLegacyBasicConfig,
  toLegacyLogo,
  toLegacyShare,
  toLegacyCopyright,
  toLegacyCustomerService,
  toLegacySplashAd,
  fromLegacyBase64Input,
  toLegacyBase64,
} from '../api/mappers/system.js';

describe('_shared', () => {
  it('keeps money a string and never invents a float', () => {
    expect(money('12.00')).toBe('12.00');
    expect(money(12)).toBe('12.00');
    expect(money(null)).toBe('0.00');
    expect(money(null, '')).toBe('');
    expect(moneyNumber('12.50')).toBe(12.5);
    expect(moneyNumber('nope')).toBe(0);
  });

  it('never returns NaN from a numeric converter', () => {
    expect(toId('nope')).toBe(0);
    expect(toId(null)).toBe(0);
    expect(toInt('nope', 7)).toBe(7);
    expect(toInt('3.9')).toBe(3);
  });

  it('formats an instant in the offset it carries, not the phone timezone', () => {
    const at = '2026-02-01T10:00:00+08:00';
    expect(legacyDateTime(at)).toBe('2026-02-01 10:00:00');
    expect(legacyMinute(at)).toBe('2026-02-01 10:00');
    expect(legacyDate(at)).toBe('2026-02-01');
    expect(legacyTime(at)).toBe('10:00:00');
  });

  it('is unaffected by the process timezone', () => {
    const at = '2026-02-01T10:00:00+08:00';
    const before = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(legacyDateTime(at)).toBe('2026-02-01 10:00:00');
      process.env.TZ = 'Asia/Tokyo';
      expect(legacyDateTime(at)).toBe('2026-02-01 10:00:00');
    } finally {
      process.env.TZ = before;
    }
  });

  it('gives unixSeconds a real instant, because countdowns subtract it from now', () => {
    expect(unixSeconds('1970-01-01T00:01:00+00:00')).toBe(60);
    expect(unixSeconds(null)).toBe(0);
    expect(unixSeconds('')).toBe(0);
  });

  it('falls back safely on every formatter', () => {
    for (const fn of [legacyDateTime, legacyMinute, legacyDate, legacyTime]) {
      expect(fn(null)).toBe('');
      expect(fn('not a date')).toBe('');
      expect(fn(undefined, '—')).toBe('—');
    }
  });

  it('keeps lists and strings safe for a template', () => {
    expect(list(null)).toEqual([]);
    expect(list('x')).toEqual([]);
    expect(text(null)).toBe('');
    expect(text(0)).toBe('0');
    expect(flag(true)).toBe(1);
    expect(flag(undefined)).toBe(0);
  });

  it('renames the legacy page params', () => {
    expect(fromLegacyPage({ page: 2, limit: 10 })).toEqual({ page: 2, pageSize: 10 });
    expect(fromLegacyPage({ pageSize: 5 })).toEqual({ pageSize: 5 });
    expect(fromLegacyPage({})).toEqual({});
    expect(fromLegacyPage(null)).toEqual({});
  });

  it('maps a paged envelope', () => {
    expect(pagedList({ items: [1, 2], total: 2, page: 1, pageSize: 20 }, (n) => n * 2))
      .toEqual({ list: [2, 4], count: 2, page: 1, limit: 20 });
    expect(pagedList(null, (n) => n)).toEqual({ list: [], count: 0, page: 1, limit: 20 });
  });
});

describe('coupon', () => {
  const TEMPLATES = example('GET /api/v1/coupons');
  const USER = example('GET /api/v1/user-coupons');

  it('maps a claimable template', () => {
    const row = toLegacyCouponTemplate(TEMPLATES.items[0]);
    expect(row).toMatchObject({
      id: 1,
      coupon_id: 1,
      coupon_title: '满 100 减 10',
      coupon_price: '10.00',
      use_min_price: '100.00',
      type: 0,
      is_permanent: 0,
      remain_count: 873,
      // `is_use` gates 立即领取: 0 means still claimable
      is_use: 0,
    });
    expect(row.use_title).toBe('2026-01-01 - 2026-12-31');
    assertRenderable(row);
  });

  it('marks a template that cannot be claimed as used', () => {
    const newUser = toLegacyCouponArray(example('GET /api/v1/coupons/new-user'))[0];
    expect(newUser.is_use).toBe(1);
    expect(newUser).toMatchObject({ is_permanent: 1, coupon_time: 30, is_unlimited: 1, remain_count: -1 });
    expect(newUser.use_title).toBe('领取后 30 天内可用');
  });

  it('answers the 首页 coupon popup as {list, image}, claimable templates only (CR-4-i §3)', () => {
    // `pages/index` and `pages/annex/special` read `res.data.list.length`.
    const popup = toLegacyCouponPopup(TEMPLATES);
    expect(popup.list).toHaveLength(1);
    expect(popup.list[0]).toMatchObject({ coupon_id: 1, coupon_price: '10.00', is_use: 0 });
    expect(popup.image).toBe('');
    const taken = { ...TEMPLATES, items: [{ ...TEMPLATES.items[0], canClaim: false }] };
    expect(toLegacyCouponPopup(taken).list).toEqual([]);
    const anonymous = { ...TEMPLATES, items: [{ ...TEMPLATES.items[0], canClaim: null }] };
    expect(toLegacyCouponPopup(anonymous).list).toEqual([]);
    expect(toLegacyCouponPopup(null)).toEqual({ list: [], image: '' });
    assertRenderable(popup);
  });

  it('answers the 新人券 popup as {list, image, show: 0} — the route cannot tell a first visit', () => {
    const popup = toLegacyNewUserCouponPopup(example('GET /api/v1/coupons/new-user'));
    expect(popup.show).toBe(0);
    expect(popup.list).toHaveLength(1);
    expect(popup.list[0].coupon_title).toBe('新人专享 5 元券');
    expect(toLegacyNewUserCouponPopup(null)).toEqual({ list: [], image: '', show: 0 });
  });

  it('maps the scope onto the legacy type', () => {
    expect(toLegacyCouponTemplate({ scope: 'all_products' }).type).toBe(0);
    expect(toLegacyCouponTemplate({ scope: 'categories' }).type).toBe(1);
    expect(toLegacyCouponTemplate({ scope: 'products' }).type).toBe(2);
  });

  it('wraps the list with the badge count', () => {
    expect(toLegacyCouponList(TEMPLATES)).toMatchObject({ count: [1], total: 1 });
    expect(toLegacyCouponList(null)).toMatchObject({ list: [], count: [0] });
    expect(toLegacyCouponArray(null)).toEqual([]);
  });

  it('maps a user coupon and its _type', () => {
    const row = toLegacyUserCoupon(USER.items[0]);
    expect(row).toMatchObject({ id: 9001, coupon_id: 1, _type: 0, _msg: '未使用', is_use: 0 });
    expect(toLegacyUserCoupon({ status: 'used' })).toMatchObject({ _type: 1, _msg: '已使用', is_use: 1 });
    expect(toLegacyUserCoupon({ status: 'expired' })).toMatchObject({ _type: 2, _msg: '已过期' });
    expect(toLegacyUserCoupon(null)).toEqual({});
    expect(toLegacyUserCouponList(USER)).toHaveLength(1);
  });

  it('maps a claim', () => {
    const out = toLegacyClaimResult(example('POST /api/v1/coupons/:id/claims'));
    expect(out.coupon).toMatchObject({ id: 9001 });
    expect(out.remain_count).toBe(872);
    expect(toLegacyClaimResult(null)).toMatchObject({ remain_count: 0 });
  });

  it('lists only the usable coupons on the 确认订单 picker, as the old route did', () => {
    const out = toLegacyApplicableCoupons(example('POST /api/v1/user-coupons/applicable'));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 9001, usable: true, discount: '10.00' });
  });

  it('builds the applicable body from a price or from explicit lines', () => {
    expect(fromLegacyApplicableInput('150.00', { productId: '11' })).toEqual({
      lines: [{ productId: '11', categoryIds: [], amount: '150.00' }],
    });
    const lines = exampleBody('POST /api/v1/user-coupons/applicable').lines;
    expect(fromLegacyApplicableInput('0', { lines })).toEqual({ lines });
  });

  it('CR-4-i §11 — the 确认订单 picker sends one line per checkout line, not productId 0', () => {
    const cartInfo = [
      { product_id: '11', cart_num: 2, truePrice: '60.00', sum_price: '120.00' },
      { product_id: '12', cart_num: 1, truePrice: '30.00', sum_price: '30.00' },
    ];
    expect(fromLegacyApplicableInput('150.00', { cartId: '5001,5002', cartInfo, new: 0, shippingType: 1 })).toEqual({
      lines: [
        { productId: '11', categoryIds: [], amount: '120.00' },
        { productId: '12', categoryIds: [], amount: '30.00' },
      ],
    });
    // The contract example's shape: every line a productId, categoryIds and amount.
    const example = exampleBody('POST /api/v1/user-coupons/applicable').lines[0];
    const ours = fromLegacyApplicableInput('0', { cartInfo }).lines[0];
    expect(Object.keys(ours).sort()).toEqual(Object.keys(example).sort());
  });

  // CR-1-h4: the confirm page's lines come from `checkoutPreview`, whose
  // `checkoutLine` has no category ids, and the applicable route matches a
  // 品类券 only on the ids the caller sends. Flip to `it` once either side fixes it.
  it.fails('CR-1-h4 — a checkout line reaches the coupon picker with its categories', () => {
    const preview = example('POST /api/v1/checkout/preview');
    const cartInfo = preview.lines.map((line) => ({
      product_id: line.productId,
      sum_price: line.totalAmount,
      categoryIds: line.categoryIds,
    }));
    const body = fromLegacyApplicableInput(preview.payableAmount, { cartInfo });
    for (const line of body.lines) expect(line.categoryIds.length).toBeGreaterThan(0);
  });

  it('maps the 我的优惠券 tab onto a state', () => {
    expect(fromLegacyCouponState(0)).toBe('all');
    expect(fromLegacyCouponState(1)).toBe('unused');
    expect(fromLegacyCouponState(2)).toBe('used');
    expect(fromLegacyCouponState(3)).toBe('expired');
  });
});

describe('coupon — 订单赠券 and the staff drawer (B3)', () => {
  it('maps the gift coupons to the 支付成功 sheet, 有效期 as two dates', () => {
    const rows = toLegacyGiftCoupons(example('GET /api/v1/orders/:id/gift-coupons'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 9001,
      coupon_title: '满 100 减 10',
      coupon_price: '10.00',
      use_min_price: '100.00',
      // the sheet renders `add_time + '-' + end_time`
      add_time: '2026-01-01',
      end_time: '2026-12-31',
    });
    assertRenderable(rows);
    expect(toLegacyGiftCoupons({ items: [] })).toEqual([]);
  });

  it('turns the drawer’s search into the staff query, one page of 100', () => {
    expect(fromLegacyStaffCouponQuery({ coupon_title: '', uid: 0 })).toEqual({ page: 1, pageSize: 100 });
    expect(fromLegacyStaffCouponQuery({ coupon_title: ' 满 100 ' })).toEqual({
      page: 1,
      pageSize: 100,
      keyword: '满 100',
    });
  });

  it('maps a grantable coupon to the drawer row', () => {
    const rows = toLegacyStaffCoupons(example('GET /api/v1/staff/coupons'));
    expect(rows[0]).toMatchObject({
      id: 1,
      coupon_title: '满 100 减 10',
      coupon_price: '10.00',
      use_min_price: '100.00',
      type: 0,
      coupon_time: 0,
      remain_count: 873,
    });
    // a fixed window: the drawer formats unix seconds itself
    expect(rows[0].start_use_time).toBeGreaterThan(0);
    expect(rows[0].end_use_time).toBeGreaterThan(rows[0].start_use_time);
    assertRenderable(rows);
    const byDays = toLegacyStaffCoupon({
      ...example('GET /api/v1/staff/coupons').items[0],
      validityMode: 'days_after_claim',
      validFrom: null,
      validTo: null,
      validDays: 30,
      scope: 'products',
    });
    expect(byDays).toMatchObject({ coupon_time: 30, start_use_time: 0, end_use_time: 0, type: 2 });
  });

  it('maps 查看优惠券 with the wallet mapper, in the order the route answers (CR-1-h3)', () => {
    const rows = toLegacyUserCouponList(example('GET /api/v1/staff/users/:uid/coupons'));
    expect(rows).toHaveLength(2);
    // the drawer renders these; `coupon_time` absent → it formats the two dates
    expect(rows[0]).toMatchObject({
      id: 9001,
      coupon_title: '满 100 减 10',
      coupon_price: '10.00',
      use_min_price: '100.00',
      type: 0,
      is_use: 0,
    });
    expect(rows[0].coupon_time).toBeUndefined();
    expect(rows[0].end_use_time).toBeGreaterThan(rows[0].start_use_time);
    // spendable first: the spent one comes second, and says so
    expect(rows[1]).toMatchObject({ id: 8990, coupon_title: '满 200 减 30', is_use: 1 });
    assertRenderable(rows);
    expect(toLegacyUserCouponList({ items: [] })).toEqual([]);
  });

  it('sends one customer and one coupon per grant', () => {
    expect(fromLegacyCouponGrant(101, 1)).toEqual(exampleBody('POST /api/v1/staff/coupon-grants'));
  });

  it('says so when a customer was skipped at the per-user limit', () => {
    expect(couponGrantMessage([example('POST /api/v1/staff/coupon-grants')])).toBe('赠送成功');
    expect(couponGrantMessage([{ granted: 0, skippedUserIds: ['101'] }])).toBe('客户已达该券的领取上限');
    expect(
      couponGrantMessage([
        { granted: 1, skippedUserIds: [] },
        { granted: 0, skippedUserIds: ['102'] },
      ]),
    ).toBe('已赠送 1 人，1 人已达领取上限');
  });
});

describe('payment', () => {
  const PAY = example('POST /api/v1/orders/:id/payments');

  it('picks the channel from the client platform', () => {
    expect(paymentChannelFor('wechat-mini')).toBe('wechat_mini');
    expect(paymentChannelFor('wechat-oa')).toBe('wechat_oa');
    expect(paymentChannelFor('h5')).toBe('wechat_h5');
    expect(paymentChannelFor(undefined)).toBe('wechat_h5');
  });

  it('builds a jsConfig utils/wechatPayment.js can pass straight through', () => {
    const out = toLegacyPayResult(PAY);
    expect(out.status).toBe('WECHAT_PAY');
    expect(out.pay_type).toBe('weixin');
    expect(out.result.jsConfig).toMatchObject({
      appId: 'wx0000000000000001',
      nonceStr: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      package: 'prepay_id=wx2612345678901234567890123456',
      signType: 'RSA',
    });
    assertRenderable(out);
  });

  it('carries the timestamp under both spellings the two SDKs read', () => {
    const { jsConfig } = toLegacyPayResult(PAY).result;
    expect(jsConfig.timestamp).toBe('1767225600');
    expect(jsConfig.timeStamp).toBe('1767225600');
  });

  it('says SUCCESS when the order was already paid', () => {
    expect(toLegacyPayResult({ ...PAY, alreadyPaid: true }).status).toBe('SUCCESS');
    expect(payResultMessage({ alreadyPaid: true })).toBe('支付成功');
    expect(payResultMessage({ alreadyPaid: false })).toBe('订单创建成功');
    expect(payResultMessage(null)).toBe('支付失败');
  });

  it('degrades to PAY_ERROR rather than throwing', () => {
    expect(toLegacyPayResult(null)).toEqual({ status: 'PAY_ERROR', result: { jsConfig: {} } });
  });

  it('maps the payment poll', () => {
    expect(toLegacyPayStatus({ outTradeNo: 'P1', orderId: '3001', paid: true, status: 'succeeded' }))
      .toMatchObject({ out_trade_no: 'P1', oid: 3001, paid: 1, status: 1 });
    expect(toLegacyPayStatus(null)).toEqual({ status: 0, paid: 0 });
  });
});

describe('diy', () => {
  const HOME = example('GET /api/v1/diy/pages/home');

  it('hands the component tree to the renderer untouched, under the name `value`', () => {
    const page = toLegacyDiyPage(HOME);
    expect(page.value).toBe(HOME.content);
    expect(page).toMatchObject({ id: 1, title: '商城首页', type: 'home', version: '1716451200000' });
  });

  it('splits the background into the four legacy flags', () => {
    expect(toLegacyDiyPage(HOME)).toMatchObject({
      is_bg_color: 1,
      color_picker: '#F5F5F5',
      is_bg_pic: 0,
      bg_pic: '',
    });
    expect(toLegacyDiyPage({ background: { imageUrl: 'a.png', imageMode: '1' } })).toMatchObject({
      is_bg_pic: 1,
      bg_pic: 'a.png',
      bg_tab_val: '1',
      is_bg_color: 0,
    });
    expect(toLegacyDiyPage(null)).toEqual({});
  });

  it('extracts the version and the theme tokens', () => {
    expect(toLegacyDiyVersion(example('GET /api/v1/diy/version'))).toEqual({ version: '1716451200000' });
    expect(toLegacyDiyVersion(null)).toEqual({ version: '' });
    const theme = toLegacyTheme(example('GET /api/v1/diy/theme'));
    expect(theme.tokens).toEqual({ theme: '#E93323', accent: '#FF7E00' });
    // `status` is legacy 一键换色's palette number, which presell/index switches on.
    expect(theme.status).toBe(3);
    expect(toLegacyTheme({ tokens: { theme: '#1DB0FC' } }).status).toBe(1);
    expect(toLegacyTheme({ tokens: { theme: '#FE5C2D' } }).status).toBe(5);
    expect(toLegacyTheme({ tokens: { theme: '#123456' } }).status).toBe(3);
    expect(toLegacyTheme(null)).toMatchObject({ status: 3, tokens: {} });
  });
});

describe('system / storage', () => {
  it('maps an agreement', () => {
    expect(toLegacyAgreement(example('GET /api/v1/agreements/:key'))).toEqual({
      key: 'user',
      title: '用户服务协议',
      content: '<p>欢迎使用本商城……</p>',
      update_time: '2026-09-20 18:30:00',
    });
    expect(toLegacyAgreement(null)).toEqual({ title: '', content: '' });
  });

  it('normalises the legacy agreement slugs', () => {
    expect(fromLegacyAgreementKey('privacy')).toBe('privacy');
    expect(fromLegacyAgreementKey('userinfo')).toBe('user');
    expect(fromLegacyAgreementKey(undefined)).toBe('user');
  });

  it('maps an upload, which utils/util.js resolves as res.data.url', () => {
    const out = toLegacyUpload(example('POST /api/v1/uploads'));
    expect(out).toMatchObject({
      url: '/uploads/review/2026/09/7c3a1f8e9d2b4a6c8e0f1a2b3c4d5e6f.jpg',
      type: 'image/jpeg',
      size: 208431,
      width: 1080,
      height: 1440,
    });
    expect(toLegacyUpload(null)).toEqual({});
  });

  it('picks the upload purpose', () => {
    expect(uploadPurposeFor('avatar')).toBe('avatar');
    expect(uploadPurposeFor('refund')).toBe('refund');
    expect(uploadPurposeFor('upload/image')).toBe('review');
    expect(uploadPurposeFor(undefined)).toBe('review');
  });

  it('takes a caller at its word when it names a purpose the contract has (CR-5-h §2)', () => {
    // 商家管理's 添加商品 has to ask for `staff`: its legacy path is `upload/image`,
    // the same one 评价 sends, so nothing in the URL could tell them apart.
    expect(uploadPurposeFor('staff')).toBe('staff');
    expect(uploadPurposeFor('review')).toBe('review');
    // A typo is not passed through — the server would answer 422 and the page
    // has nothing to say about it.
    expect(uploadPurposeFor('stafff')).toBe('review');
  });
});

describe('站点公开配置 — one GET /api/v1/site/config, six readers (F4)', () => {
  const SITE = example('GET /api/v1/site/config');

  it('BASIC_CONFIG: name, login logo, 备案 footer, pay flags', () => {
    const basic = toLegacyBasicConfig(SITE);
    expect(basic).toMatchObject({
      site_name: 'CRMEB 商城',
      wap_login_logo: '/uploads/site/2026/09/7ab319.png',
      record_No: '京ICP备00000000号',
      icp_url: 'https://beian.miit.gov.cn/',
      network_security: '',
      network_security_url: '',
      pay_weixin_open: 1,
      // WeChat Pay v3 is the only gateway (f4.md deviation 3)
      ali_pay_status: 0,
      yue_pay_status: 0,
      special_invoice_status: '1',
      site_func: ['combination'],
    });
    assertRenderable(basic);
    expect(toLegacyBasicConfig({ ...SITE, payments: { wechat: false } }).pay_weixin_open).toBe(0);
  });

  it('BASIC_CONFIG: the three login-method switches, in the legacy spelling (CR-3-h3)', () => {
    // `getMallBasicConfig` answered `wechat_status` as a boolean and the two
    // `routine_auth_type` switches as (int) 1 / 0; the pages test them for truthiness.
    expect(toLegacyBasicConfig(SITE)).toMatchObject({
      wechat_status: true,
      wechat_auth_switch: 1,
      phone_auth_switch: 1,
    });

    // The contract's `nothing-filled-in` example: a fresh install offers none.
    const bare = { ...SITE, auth: { wechatOa: false, wechatMini: false, phone: false } };
    expect(toLegacyBasicConfig(bare)).toMatchObject({
      wechat_status: false,
      wechat_auth_switch: 0,
      phone_auth_switch: 0,
    });

    // Each flag moves on its own: an H5 shop with a 公众号 and SMS but no mini program.
    const h5 = toLegacyBasicConfig({
      ...SITE,
      auth: { wechatOa: true, wechatMini: false, phone: true },
    });
    expect([h5.wechat_status, h5.wechat_auth_switch, h5.phone_auth_switch]).toEqual([true, 0, 1]);

    // A payload cached by an older server has no `auth`: everything off, which
    // is what the app saw before the flags existed — never a thrown TypeError.
    const { auth: _dropped, ...older } = SITE;
    expect(toLegacyBasicConfig(older)).toMatchObject({
      wechat_status: false,
      wechat_auth_switch: 0,
      phone_auth_switch: 0,
    });
  });

  it('getLogo picks the 登录页 logo for type 2 and falls back either way', () => {
    expect(toLegacyLogo(SITE, 2)).toEqual({ logo_url: '/uploads/site/2026/09/7ab319.png' });
    expect(toLegacyLogo(SITE)).toEqual({ logo_url: '/uploads/site/2026/09/2f8c1d.png' });
    expect(toLegacyLogo({ logo: { main: null, login: 'l.png' } })).toEqual({ logo_url: 'l.png' });
    expect(toLegacyLogo(null, 2)).toEqual({ logo_url: '' });
  });

  it('getShare is the share card', () => {
    expect(toLegacyShare(SITE)).toEqual({
      title: '示例商城',
      synopsis: '好货不贵',
      img: '/uploads/site/2026/09/5c0de1.png',
    });
  });

  it('getCrmebCopyRight carries the 版权 line and both spellings of the site name', () => {
    expect(toLegacyCopyright(SITE)).toMatchObject({
      copyrightContext: '© 2026 示例科技有限公司',
      copyrightImage: '',
      copyrightLink: 'https://example.test',
      site_name: 'CRMEB 商城',
      siteName: 'CRMEB 商城',
      siteLogo: '/uploads/site/2026/09/2f8c1d.png',
    });
  });

  it('getCustomerType answers `customer_qrcode`, empty when none is set', () => {
    expect(toLegacyCustomerService(SITE)).toEqual({
      customer_type: 'phone',
      customer_phone: '400-000-0000',
      customer_qrcode: '',
    });
    expect(toLegacyCustomerService({ support: { kind: 'none', qrcodeUrl: 'q.png' } }).customer_qrcode).toBe(
      'q.png',
    );
  });

  it('getOpenAdv is a one-slide pic splash, or status 0', () => {
    expect(toLegacySplashAd(SITE)).toEqual({
      status: 1,
      type: 'pic',
      value: [{ img: '/uploads/site/2026/09/a91f22.png', link: '/pages/goods_details/index?id=12' }],
      time: 3,
      video_link: '',
    });
    expect(toLegacySplashAd({ splashAd: { enabled: false, imageUrl: 'a.png', seconds: 3 } })).toMatchObject({
      status: 0,
      value: [],
    });
    // enabled with no image is nothing to show
    expect(toLegacySplashAd({ splashAd: { enabled: true, imageUrl: null, seconds: 3 } }).status).toBe(0);
  });
});

describe('图片转 base64 (F4 — POST /api/v1/attachments/base64)', () => {
  it('sends one url per call and reads back the data URL', () => {
    expect(fromLegacyBase64Input(' /uploads/attachment/2026/09/2f7c1a9b.png ')).toEqual(
      exampleBody('POST /api/v1/attachments/base64'),
    );
    expect(toLegacyBase64(example('POST /api/v1/attachments/base64'))).toMatch(/^data:image\/png;base64,/);
    expect(toLegacyBase64(null)).toBe('');
  });
});

describe('底部导航 and 版式 (F4)', () => {
  it('hands the renderer the saved pageFoot component itself', () => {
    const res = example('GET /api/v1/diy/navigation');
    expect(toLegacyNavigation(res)).toBe(res.navigation);
  });

  it('turns `navigation: null` into a component that asks for the native tab bar', () => {
    const nav = toLegacyNavigation({ navigation: null, version: '0' });
    expect(nav.effectConfig.tabVal).toBe(0);
    // every style pageFooter computes resolves on it
    expect(nav.bgColor.color[0].item).toBeTruthy();
    expect(nav.fillet.valList).toHaveLength(4);
    expect(nav.menuList).toEqual([]);
  });

  it('reads the 版式 number for 分类 and 个人中心', () => {
    expect(toLegacyLayout(example('GET /api/v1/diy/layouts/:type'))).toEqual({ status: 1 });
    expect(toLegacyLayout({ status: 3 })).toEqual({ status: 3 });
    expect(toLegacyUserMenus({ status: 2 })).toEqual({
      diy_data: { value: 2, my_banner_status: 0, my_menus_status: 0, business_status: 0 },
      routine_my_menus: [],
    });
  });

  it('maps the 商品详情 DIY page, built-in default included (CR-2-h3)', () => {
    const page = toLegacyDiyPage(example('GET /api/v1/diy/pages/product-detail'));
    // The default has no row: `id: null` maps to 0, which nothing on the page reads.
    expect(page).toMatchObject({ id: 0, type: 'product_detail', title: '商品详情' });
    expect(page.is_bg_color).toBe(0);
    expect(page.is_bg_pic).toBe(0);
    assertRenderable(page);
    // What PageDesign renders on the product page, and the bar productBottom styles.
    const names = Object.values(page.value).map((node) => node.name);
    expect(names).toEqual(['productInfo', 'productService', 'reviews', 'productDesc', 'bottomMenu']);
    // `productBottom.vue` finds its config by name and reads these off it.
    const bottom = Object.values(page.value).find((node) => node.name === 'bottomMenu');
    expect(bottom.componentBgConfig.colorConfig.color).toHaveLength(2);
    expect(Array.isArray(bottom.showContent.type)).toBe(true);
    // 4 is 分享: the default bar's one way to the share panel (CR-7-i).
    expect(bottom.showContent.type).toContain(4);
    expect(bottom.cartButton).toHaveProperty('tabVal');
  });

  it('maps the 个人中心 DIY page like any other page', () => {
    const page = toLegacyDiyPage(example('GET /api/v1/diy/pages/user-center'));
    expect(page).toMatchObject({ id: 4, type: 'user_center', title: '我的' });
    expect(page.value).toHaveProperty('1716451200000');
  });
});
