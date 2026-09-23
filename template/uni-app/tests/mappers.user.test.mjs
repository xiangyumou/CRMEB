// 用户资料 / 收货地址 / 登录态 / 注销申请 / 短信验证码.
//
// Fixtures are the contracts' own examples, so a mapper is never tested against a
// payload the author of the test invented.

import { example, assertRenderable } from './helpers.mjs';
import {
  toLegacyProfile,
  orderCountsOf,
  fromLegacyProfileForm,
  toLegacyAddress,
  toLegacyAddressList,
  toLegacyDefaultAddress,
  fromLegacyAddressForm,
  toLegacySession,
  toLegacyWechatLogin,
  toLegacyCancellation,
  fromLegacySmsScene,
  fromLegacySmsCodeInput,
  toLegacySmsCodeResult,
  toLegacyOk,
} from '../api/mappers/user.js';

describe('user — 我的资料', () => {
  it('composes the profile and the order counters the 个人中心 badges read', () => {
    const me = toLegacyProfile(example('GET /api/v1/profile'), example('GET /api/v1/orders/counts'));
    expect(me).toMatchObject({
      uid: 1001,
      id: 1001,
      nickname: '小明',
      avatar: 'https://cdn.example.com/2026/09/a1b2c3d4.png',
      phone: '13800138000',
      // the confirm page shows 下单手机号 off this; it is the same number now
      record_phone: '13800138000',
      has_password: true,
    });
    expect(me.orderStatusNum).toEqual({
      order_count: 12,
      unpaid_count: 1,
      unshipped_count: 2,
      received_count: 3,
      evaluated_count: 5,
      complete_count: 5,
      refund_count: 0,
      refunding_count: 0,
      cancel_count: 1,
    });
    assertRenderable(me);
  });

  it('still has every badge key when the counters read failed', () => {
    const me = toLegacyProfile(example('GET /api/v1/profile'), null);
    // the page does `item.num = res.data.orderStatusNum.unpaid_count` unguarded
    expect(me.orderStatusNum.unpaid_count).toBe(0);
    expect(Object.keys(orderCountsOf(null))).toHaveLength(9);
  });

  it('pins the retired 余额 / 会员等级 / 分销 / 多账号 fields falsy', () => {
    const me = toLegacyProfile(example('GET /api/v1/profile'));
    expect(me.now_money).toBe('0.00');
    expect(me.integral).toBe(0);
    expect(me.is_money_level).toBe(0);
    expect(me.vip).toBe(false);
    expect(me.brokerage_price).toBe('0.00');
    expect(me.new_user).toBe(0);
    // `user_info` loops over this; an empty array turns the switcher off entirely
    expect(me.switchUserInfo).toEqual([]);
  });

  it('keeps the invoice entry, because B2 ported both 普票 and 专票', () => {
    const me = toLegacyProfile(example('GET /api/v1/profile'));
    expect(me.invioce_func).toBe(true);
    expect(me.special_invoice).toBe(true);
  });

  it('sends only what userProfileForm accepts, never the phone', () => {
    expect(fromLegacyProfileForm({ nickname: '小明', avatar: '/a.png' })).toEqual({
      nickname: '小明',
      avatarUrl: '/a.png',
    });
    // `eidtUserModal` submits the whole userInfo object back
    const body = fromLegacyProfileForm({ nickname: '小明', avatar: '/a.png', phone: '13800138000', uid: 1 });
    expect(body.phone).toBeUndefined();
    expect(body.uid).toBeUndefined();
    expect(fromLegacyProfileForm({ nickname: '' })).toEqual({});
    expect(fromLegacyProfileForm(null)).toEqual({});
  });
});

describe('user — 收货地址', () => {
  it('flattens the division into the names and the ids the picker round-trips', () => {
    const rows = toLegacyAddressList(example('GET /api/v1/addresses'));
    expect(rows[0]).toEqual({
      id: 5001,
      real_name: '张三',
      phone: '13800138000',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      province_id: 110000,
      city_id: 110100,
      district_id: 110105,
      detail: '建国路 88 号 SOHO 尚都 1201',
      post_code: '100022',
      longitude: '116.472644',
      latitude: '39.913423',
      is_default: 1,
      is_del: 0,
    });
    assertRenderable(rows);
  });

  it('answers {} rather than null when there is no default address', () => {
    expect(toLegacyDefaultAddress({ address: null })).toEqual({});
    expect(toLegacyDefaultAddress(null)).toEqual({});
    expect(toLegacyDefaultAddress(example('GET /api/v1/addresses/default')).id).toBe(5001);
  });

  it('turns a null division id into 0, because the page compares it numerically', () => {
    const row = toLegacyAddress({ id: '1', provinceId: null, cityId: null, districtId: null });
    expect(row.province_id).toBe(0);
    expect(row.city_id).toBe(0);
    expect(row.district_id).toBe(0);
    expect(row.district).toBe('');
  });

  it('unpacks the nested `address` the form submits', () => {
    const body = fromLegacyAddressForm({
      real_name: ' 张三 ',
      phone: '13800138000',
      detail: ' 建国路 88 号 ',
      is_default: 1,
      address: { province: '北京市', city: '北京市', district: '朝阳区', city_id: 110100 },
    });
    expect(body).toEqual({
      receiverName: '张三',
      receiverPhone: '13800138000',
      provinceName: '北京市',
      cityName: '北京市',
      districtName: '朝阳区',
      detail: '建国路 88 号',
      isDefault: true,
      cityId: '110100',
    });
  });

  it('omits a division id the picker never produced, which a 海外 address never has', () => {
    const body = fromLegacyAddressForm({
      real_name: '李四',
      phone: '13900139000',
      detail: '1 Infinite Loop',
      address: { province: '海外', city: '美国', city_id: 0 },
      is_default: 0,
    });
    expect(body.cityId).toBeUndefined();
    expect(body.districtName).toBeUndefined();
    expect(body.isDefault).toBe(false);
  });
});

