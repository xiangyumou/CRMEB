// coupon, payment, diy, system and the shared primitives.

import { example, exampleBody, assertRenderable } from './helpers.mjs';
import {
  toId,
  toInt,
  money,
  moneyNumber,
  pageDateTime,
  pageMinute,
  pageDate,
  pageTime,
  unixSeconds,
  list,
  text,
  flag,
  pagedList,
  fromPagePaging,
} from '../api/mappers/_shared.js';
import {
  toPageCouponTemplate,
  toPageCouponList,
  toPageCouponArray,
  toPageCouponPopup,
  toPageNewUserCouponPopup,
  toPageUserCoupon,
  toPageUserCouponList,
  toPageClaimResult,
  toPageApplicableCoupons,
  fromPageApplicableInput,
  fromPageCouponState,
  toPageGiftCoupons,
  fromPageStaffCouponQuery,
  toPageStaffCoupon,
  toPageStaffCoupons,
  fromPageCouponGrant,
  couponGrantMessage,
} from '../api/mappers/coupon.js';
import {
  paymentChannelFor,
  toPagePayResult,
  payResultMessage,
  toPagePayStatus,
} from '../api/mappers/payment.js';
import {
  toPageDiyPage,
  toPageDiyVersion,
  toPageTheme,
  toPageNavigation,
  toPageLayout,
  toPageUserMenus,
} from '../api/mappers/diy.js';
import {
  toPageAgreement,
  fromPageAgreementKey,
  toPageUpload,
  uploadPurposeFor,
  toPageBasicConfig,
  toPageLogo,
  toPageShare,
  toPageCopyright,
  toPageCustomerService,
  toPageSplashAd,
  fromPageBase64Input,
  toPageBase64,
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
    expect(pageDateTime(at)).toBe('2026-02-01 10:00:00');
    expect(pageMinute(at)).toBe('2026-02-01 10:00');
    expect(pageDate(at)).toBe('2026-02-01');
    expect(pageTime(at)).toBe('10:00:00');
  });

  it('is unaffected by the process timezone', () => {
    const at = '2026-02-01T10:00:00+08:00';
    const before = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(pageDateTime(at)).toBe('2026-02-01 10:00:00');
      process.env.TZ = 'Asia/Tokyo';
      expect(pageDateTime(at)).toBe('2026-02-01 10:00:00');
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
    for (const fn of [pageDateTime, pageMinute, pageDate, pageTime]) {
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

  it('renames the page params', () => {
    expect(fromPagePaging({ page: 2, limit: 10 })).toEqual({ page: 2, pageSize: 10 });
    expect(fromPagePaging({ pageSize: 5 })).toEqual({ pageSize: 5 });
    expect(fromPagePaging({})).toEqual({});
    expect(fromPagePaging(null)).toEqual({});
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
    const row = toPageCouponTemplate(TEMPLATES.items[0]);
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
    const newUser = toPageCouponArray(example('GET /api/v1/coupons/new-user'))[0];
    expect(newUser.is_use).toBe(1);
    expect(newUser).toMatchObject({ is_permanent: 1, coupon_time: 30, is_unlimited: 1, remain_count: -1 });
    expect(newUser.use_title).toBe('领取后 30 天内可用');
  });

  it('answers the 首页 coupon popup as {list, image}, claimable templates only', () => {
    // `pages/index` and `pages/annex/special` read `res.data.list.length`.
    const popup = toPageCouponPopup(TEMPLATES);
    expect(popup.list).toHaveLength(1);
    expect(popup.list[0]).toMatchObject({ coupon_id: 1, coupon_price: '10.00', is_use: 0 });
    expect(popup.image).toBe('');
    const taken = { ...TEMPLATES, items: [{ ...TEMPLATES.items[0], canClaim: false }] };
    expect(toPageCouponPopup(taken).list).toEqual([]);
    const anonymous = { ...TEMPLATES, items: [{ ...TEMPLATES.items[0], canClaim: null }] };
    expect(toPageCouponPopup(anonymous).list).toEqual([]);
    expect(toPageCouponPopup(null)).toEqual({ list: [], image: '' });
    assertRenderable(popup);
  });

  it('answers the 新人券 popup as {list, image, show: 0} — the route cannot tell a first visit', () => {
    const popup = toPageNewUserCouponPopup(example('GET /api/v1/coupons/new-user'));
    expect(popup.show).toBe(0);
    expect(popup.list).toHaveLength(1);
    expect(popup.list[0].coupon_title).toBe('新人专享 5 元券');
    expect(toPageNewUserCouponPopup(null)).toEqual({ list: [], image: '', show: 0 });
  });

  it('maps the scope onto the page type', () => {
    expect(toPageCouponTemplate({ scope: 'all_products' }).type).toBe(0);
    expect(toPageCouponTemplate({ scope: 'categories' }).type).toBe(1);
    expect(toPageCouponTemplate({ scope: 'products' }).type).toBe(2);
  });

  it('wraps the list with the badge count', () => {
    expect(toPageCouponList(TEMPLATES)).toMatchObject({ count: [1], total: 1 });
    expect(toPageCouponList(null)).toMatchObject({ list: [], count: [0] });
    expect(toPageCouponArray(null)).toEqual([]);
  });

  it('maps a user coupon and its _type', () => {
    const row = toPageUserCoupon(USER.items[0]);
    expect(row).toMatchObject({ id: 9001, coupon_id: 1, _type: 0, _msg: '未使用', is_use: 0 });
    expect(toPageUserCoupon({ status: 'used' })).toMatchObject({ _type: 1, _msg: '已使用', is_use: 1 });
    expect(toPageUserCoupon({ status: 'expired' })).toMatchObject({ _type: 2, _msg: '已过期' });
    expect(toPageUserCoupon(null)).toEqual({});
    expect(toPageUserCouponList(USER)).toHaveLength(1);
  });

  it('maps a claim', () => {
    const out = toPageClaimResult(example('POST /api/v1/coupons/:id/claims'));
    expect(out.coupon).toMatchObject({ id: 9001 });
    expect(out.remain_count).toBe(872);
    expect(toPageClaimResult(null)).toMatchObject({ remain_count: 0 });
  });

  it('lists only the usable coupons on the 确认订单 picker', () => {
    const out = toPageApplicableCoupons(example('POST /api/v1/user-coupons/applicable'));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 9001, usable: true, discount: '10.00' });
  });

  it('builds the applicable body from a price or from explicit lines', () => {
    expect(fromPageApplicableInput('150.00', { productId: '11' })).toEqual({
      lines: [{ productId: '11', amount: '150.00' }],
    });
    const lines = exampleBody('POST /api/v1/user-coupons/applicable').lines;
    expect(fromPageApplicableInput('0', { lines })).toEqual({ lines });
  });

  it('the 确认订单 picker sends one line per checkout line, not productId 0', () => {
    const cartInfo = [
      { product_id: '11', cart_num: 2, truePrice: '60.00', sum_price: '120.00' },
      { product_id: '12', cart_num: 1, truePrice: '30.00', sum_price: '30.00' },
    ];
    expect(fromPageApplicableInput('150.00', { cartId: '5001,5002', cartInfo, new: 0, shippingType: 1 })).toEqual({
      lines: [
        { productId: '11', amount: '120.00' },
        { productId: '12', amount: '30.00' },
      ],
    });
    // The contract example's shape: every line a productId and an amount, and no categoryIds.
    const example = exampleBody('POST /api/v1/user-coupons/applicable').lines[0];
    const ours = fromPageApplicableInput('0', { cartInfo }).lines[0];
    expect(Object.keys(ours).sort()).toEqual(Object.keys(example).sort());
  });

  it('sends no categoryIds: the server resolves them from the product', () => {
    const preview = example('POST /api/v1/checkout/preview');
    const cartInfo = preview.lines.map((line) => ({ product_id: line.productId, sum_price: line.totalAmount }));
    const body = fromPageApplicableInput(preview.payableAmount, { cartInfo });
    expect(body.lines).toHaveLength(preview.lines.length);
    for (const line of body.lines) expect(line).not.toHaveProperty('categoryIds');
  });

  it('maps the 我的优惠券 tab onto a state', () => {
    expect(fromPageCouponState(0)).toBe('all');
    expect(fromPageCouponState(1)).toBe('unused');
    expect(fromPageCouponState(2)).toBe('used');
    expect(fromPageCouponState(3)).toBe('expired');
  });
});

