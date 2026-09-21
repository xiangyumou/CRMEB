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
  toLegacyUserCoupon,
  toLegacyUserCouponList,
  toLegacyClaimResult,
  toLegacyApplicableCoupons,
  fromLegacyApplicableInput,
  fromLegacyCouponState,
} from '../api/mappers/coupon.js';
import {
  paymentChannelFor,
  toLegacyPayResult,
  payResultMessage,
  toLegacyPayStatus,
} from '../api/mappers/payment.js';
import { toLegacyDiyPage, toLegacyDiyVersion, toLegacyTheme } from '../api/mappers/diy.js';
import {
  toLegacyAgreement,
  fromLegacyAgreementKey,
  toLegacyUpload,
  uploadPurposeFor,
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

  it('maps the 我的优惠券 tab onto a state', () => {
    expect(fromLegacyCouponState(0)).toBe('all');
    expect(fromLegacyCouponState(1)).toBe('unused');
    expect(fromLegacyCouponState(2)).toBe('used');
    expect(fromLegacyCouponState(3)).toBe('expired');
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
    expect(theme.status).toEqual({ theme: '#E93323', accent: '#FF7E00' });
    expect(theme.tokens).toBe(theme.status);
    expect(toLegacyTheme(null)).toMatchObject({ status: {}, tokens: {} });
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
});