describe('auth — 登录态', () => {
  it('turns expiresAt into the unix seconds every login page subtracts from', () => {
    const session = toLegacySession(example('POST /api/v1/auth/sessions/password'));
    expect(session.token).toMatch(/^u_/);
    // the pages do `expires_time - $Cache.time()` to get a TTL in seconds
    expect(typeof session.expires_time).toBe('number');
    expect(session.expires_time).toBeGreaterThan(1700000000);
    expect(session.uid).toBe(1001);
    assertRenderable(session);
  });

  it('carries the profile that rode along, so no second read is needed for uid', () => {
    const session = toLegacySession(example('POST /api/v1/auth/sessions/sms'));
    expect(session.userInfo.uid).toBe(session.uid);
    expect(session.userInfo.nickname).toBe('小明');
  });

  it('reports a brand-new account as new_user, which shows 欢迎加入 once', () => {
    expect(toLegacySession({ token: 't', registered: true }).new_user).toBe(1);
    expect(toLegacySession({ token: 't', registered: false }).new_user).toBe(0);
  });

  it('unwraps the WeChat result, signed-in and phone-required alike', () => {
    const ok = toLegacyWechatLogin(example('POST /api/v1/auth/sessions/wechat-mini'));
    expect(ok.status).toBe('signed-in');
    expect(ok.is_bind).toBe(0);
    expect(ok.uid).toBe(1002);
    expect(ok.token).toMatch(/^u_/);

    const needsPhone = toLegacyWechatLogin({
      status: 'phone-required',
      session: null,
      registered: false,
      bindToken: 'wxb_4f1c8a2d7e6b5039',
      bindTokenExpiresInSec: 600,
    });
    expect(needsPhone.is_phone_required).toBe(true);
    expect(needsPhone.is_bind).toBe(1);
    // the page stashes it as `authKey` and hands it to the phone screen
    expect(needsPhone.key).toBe('wxb_4f1c8a2d7e6b5039');
    expect(needsPhone.token).toBe('');
    expect(needsPhone.uid).toBe(0);
  });
});

describe('auth — 短信验证码', () => {
  it('maps the legacy type onto the scene the Redis key is namespaced by', () => {
    expect(fromLegacySmsScene('login')).toBe('login');
    expect(fromLegacySmsScene('register')).toBe('register');
    expect(fromLegacySmsScene('reset')).toBe('reset-password');
    expect(fromLegacySmsScene('binding')).toBe('bind-phone');
    expect(fromLegacySmsScene('change')).toBe('change-phone');
    // an unknown type must not silently become a 注销 code
    expect(fromLegacySmsScene('whatever')).toBe('login');
    expect(fromLegacySmsScene(undefined)).toBe('login');
  });

  // 图形验证码的 `key` 和行为验证码的 `captchaVerification` 都没有继任者（E4 裁掉了
  // 行为验证码），两个字段都不再往上送。
  it('drops both of the dead captcha fields', () => {
    expect(fromLegacySmsCodeInput({ phone: '13800138000', type: 'reset', key: 'abc' })).toEqual({
      phone: '13800138000',
      scene: 'reset-password',
    });
    expect(
      fromLegacySmsCodeInput({ phone: '13800138000', type: 'login', captchaVerification: 'tok' }),
    ).toEqual({ phone: '13800138000', scene: 'login' });
  });

  it('answers the 倒计时 with the resend window', () => {
    expect(toLegacySmsCodeResult(example('POST /api/v1/auth/sms-codes'))).toEqual({
      expires_in: 300,
      resend_after: 60,
      key: '',
    });
    expect(toLegacySmsCodeResult(null)).toEqual({});
  });

  it('turns {ok: true} into something the pages can read', () => {
    expect(toLegacyOk({ ok: true })).toEqual({ status: 1 });
    expect(toLegacyOk(null)).toEqual({ status: 0 });
  });
});

describe('user — 注销申请', () => {
  it('is a reviewed request now, not a flag flipped on tap', () => {
    const request = toLegacyCancellation(example('POST /api/v1/account-cancellations'));
    expect(request).toMatchObject({ id: 31, uid: 1001, status: 'pending', status_num: 0 });
    expect(request.reason).toBe('不再使用了');
    assertRenderable(request);
  });

  it('unwraps the {request} envelope and answers {} when there is none', () => {
    expect(toLegacyCancellation({ request: null })).toEqual({});
    expect(toLegacyCancellation(null)).toEqual({});
    expect(toLegacyCancellation(example('GET /api/v1/account-cancellations/current')).id).toBe(31);
  });

  it('gives each status a number, so a 已驳回 never reads as 审核中', () => {
    expect(toLegacyCancellation({ status: 'approved' }).status_num).toBe(1);
    expect(toLegacyCancellation({ status: 'rejected' }).status_num).toBe(-1);
    expect(toLegacyCancellation({ status: 'withdrawn' }).status_num).toBe(-2);
  });
});