describe('coupon — 订单赠券 and the staff drawer', () => {
  it('maps the gift coupons to the 支付成功 sheet, 有效期 as two dates', () => {
    const rows = toPageGiftCoupons(example('GET /api/v1/orders/:id/gift-coupons'));
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
    expect(toPageGiftCoupons({ items: [] })).toEqual([]);
  });

  it('turns the drawer’s search into the staff query, one page of 100', () => {
    expect(fromPageStaffCouponQuery({ coupon_title: '', uid: 0 })).toEqual({ page: 1, pageSize: 100 });
    expect(fromPageStaffCouponQuery({ coupon_title: ' 满 100 ' })).toEqual({
      page: 1,
      pageSize: 100,
      keyword: '满 100',
    });
  });

  it('maps a grantable coupon to the drawer row', () => {
    const rows = toPageStaffCoupons(example('GET /api/v1/staff/coupons'));
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
    const byDays = toPageStaffCoupon({
      ...example('GET /api/v1/staff/coupons').items[0],
      validityMode: 'days_after_claim',
      validFrom: null,
      validTo: null,
      validDays: 30,
      scope: 'products',
    });
    expect(byDays).toMatchObject({ coupon_time: 30, start_use_time: 0, end_use_time: 0, type: 2 });
  });

  it('maps 查看优惠券 with the wallet mapper, in the order the route answers', () => {
    const rows = toPageUserCouponList(example('GET /api/v1/staff/users/:uid/coupons'));
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
    expect(toPageUserCouponList({ items: [] })).toEqual([]);
  });

  it('sends one customer and one coupon per grant', () => {
    expect(fromPageCouponGrant(101, 1)).toEqual(exampleBody('POST /api/v1/staff/coupon-grants'));
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
    const out = toPagePayResult(PAY);
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
    const { jsConfig } = toPagePayResult(PAY).result;
    expect(jsConfig.timestamp).toBe('1767225600');
    expect(jsConfig.timeStamp).toBe('1767225600');
  });

  it('says SUCCESS when the order was already paid', () => {
    expect(toPagePayResult({ ...PAY, alreadyPaid: true }).status).toBe('SUCCESS');
    expect(payResultMessage({ alreadyPaid: true })).toBe('支付成功');
    expect(payResultMessage({ alreadyPaid: false })).toBe('订单创建成功');
    expect(payResultMessage(null)).toBe('支付失败');
  });

  it('degrades to PAY_ERROR rather than throwing', () => {
    expect(toPagePayResult(null)).toEqual({ status: 'PAY_ERROR', result: { jsConfig: {} } });
  });

  it('maps the payment poll', () => {
    expect(toPagePayStatus({ outTradeNo: 'P1', orderId: '3001', paid: true, status: 'succeeded' }))
      .toMatchObject({ out_trade_no: 'P1', oid: 3001, paid: 1, status: 1 });
    expect(toPagePayStatus(null)).toEqual({ status: 0, paid: 0 });
  });
});

