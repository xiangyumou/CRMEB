import { afterEach, describe, expect, it } from 'vitest';

import { catalogAdminCategoryTree } from '@shop/contracts/catalog/catalog.category.admin.contract';
import { catalogAdminProductList } from '@shop/contracts/catalog/catalog.product.admin.contract';
import {
  adminProductListItemExample,
  type AdminProductListItem,
  productCategoryChildExample,
  productCategoryExample,
  type ProductCategoryNode,
} from '@shop/contracts/catalog/schemas';

import { on, stubRoutes } from '@/test/api';

import { resetApiConfig } from '../api';
import { catalogLinkTargets, productCategoryPath, productDetailPath } from './catalog-source';

/**
 * The legacy editor's catalog links. The picker kinds moved to
 * `admin/decor/catalog-records.test.ts`.
 *
 * The pickers are the only place a DIY node can gain a product, a category or a
 * 商品标签 id, so what this layer sends and what it maps back is as load-bearing
 * as the panels themselves. Tested through a stubbed `fetch` rather than a
 * mocked `callRoute`, so the query string the admin API actually builds is
 * part of the assertion.
 */

afterEach(() => resetApiConfig());

const product: AdminProductListItem = {
  ...adminProductListItemExample,
  id: '7',
  name: '牛仔外套',
  imageUrl: '/uploads/7.png',
  price: '199.00',
};

const tree: { items: ProductCategoryNode[] } = {
  items: [
    {
      ...productCategoryExample,
      id: '7',
      name: '服饰',
      children: [
        { ...productCategoryChildExample, id: '17', parentId: '7', name: 'T恤', children: [] },
      ],
    },
  ],
};

describe('catalogLinkTargets', () => {
  it('turns products into the storefront paths the uni renderer navigates to', async () => {
    stubRoutes([
      on(catalogAdminProductList, { items: [product], total: 1, page: 1, pageSize: 20 }),
    ]);
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
    stubRoutes([on(catalogAdminCategoryTree, tree)]);
    const all = await catalogLinkTargets('category', { page: 1, pageSize: 20 });
    expect(all.total).toBe(2);
    expect(all.items.map((row) => row.subtitle)).toEqual(['服饰', '服饰 / T恤']);
    expect(all.items[1]?.url).toBe('/pages/goods/goods_list/index?cid=17');

    stubRoutes([on(catalogAdminCategoryTree, tree)]);
    const matched = await catalogLinkTargets('category', {
      keyword: 'T恤',
      page: 1,
      pageSize: 20,
    });
    expect(matched.total).toBe(1);
    expect(matched.items[0]?.id).toBe('17');
  });
});

describe('the storefront paths', () => {
  it('encodes the id rather than interpolating it raw', () => {
    expect(productDetailPath('a b')).toBe('/pages/goods_details/index?id=a%20b');
    expect(productCategoryPath('7')).toBe('/pages/goods/goods_list/index?cid=7');
  });
});
