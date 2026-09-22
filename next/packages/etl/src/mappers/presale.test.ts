import { describe, expect, it } from 'vitest';
import {
  mapPresale,
  parseSliderImages,
  type LegacyAdvance,
  type LegacyAdvanceSku,
} from './presale';

/**
 * Rows shaped like the legacy dump, mapped and asserted.
 *
 * The interesting cases are all constraint-shaped: a 定金 campaign that cannot
 * satisfy `presale_activities_deposit_shape`, a window that ends before it
 * starts, a `quota` that is the remainder rather than the ceiling, and a
 * variant whose product no longer has it.
 */

const MIGRATED_AT = new Date('2026-01-01T00:00:00.000Z');

const advance = (over: Partial<LegacyAdvance> = {}): LegacyAdvance => ({
  id: 1,
  product_id: 11,
  image: 'https://cdn.example.com/p/11.jpg',
  images: 'https://cdn.example.com/p/11-1.jpg,https://cdn.example.com/p/11-2.jpg',
  title: '春茶预售 · 明前龙井',
  info: '付款后 15 天内发货',
  price: '59.00',
  ot_price: '88.00',
  sort: 5,
  stock: 188,
  sales: 12,
  unit_name: '盒',
  start_time: 1_767_225_600, // 2026-01-01T00:00:00Z
  stop_time: 1_772_409_600, // 2026-03-02T00:00:00Z
  add_time: '1767225600',
  status: 1,
  is_del: 0,
  type: 0,
  deposit: '0.00',
  pay_start_time: '',
  pay_stop_time: '',
  deliver_time: 15,
  num: 2,
  temp_id: 0,
  quota: 480,
  quota_show: 500,
  once_num: 0,
  ...over,
});

const skuRow = (over: Partial<LegacyAdvanceSku> = {}): LegacyAdvanceSku => ({
  id: 901,
  product_id: 1,
  suk: '一级,250g',
  price: '59.00',
  stock: 188,
  sales: 12,
  quota: 500,
  type: 6,
  ...over,
});

const productSkus = [{ id: 21, productId: 11, specText: '一级,250g' }];

const run = (rows: LegacyAdvance[], over: Partial<Parameters<typeof mapPresale>[0]> = {}) =>
  mapPresale({ advances: rows, migratedAt: MIGRATED_AT, ...over });

describe('一个全款预售活动', () => {
  it('carries every field the new schema keeps', () => {
    const { activities, report } = run([advance()]);

    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      id: 1,
      productId: 11,
      title: '春茶预售 · 明前龙井',
      intro: '付款后 15 天内发货',
      imageUrl: 'https://cdn.example.com/p/11.jpg',
      status: 'active',
      paymentMode: 'full',
      price: '59.00',
      originalPrice: '88.00',
      depositAmount: null,
      stock: 188,
      sales: 12,
      // `quota_show` is the ceiling; `quota` is what legacy had left.
      totalQuota: 500,
      perOrderQuantity: 2,
      shipAfterDays: 15,
      shippingTemplateId: null,
      finalPaymentStartAt: null,
      finalPaymentEndAt: null,
      deletedAt: null,
    });
    expect(activities[0]?.sliderImages).toHaveLength(2);
    // 单位名 has no column here, and the count says so rather than the silence.
    expect(report.unitNamesDropped).toBe(1);
  });

  it('is `active` only while its window is still open', () => {
    const [open] = run([advance({ stop_time: 1_798_761_600 })], {
      migratedAt: MIGRATED_AT,
    }).activities;
    expect(open?.status).toBe('active');

    const [hidden] = run([advance({ status: 0, stop_time: 1_798_761_600 })]).activities;
    expect(hidden?.status).toBe('paused');
  });

  it('repairs a window that ends before it starts rather than storing it', () => {
    // `presale_activities_window_ordered` would refuse the row outright.
    const old = advance({ stop_time: 0, start_time: 1_735_689_600, add_time: '1735689600' });
    const { activities, report } = run([old]);
    expect(report.activitiesWindowRepaired).toBe(1);
    expect(activities[0]!.endAt.getTime()).toBe(
      activities[0]!.startAt.getTime() + 24 * 60 * 60 * 1000,
    );
    // A year before the dump, so it reads as what it is: over.
    expect(activities[0]?.status).toBe('ended');
  });

  it('falls back to 单次购买个数, then to one, for 每单限购', () => {
    expect(run([advance({ num: 0, once_num: 3 })]).activities[0]?.perOrderQuantity).toBe(3);
    expect(run([advance({ num: 0, once_num: 0 })]).activities[0]?.perOrderQuantity).toBe(1);
  });

  it('reads `quota` when there is no `quota_show`, and unlimited when neither', () => {
    expect(run([advance({ quota_show: 0 })]).activities[0]?.totalQuota).toBe(480);
    expect(run([advance({ quota: 0, quota_show: 0 })]).activities[0]?.totalQuota).toBeNull();
  });
});

