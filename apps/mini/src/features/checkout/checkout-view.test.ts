import { describe, expect, it } from 'vitest';
import { applicableFixture, previewFixture } from '@/test/checkout-fixture';
import {
  couponLinesOf,
  couponReason,
  customFormBody,
  customFormProblem,
  resolveCoupon,
  type CustomFormField,
} from './checkout-view';
import { checkoutBody, subscribeSceneOf } from './draft';

const fields: CustomFormField[] = [
  { key: 'name', label: '刻字内容', type: 'text', required: true },
  { key: 'size', label: '尺码', type: 'number', required: false },
  { key: 'day', label: '送达日期', type: 'date', required: false },
  { key: 'colors', label: '颜色', type: 'checkbox', required: true, options: ['红', '黑'] },
  { key: 'photo', label: '参考图', type: 'image', required: true },
];

describe('checkout view', () => {
  it('builds the body for each draft kind', () => {
    expect(
      checkoutBody(
        { source: 'cart', cartItemIds: ['1'], kind: 'normal' },
        { addressId: '301', userCouponId: null },
      ),
    ).toEqual({
      source: 'cart',
      cartItemIds: ['1'],
      kind: 'normal',
      addressId: '301',
      userCouponId: null,
    });
    expect(
      checkoutBody({
        source: 'buy-now',
        item: { skuId: '9', quantity: 1 },
        kind: 'groupbuy',
        kindMeta: { activityId: '7', groupId: '3' },
      }),
    ).toEqual({
      source: 'buy-now',
      item: { skuId: '9', quantity: 1 },
      kind: 'groupbuy',
      kindMeta: { activityId: '7', groupId: '3' },
    });
    expect(subscribeSceneOf({ kind: 'presale', kindMeta: { activityId: '1' } })).toBe(
      'presaleCheckout',
    );
    expect(subscribeSceneOf({ kind: 'normal' })).toBe('checkout');
  });

  it('picks the best usable coupon unless the shopper chose', () => {
    const coupons = applicableFixture();
    expect(resolveCoupon({ mode: 'auto' }, coupons)).toBe('901');
    expect(resolveCoupon({ mode: 'auto' }, undefined)).toBeNull();
    expect(resolveCoupon({ mode: 'none' }, coupons)).toBeNull();
    expect(resolveCoupon({ mode: 'picked', id: 'uc9' }, coupons)).toBe('uc9');
    expect(couponLinesOf(previewFixture())).toEqual([{ productId: '12', amount: '118.00' }]);
    expect(couponReason('COUPON_MIN_SPEND_NOT_MET')).toBe('未达到使用门槛');
    expect(couponReason('SOMETHING_NEW')).toBe('暂不可用');
  });

  it('checks the custom form and sends the answers', () => {
    expect(customFormProblem(fields, {})).toBe('请填写「刻字内容」');
    expect(customFormProblem(fields, { name: '安', colors: [] })).toBe('请填写「颜色」');
    expect(customFormProblem(fields, { name: '安', colors: ['红'], size: 'L' })).toBe(
      '「尺码」请填写数字',
    );
    expect(customFormProblem(fields, { name: '安', colors: ['红'], day: '10/1' })).toBe(
      '「送达日期」请按 2026-01-31 的格式填写',
    );
    // The picture field cannot be filled in here, so it does not block the order.
    expect(customFormProblem(fields, { name: '安', colors: ['红'] })).toBeNull();
    expect(customFormBody(fields, { name: ' 安 ', size: '38', colors: ['红'], day: '' })).toEqual({
      name: '安',
      size: 38,
      colors: ['红'],
    });
    expect(customFormBody(fields, {})).toBeUndefined();
  });
});
