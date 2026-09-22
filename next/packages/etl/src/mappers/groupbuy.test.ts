import { describe, expect, it } from 'vitest';
import {
  mapGroupbuy,
  parseSliderImages,
  type LegacyCombination,
  type LegacyCombinationSku,
} from './groupbuy';

/**
 * Rows shaped like the legacy dump, mapped and asserted.
 *
 * The interesting cases are all constraint-shaped: a one-person team, a window
 * that ends before it starts, a `quota` that is the remainder rather than the
 * ceiling, and a variant whose product no longer has it.
 */

const MIGRATED_AT = new Date('2026-01-01T00:00:00.000Z');

const combination = (over: Partial<LegacyCombination> = {}): LegacyCombination => ({
  id: 1,
  product_id: 11,
  title: '三人成团 · 坚果礼盒',
  info: '三人成团立减 29 元',
  image: 'https://cdn.example.com/p/11.jpg',
  images: 'https://cdn.example.com/p/11-1.jpg,https://cdn.example.com/p/11-2.jpg',
  people: 3,
  price: '59.00',
  cost: '31.00',
  sort: 5,
  sales: 12,
  stock: 188,
  start_time: 1_767_225_600, // 2026-01-01T00:00:00Z
  stop_time: 1_772_409_600, // 2026-03-02T00:00:00Z
  effective_time: 24,
  once_num: 2,
  quota: 480,
  quota_show: 500,
  virtual: 100,
  is_commission: 0,
  browse: 900,
  temp_id: 0,
  is_show: 1,
  is_del: 0,
  add_time: '1767225600',
  ...over,
});

const skuRow = (over: Partial<LegacyCombinationSku> = {}): LegacyCombinationSku => ({
  id: 901,
  product_id: 1,
  suk: '混合装,1000g',
  price: '59.00',
  stock: 188,
  sales: 12,
  quota: 500,
  type: 3,
  ...over,
});

const productSkus = [{ id: 21, productId: 11, specText: '混合装,1000g' }];
const keptProductIds = new Set([11]);

