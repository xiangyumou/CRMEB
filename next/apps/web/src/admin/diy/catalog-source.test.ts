import { afterEach, describe, expect, it } from 'vitest';

import { configureApi, resetApiConfig } from '../api';
import {
  catalogLinkTargets,
  createCatalogDiyDataSource,
  productCategoryPath,
  productDetailPath,
} from './catalog-source';
import { createStubDiyDataSource } from './data-source';

/**
 * The real data source, over the catalog contracts.
 *
 * The pickers are the only place a DIY node can gain a product, a category or a
 * 商品标签 id, so what this layer sends and what it maps back is as load-bearing
 * as the panels themselves. Tested through a stubbed `fetch` rather than a
 * mocked `callRoute`, so the query string the admin API actually builds is
 * part of the assertion.
 */

type Handler = (url: string) => unknown;

function stubFetch(handler: Handler): { urls: string[] } {
  const urls: string[] = [];
  configureApi({
    async fetch(input) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      urls.push(url);
      return new Response(JSON.stringify(handler(url)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  return { urls };
}

afterEach(() => resetApiConfig());

const product = {
  id: '7',
  name: '牛仔外套',
  imageUrl: '/uploads/7.png',
  price: '199.00',
};

const label = {
  id: '3',
  name: '包邮',
  style: 'text',
  fontColor: '#FFFFFF',
  backgroundColor: '#E93323',
  borderColor: null,
  imageUrl: null,
  categoryId: '1',
  categoryName: '促销',
  isVisible: true,
  isEnabled: true,
  sortOrder: 0,
  productCount: 12,
  createdAt: '2026-01-01T10:00:00+08:00',
};

const tree = {
  items: [
    {
      id: '7',
      name: '服饰',
      children: [{ id: '17', name: 'T恤', children: [] }],
    },
  ],
};

describe('createCatalogDiyDataSource', () => {
  it('pages 商品 through the admin list, on-shelf only, and formats the price', async () => {
    const { urls } = stubFetch(() => ({ items: [product], total: 42, page: 2, pageSize: 10 }));
    const source = createCatalogDiyDataSource();

    const result = await source.list('product', { keyword: '外套', page: 2, pageSize: 10 });

    expect(urls[0]).toContain('/admin-api/catalog/products');
    // 已上架 only: a DIY page must not advertise a product nobody can open.
    expect(urls[0]).toContain('tab=on_shelf');
    expect(urls[0]).toContain('page=2');
    expect(urls[0]).toContain(`keyword=${encodeURIComponent('外套')}`);
    expect(result).toEqual({
      items: [{ id: '7', name: '牛仔外套', image: '/uploads/7.png', subtitle: '¥199.00' }],
      total: 42,
    });
  });

  it('pages 商品标签 through the label list, enabled only', async () => {
    const { urls } = stubFetch(() => ({ items: [label], total: 1, page: 1, pageSize: 10 }));
    const source = createCatalogDiyDataSource();

    const result = await source.list('labels', { page: 1, pageSize: 10 });

    expect(urls[0]).toContain('/admin-api/catalog/labels');
    expect(urls[0]).toContain('isEnabled=true');
    // A label with no image contributes no `image` key rather than an empty one.
    expect(result.items).toEqual([{ id: '3', name: '包邮', subtitle: '促销' }]);
  });

  it('resolves stored product ids one detail call each, and survives a deleted one', async () => {
    const { urls } = stubFetch((url) => {
      if (url.includes('/products/9')) throw new Error('gone');
      return { ...product, description: '', unitName: '件' };
    });
    const source = createCatalogDiyDataSource();

    const rows = await source.resolve('product', ['7', '9']);

    expect(urls).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: '7', name: '牛仔外套', subtitle: '¥199.00' });
    // The picker keeps rendering; the missing row shows its bare id.
    expect(rows[1]).toEqual({ id: '9', name: '#9' });
  });

  it('flattens the category tree into the picker tree, keeping the nesting', async () => {
    stubFetch(() => tree);
    const nodes = await createCatalogDiyDataSource().categories('product');
    expect(nodes).toEqual([{ id: '7', name: '服饰', children: [{ id: '17', name: 'T恤' }] }]);
  });

  it('delegates the kinds the catalog does not own to the fallback', async () => {
    // No fetch is configured: reaching the network here would throw.
    const source = createCatalogDiyDataSource(createStubDiyDataSource());
    const articles = await source.list('article', { page: 1, pageSize: 5 });
    expect(articles.items).toHaveLength(5);
    expect(await source.resolve('coupon', ['1'])).toHaveLength(1);
    expect(await source.categories('article')).toHaveLength(1);
  });
});

describe('catalogLinkTargets', () => {
  it('turns products into the storefront paths the uni renderer navigates to', async () => {
    stubFetch(() => ({ items: [product], total: 1, page: 1, pageSize: 20 }));
    const result = await catalogLinkTargets('product', { page: 1, pageSize: 20 });
    expect(result.items[0]).toEqual({
      id: '7',
      name: '牛仔外套',
      url: '/pages/goods_details/index?id=7',
      thumb: '/uploads/7.png',
      subtitle: '¥199.00',
    });
  });

  it('flattens categories, shows the trail and searches it', async () => {
    stubFetch(() => tree);
    const all = await catalogLinkTargets('category', { page: 1, pageSize: 20 });
    expect(all.total).toBe(2);
    expect(all.items.map((row) => row.subtitle)).toEqual(['服饰', '服饰 / T恤']);
    expect(all.items[1]?.url).toBe('/pages/goods_list/index?cid=17');

    stubFetch(() => tree);
    const matched = await catalogLinkTargets('category', {
      keyword: 'T恤',
      page: 1,
      pageSize: 20,
    });
    expect(matched.total).toBe(1);
    expect(matched.items[0]?.id).toBe('17');
  });

  it('answers empty for a target type no stream has shipped yet', async () => {
    expect(await catalogLinkTargets('article', { page: 1, pageSize: 20 })).toEqual({
      items: [],
      total: 0,
    });
  });
});

describe('the storefront paths', () => {
  it('encodes the id rather than interpolating it raw', () => {
    expect(productDetailPath('a b')).toBe('/pages/goods_details/index?id=a%20b');
    expect(productCategoryPath('7')).toBe('/pages/goods_list/index?cid=7');
  });
});