describe('diy', () => {
  const HOME = example('GET /api/v1/diy/pages/home');

  it('hands the component tree to the renderer untouched, under the name `value`', () => {
    const page = toPageDiyPage(HOME);
    expect(page.value).toBe(HOME.content);
    expect(page).toMatchObject({ id: 1, title: '商城首页', type: 'home', version: '1716451200000' });
  });

  it('splits the background into the four page flags', () => {
    expect(toPageDiyPage(HOME)).toMatchObject({
      is_bg_color: 1,
      color_picker: '#F5F5F5',
      is_bg_pic: 0,
      bg_pic: '',
    });
    expect(toPageDiyPage({ background: { imageUrl: 'a.png', imageMode: '1' } })).toMatchObject({
      is_bg_pic: 1,
      bg_pic: 'a.png',
      bg_tab_val: '1',
      is_bg_color: 0,
    });
    expect(toPageDiyPage(null)).toEqual({});
  });

  it('extracts the version and the theme tokens', () => {
    expect(toPageDiyVersion(example('GET /api/v1/diy/version'))).toEqual({ version: '1716451200000' });
    expect(toPageDiyVersion(null)).toEqual({ version: '' });
    const theme = toPageTheme(example('GET /api/v1/diy/theme'));
    expect(theme.tokens).toEqual({ theme: '#E93323', accent: '#FF7E00' });
    // `status` is 一键换色's palette number, which presell/index switches on.
    expect(theme.status).toBe(3);
    expect(toPageTheme({ tokens: { theme: '#1DB0FC' } }).status).toBe(1);
    expect(toPageTheme({ tokens: { theme: '#FE5C2D' } }).status).toBe(5);
    expect(toPageTheme({ tokens: { theme: '#123456' } }).status).toBe(3);
    expect(toPageTheme(null)).toMatchObject({ status: 3, tokens: {} });
  });
});