describe('mapGroupbuy', () => {
  it('maps a campaign and its per-variant prices', () => {
    const { activities, activitySkus, report } = mapGroupbuy({
      combinations: [combination()],
      combinationSkus: [skuRow()],
      productSkus,
      keptProductIds,
      migratedAt: MIGRATED_AT,
    });

    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      id: 1,
      productId: 11,
      title: '三人成团 · 坚果礼盒',
      seatsRequired: 3,
      // `effective_time` is hours in legacy and seconds here.
      groupTtlSeconds: 86_400,
      stock: 188,
      sales: 12,
      perOrderQuantity: 2,
      status: 'active',
      sortOrder: 5,
      views: 900,
    });
    expect(activities[0]!.sliderImages).toEqual([
      'https://cdn.example.com/p/11-1.jpg',
      'https://cdn.example.com/p/11-2.jpg',
    ]);
    expect(activitySkus).toEqual([
      {
        activityId: 1,
        skuId: 21,
        price: '59.00',
        stock: 188,
        sales: 12,
        quota: 500,
        isEnabled: true,
      },
    ]);
    expect(report).toMatchObject({ activities: 1, activitySkus: 1 });
  });

  it('takes the quota ceiling from quota_show, not from the remainder', () => {
    const { activities } = mapGroupbuy({
      combinations: [combination({ quota: 3, quota_show: 500 })],
      keptProductIds,
      migratedAt: MIGRATED_AT,
    });
    expect(activities[0]!.totalQuota).toBe(500);
  });

  it('leaves the quota open when legacy had none', () => {
    const { activities } = mapGroupbuy({
      combinations: [combination({ quota: 0, quota_show: 0 })],
      keptProductIds,
      migratedAt: MIGRATED_AT,
    });
    expect(activities[0]!.totalQuota).toBeNull();
  });

  it('drops a one-person team, which the new CHECK would refuse', () => {
    const { activities, report } = mapGroupbuy({
      combinations: [combination({ people: 1 })],
      keptProductIds,
      migratedAt: MIGRATED_AT,
    });
    expect(activities).toEqual([]);
    expect(report).toMatchObject({ activitiesDroppedSeats: 1, droppedActivityIds: [1] });
  });

  it('drops a deleted campaign and one whose product is gone', () => {
    const { activities, report } = mapGroupbuy({
      combinations: [combination({ id: 1, is_del: 1 }), combination({ id: 2, product_id: 99 })],
      keptProductIds,
      migratedAt: MIGRATED_AT,
    });
    expect(activities).toEqual([]);
    expect(report).toMatchObject({
      activitiesDroppedDeleted: 1,
      activitiesDroppedUnknownProduct: 1,
    });
  });

  it('repairs a window that ends before it starts', () => {
    const { activities, report } = mapGroupbuy({
      combinations: [combination({ stop_time: 0 })],
      keptProductIds,
      migratedAt: MIGRATED_AT,
    });
    expect(activities[0]!.endAt.getTime()).toBeGreaterThan(activities[0]!.startAt.getTime());
    expect(report.activitiesWindowRepaired).toBe(1);
  });

  it('calls a closed campaign ended and a hidden one paused', () => {
    const { activities } = mapGroupbuy({
      combinations: [
        combination({ id: 1, start_time: 1_704_067_200, stop_time: 1_706_745_600 }), // 2024
        combination({ id: 2, is_show: 0 }),
      ],
      keptProductIds,
      migratedAt: MIGRATED_AT,
    });
    expect(activities.map((a) => a.status)).toEqual(['ended', 'paused']);
  });

  it('defaults a missing team lifetime to legacy 24 hours', () => {
    const { activities } = mapGroupbuy({
      combinations: [combination({ effective_time: 0 })],
      keptProductIds,
      migratedAt: MIGRATED_AT,
    });
    expect(activities[0]!.groupTtlSeconds).toBe(86_400);
  });

  it('drops a variant the product no longer has, and counts it', () => {
    const { activitySkus, report } = mapGroupbuy({
      combinations: [combination()],
      combinationSkus: [skuRow(), skuRow({ id: 902, suk: '单品装,500g' })],
      productSkus,
      keptProductIds,
      migratedAt: MIGRATED_AT,
    });
    expect(activitySkus).toHaveLength(1);
    expect(report.activitySkusDroppedUnknownSku).toBe(1);
  });

  it('ignores attr values belonging to seckill and bargain', () => {
    const { activitySkus } = mapGroupbuy({
      combinations: [combination()],
      combinationSkus: [skuRow({ type: 1 }), skuRow({ id: 903, type: 2 })],
      productSkus,
      keptProductIds,
      migratedAt: MIGRATED_AT,
    });
    expect(activitySkus).toEqual([]);
  });

  it('counts what it deliberately leaves behind', () => {
    const { report } = mapGroupbuy({
      combinations: [combination({ virtual: 60, is_commission: 1 })],
      keptProductIds,
      legacyTeamCount: 4_812,
      migratedAt: MIGRATED_AT,
    });
    // 虚拟成团百分比 has no home: the new switch is shop-wide and boolean
    // (CR-2-d). 团长佣金 is out of scope. `eb_store_pink` is not migrated at
    // all — the number is reported so it appears in the runner's log.
    expect(report).toMatchObject({
      virtualPercentagesDropped: 1,
      headCommissionsDropped: 1,
      teamsSkipped: 4_812,
    });
  });
});

describe('parseSliderImages', () => {
  it('reads both dump shapes and drops the blanks', () => {
    expect(parseSliderImages('a.jpg, b.jpg')).toEqual(['a.jpg', 'b.jpg']);
    expect(parseSliderImages('["a.jpg","b.jpg"]')).toEqual(['a.jpg', 'b.jpg']);
    expect(parseSliderImages('')).toEqual([]);
    expect(parseSliderImages('a.jpg,,')).toEqual(['a.jpg']);
    // Malformed JSON falls back to the comma reading rather than throwing.
    expect(parseSliderImages('[a.jpg')).toEqual(['[a.jpg']);
  });
});
