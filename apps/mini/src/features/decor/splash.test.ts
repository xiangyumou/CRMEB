import { describe, expect, it } from 'vitest';
import { shopDay, splashAction, splashDue } from './splash';

const ad = { enabled: true, imageUrl: '/uploads/splash.png', link: null, seconds: 3 };

describe('开屏浮层 rules', () => {
  it('counts days in China, whatever the phone’s zone', () => {
    expect(shopDay(Date.parse('2026-09-23T16:30:00Z'))).toBe('2026-09-24');
    expect(shopDay(Date.parse('2026-09-23T15:59:00Z'))).toBe('2026-09-23');
  });

  it('is due once a day, when switched on with a picture', () => {
    expect(splashDue(ad, null, '2026-09-24')).toBe(true);
    expect(splashDue(ad, '2026-09-23', '2026-09-24')).toBe(true);
    expect(splashDue(ad, '2026-09-24', '2026-09-24')).toBe(false);
    expect(splashDue({ ...ad, enabled: false }, null, '2026-09-24')).toBe(false);
    expect(splashDue({ ...ad, imageUrl: null }, null, '2026-09-24')).toBe(false);
    expect(splashDue(null, null, '2026-09-24')).toBe(false);
  });

  it('reads the legacy link string an operator typed', () => {
    expect(splashAction('/pages/goods_details/index?id=12')).toEqual({
      kind: 'route',
      route: { route: 'product', params: { id: '12' } },
    });
    expect(splashAction('/pages/goods/goods_list/index?cid=3')).toEqual({
      kind: 'route',
      route: { route: 'productList', params: { categoryId: '3' } },
    });
    expect(splashAction('packages/goods/featured/index?tab=new')).toEqual({
      kind: 'route',
      route: { route: 'featured', params: { tab: 'new' } },
    });
    expect(splashAction('https://mp.weixin.qq.com/s/abc')).toEqual({
      kind: 'external',
      url: 'https://mp.weixin.qq.com/s/abc',
    });
  });

  it('makes nothing of a link it cannot read', () => {
    expect(splashAction(null)).toBeNull();
    expect(splashAction('  ')).toBeNull();
    expect(splashAction('/pages/goods_details/index')).toBeNull();
    expect(splashAction('/pages/unknown/index')).toBeNull();
    expect(splashAction('http://example.com')).toBeNull();
  });
});