describe('system / storage', () => {
  it('maps an agreement', () => {
    expect(toPageAgreement(example('GET /api/v1/agreements/:key'))).toEqual({
      key: 'user',
      title: '用户服务协议',
      content: '<p>欢迎使用本商城……</p>',
      update_time: '2026-09-20 18:30:00',
    });
    expect(toPageAgreement(null)).toEqual({ title: '', content: '' });
  });

  it('normalises the page agreement slugs', () => {
    expect(fromPageAgreementKey('privacy')).toBe('privacy');
    expect(fromPageAgreementKey('userinfo')).toBe('user');
    expect(fromPageAgreementKey(undefined)).toBe('user');
  });

  it('maps an upload, which utils/util.js resolves as res.data.url', () => {
    const out = toPageUpload(example('POST /api/v1/uploads'));
    expect(out).toMatchObject({
      url: '/uploads/review/2026/09/7c3a1f8e9d2b4a6c8e0f1a2b3c4d5e6f.jpg',
      type: 'image/jpeg',
      size: 208431,
      width: 1080,
      height: 1440,
    });
    expect(toPageUpload(null)).toEqual({});
  });

  it('picks the upload purpose', () => {
    expect(uploadPurposeFor('avatar')).toBe('avatar');
    expect(uploadPurposeFor('refund')).toBe('refund');
    expect(uploadPurposeFor('upload/image')).toBe('review');
    expect(uploadPurposeFor(undefined)).toBe('review');
  });

  it('takes a caller at its word when it names a purpose the contract has', () => {
    // 商家管理's 添加商品 has to ask for `staff`: its page path is `upload/image`,
    // the same one 评价 sends, so nothing in the URL could tell them apart.
    expect(uploadPurposeFor('staff')).toBe('staff');
    expect(uploadPurposeFor('review')).toBe('review');
    // A typo is not passed through — the server would answer 422 and the page
    // has nothing to say about it.
    expect(uploadPurposeFor('stafff')).toBe('review');
  });
});

describe('站点公开配置 — one GET /api/v1/site/config, six readers', () => {
  const SITE = example('GET /api/v1/site/config');

  it('BASIC_CONFIG: name, login logo, 备案 footer, pay flags', () => {
    const basic = toPageBasicConfig(SITE);
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
    expect(toPageBasicConfig({ ...SITE, payments: { wechat: false } }).pay_weixin_open).toBe(0);
  });

  it('BASIC_CONFIG: the three login-method switches, in the page spelling', () => {
    // `getMallBasicConfig` answered `wechat_status` as a boolean and the two
    // `routine_auth_type` switches as (int) 1 / 0; the pages test them for truthiness.
    expect(toPageBasicConfig(SITE)).toMatchObject({
      wechat_status: true,
      wechat_auth_switch: 1,
      phone_auth_switch: 1,
    });

    // The contract's `nothing-filled-in` example: a fresh install offers none.
    const bare = { ...SITE, auth: { wechatOa: false, wechatMini: false, phone: false } };
    expect(toPageBasicConfig(bare)).toMatchObject({
      wechat_status: false,
      wechat_auth_switch: 0,
      phone_auth_switch: 0,
    });

    // Each flag moves on its own: an H5 shop with a 公众号 and SMS but no mini program.
    const h5 = toPageBasicConfig({
      ...SITE,
      auth: { wechatOa: true, wechatMini: false, phone: true },
    });
    expect([h5.wechat_status, h5.wechat_auth_switch, h5.phone_auth_switch]).toEqual([true, 0, 1]);

    // A payload cached by an older server has no `auth`: everything off, which
    // is what the app saw before the flags existed — never a thrown TypeError.
    const { auth: _dropped, ...older } = SITE;
    expect(toPageBasicConfig(older)).toMatchObject({
      wechat_status: false,
      wechat_auth_switch: 0,
      phone_auth_switch: 0,
    });
  });

  it('getLogo picks the 登录页 logo for type 2 and falls back either way', () => {
    expect(toPageLogo(SITE, 2)).toEqual({ logo_url: '/uploads/site/2026/09/7ab319.png' });
    expect(toPageLogo(SITE)).toEqual({ logo_url: '/uploads/site/2026/09/2f8c1d.png' });
    expect(toPageLogo({ logo: { main: null, login: 'l.png' } })).toEqual({ logo_url: 'l.png' });
    expect(toPageLogo(null, 2)).toEqual({ logo_url: '' });
  });

  it('getShare is the share card', () => {
    expect(toPageShare(SITE)).toEqual({
      title: '示例商城',
      synopsis: '好货不贵',
      img: '/uploads/site/2026/09/5c0de1.png',
    });
  });

  it('getCrmebCopyRight carries the 版权 line and both spellings of the site name', () => {
    expect(toPageCopyright(SITE)).toMatchObject({
      copyrightContext: '© 2026 示例科技有限公司',
      copyrightImage: '',
      copyrightLink: 'https://example.test',
      site_name: 'CRMEB 商城',
      siteName: 'CRMEB 商城',
      siteLogo: '/uploads/site/2026/09/2f8c1d.png',
    });
  });

  it('getCustomerType answers `customer_qrcode`, empty when none is set', () => {
    expect(toPageCustomerService(SITE)).toEqual({
      customer_type: 'phone',
      customer_phone: '400-000-0000',
      customer_qrcode: '',
    });
    expect(toPageCustomerService({ support: { kind: 'none', qrcodeUrl: 'q.png' } }).customer_qrcode).toBe(
      'q.png',
    );
  });

  it('getOpenAdv is a one-slide pic splash, or status 0', () => {
    expect(toPageSplashAd(SITE)).toEqual({
      status: 1,
      type: 'pic',
      value: [{ img: '/uploads/site/2026/09/a91f22.png', link: '/pages/goods_details/index?id=12' }],
      time: 3,
      video_link: '',
    });
    expect(toPageSplashAd({ splashAd: { enabled: false, imageUrl: 'a.png', seconds: 3 } })).toMatchObject({
      status: 0,
      value: [],
    });
    // enabled with no image is nothing to show
    expect(toPageSplashAd({ splashAd: { enabled: true, imageUrl: null, seconds: 3 } }).status).toBe(0);
  });
});