describe('定金预售', () => {
  const deposit = (over: Partial<LegacyAdvance> = {}) =>
    advance({
      type: 1,
      deposit: '10.00',
      pay_start_time: '1772409600',
      pay_stop_time: '1772496000',
      stop_time: 1_798_761_600,
      ...over,
    });

  it('keeps the operator’s numbers but arrives paused, because nothing can sell it', () => {
    const { activities, report } = run([deposit()]);
    expect(activities[0]).toMatchObject({
      paymentMode: 'deposit',
      depositAmount: '10.00',
      // Not `active`: the domain refuses a deposit order outright, so a shopper
      // must not be shown a campaign nobody can buy.
      status: 'paused',
    });
    expect(activities[0]?.finalPaymentStartAt).toEqual(new Date('2026-03-02T00:00:00.000Z'));
    expect(report.activitiesPausedDeposit).toBe(1);
    expect(report.activitiesDepositRepaired).toBe(0);
  });

  it('becomes a full-payment campaign when the deposit cannot be stored at all', () => {
    // Each of these fails `presale_activities_deposit_shape` on its own.
    for (const broken of [
      deposit({ deposit: '0.00' }),
      deposit({ deposit: '59.00' }),
      deposit({ pay_start_time: '' }),
      deposit({ pay_stop_time: '1772409600' }),
    ]) {
      const { activities, report } = run([broken]);
      expect(activities[0]).toMatchObject({
        paymentMode: 'full',
        depositAmount: null,
        finalPaymentStartAt: null,
        finalPaymentEndAt: null,
        status: 'paused',
      });
      expect(report.activitiesDepositRepaired).toBe(1);
    }
  });
});

describe('预售规格', () => {
  it('matches type-6 attr rows to the catalogue SKU by (productId, suk)', () => {
    const { activitySkus, report } = run([advance()], {
      advanceSkus: [skuRow()],
      productSkus,
    });
    expect(activitySkus).toEqual([
      {
        activityId: 1,
        skuId: 21,
        price: '59.00',
        depositAmount: null,
        stock: 188,
        sales: 12,
        quota: 500,
        isEnabled: true,
      },
    ]);
    expect(report.activitySkus).toBe(1);
  });

  it('ignores attr rows belonging to another activity type', () => {
    // `type = 3` is 拼团. Legacy overloads one table for all of them.
    const { activitySkus } = run([advance()], {
      advanceSkus: [skuRow({ type: 3 })],
      productSkus,
    });
    expect(activitySkus).toEqual([]);
  });

  it('drops a variant the product no longer has, and counts it', () => {
    const { activitySkus, report } = run([advance()], {
      advanceSkus: [skuRow({ suk: '特级,250g' })],
      productSkus,
    });
    expect(activitySkus).toEqual([]);
    expect(report.activitySkusDroppedUnknownSku).toBe(1);
  });
});

describe('what does not come across', () => {
  it('drops a deleted campaign and names it', () => {
    const { activities, report } = run([advance({ is_del: 1 })]);
    expect(activities).toEqual([]);
    expect(report.activitiesDroppedDeleted).toBe(1);
    expect(report.droppedActivityIds).toEqual([1]);
  });

  it('drops a campaign whose product did not survive the catalogue migration', () => {
    const { activities, report } = run([advance()], { keptProductIds: new Set([12]) });
    expect(activities).toEqual([]);
    expect(report.activitiesDroppedUnknownProduct).toBe(1);
  });

  it('reports the presale orders it does not migrate', () => {
    // `presale_orders` needs `orders` rows, which this mapper cannot see.
    expect(run([advance()], { legacyPresaleOrderCount: 317 }).report.presaleOrdersSkipped).toBe(
      317,
    );
  });
});

describe('parseSliderImages', () => {
  it('reads both dump shapes and drops the empties', () => {
    expect(parseSliderImages('a.jpg, b.jpg ,')).toEqual(['a.jpg', 'b.jpg']);
    expect(parseSliderImages('["a.jpg","b.jpg"]')).toEqual(['a.jpg', 'b.jpg']);
    expect(parseSliderImages('[not json')).toEqual(['[not json']);
    expect(parseSliderImages('')).toEqual([]);
  });
});
