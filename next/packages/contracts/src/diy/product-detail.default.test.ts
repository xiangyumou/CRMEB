import { describe, expect, it } from 'vitest';

import {
  PRODUCT_DETAIL_DEFAULT_VALUE,
  PRODUCT_DETAIL_DEFAULT_VERSION,
} from './product-detail.default';
import { diyPageEntriesInOrder, parseDiyPageValue, safeParseDiyPageValue } from './schema/page';
import { diyComponentSchemas, isDiyComponentKey } from './schema/registry';
import { diyProductDetailPage, diyVersion } from './schemas';

/**
 * The built-in 商品详情 page (CR-2-h3) is served to every shop that never
 * decorated its product page, so it is held to exactly what a saved page is
 * held to — the same `parseDiyPageValue` the editor's save and the publish run.
 */
describe('PRODUCT_DETAIL_DEFAULT_VALUE', () => {
  it('passes the DIY page schema a saved page must pass', () => {
    const result = safeParseDiyPageValue(PRODUCT_DETAIL_DEFAULT_VALUE);
    expect(result.ok ? [] : result.issues).toEqual([]);
    // …and the parse hands back the same object, so nothing was coerced.
    expect(parseDiyPageValue(PRODUCT_DETAIL_DEFAULT_VALUE)).toBe(PRODUCT_DETAIL_DEFAULT_VALUE);
  });

  it('holds the five components the product page renders, in render order', () => {
    const names = diyPageEntriesInOrder(PRODUCT_DETAIL_DEFAULT_VALUE).map(
      ({ node }) => (node as { name: string }).name,
    );
    expect(names).toEqual([
      'productInfo',
      'productService',
      'reviews',
      'productDesc',
      'bottomMenu',
    ]);
  });

  it('models every component it holds, strictly by its own schema', () => {
    for (const node of Object.values(PRODUCT_DETAIL_DEFAULT_VALUE)) {
      const name = (node as { name?: unknown }).name;
      expect(isDiyComponentKey(name)).toBe(true);
      if (!isDiyComponentKey(name)) continue;
      expect(diyComponentSchemas[name].safeParse(node).success).toBe(true);
    }
  });

  it('keys every node by its own timestamp, as the editor writes a page', () => {
    for (const [key, node] of Object.entries(PRODUCT_DETAIL_DEFAULT_VALUE)) {
      const timestamp = (node as { timestamp?: unknown }).timestamp;
      // `bottomMenu` is a page-level singleton and has none; the rest do.
      if (timestamp !== undefined) expect(String(timestamp)).toBe(key);
    }
  });

  it("offers 分享 in the bottom bar, the product page's one way to the share panel (CR-7-i)", () => {
    const bottom = Object.values(PRODUCT_DETAIL_DEFAULT_VALUE).find(
      (node) => (node as { name: string }).name === 'bottomMenu',
    ) as { showContent: { type: number[]; list: Array<{ id: number; name: string }> } };
    // `productBottom.vue` renders one entry per id in `type`; 4 is 分享.
    expect(bottom.showContent.type).toEqual([3, 1, 2, 4]);
    expect(bottom.showContent.list.find((entry) => entry.id === 4)?.name).toBe('分享');
  });

  it('shows nothing that is not ported', () => {
    const names = Object.values(PRODUCT_DETAIL_DEFAULT_VALUE).map(
      (node) => (node as { name: string }).name,
    );
    expect(names).not.toContain('home_paid_vip');
    // No URL at all: a default must not point at the legacy demo host.
    expect(JSON.stringify(PRODUCT_DETAIL_DEFAULT_VALUE)).not.toMatch(/https?:/);
  });

  it('fits the wire envelope with a null id', () => {
    expect(diyVersion.safeParse(PRODUCT_DETAIL_DEFAULT_VERSION).success).toBe(true);
    const parsed = diyProductDetailPage.safeParse({
      id: null,
      name: '商品详情',
      kind: 'product_detail',
      title: '商品详情',
      content: PRODUCT_DETAIL_DEFAULT_VALUE,
      schemaVersion: 1,
      background: null,
      version: PRODUCT_DETAIL_DEFAULT_VERSION,
    });
    expect(parsed.success).toBe(true);
  });
});