describe('图片转 base64 (POST /api/v1/attachments/base64)', () => {
  it('sends one url per call and reads back the data URL', () => {
    expect(fromPageBase64Input(' /uploads/attachment/2026/09/2f7c1a9b.png ')).toEqual(
      exampleBody('POST /api/v1/attachments/base64'),
    );
    expect(toPageBase64(example('POST /api/v1/attachments/base64'))).toMatch(/^data:image\/png;base64,/);
    expect(toPageBase64(null)).toBe('');
  });
});

describe('底部导航 and 版式', () => {
  it('hands the renderer the saved pageFoot component itself', () => {
    const res = example('GET /api/v1/diy/navigation');
    expect(toPageNavigation(res)).toBe(res.navigation);
  });

  it('turns `navigation: null` into a component that asks for the native tab bar', () => {
    const nav = toPageNavigation({ navigation: null, version: '0' });
    expect(nav.effectConfig.tabVal).toBe(0);
    // every style pageFooter computes resolves on it
    expect(nav.bgColor.color[0].item).toBeTruthy();
    expect(nav.fillet.valList).toHaveLength(4);
    expect(nav.menuList).toEqual([]);
  });

  it('reads the 版式 number for 分类 and 个人中心', () => {
    expect(toPageLayout(example('GET /api/v1/diy/layouts/:type'))).toEqual({ status: 1 });
    expect(toPageLayout({ status: 3 })).toEqual({ status: 3 });
    expect(toPageUserMenus({ status: 2 })).toEqual({
      diy_data: { value: 2, my_banner_status: 0, my_menus_status: 0, business_status: 0 },
      routine_my_menus: [],
    });
  });

  it('maps the 商品详情 DIY page, built-in default included', () => {
    const page = toPageDiyPage(example('GET /api/v1/diy/pages/product-detail'));
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
    // 4 is 分享: the default bar's one way to the share panel.
    expect(bottom.showContent.type).toContain(4);
    expect(bottom.cartButton).toHaveProperty('tabVal');
  });

  it('maps the 个人中心 DIY page like any other page', () => {
    const page = toPageDiyPage(example('GET /api/v1/diy/pages/user-center'));
    expect(page).toMatchObject({ id: 4, type: 'user_center', title: '我的' });
    expect(page.value).toHaveProperty('1716451200000');
  });
});
