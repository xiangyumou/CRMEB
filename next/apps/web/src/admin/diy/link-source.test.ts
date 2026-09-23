import { afterEach, describe, expect, it } from 'vitest';

import { catalogAdminCategoryTree } from '@shop/contracts/catalog/catalog.category.admin.contract';
import { catalogAdminProductList } from '@shop/contracts/catalog/catalog.product.admin.contract';
import { adminProductListItemExample } from '@shop/contracts/catalog/schemas';
import { cmsArticleList } from '@shop/contracts/cms/cms.admin.contract';
import { adminArticleExample } from '@shop/contracts/cms/schemas';

import { on, stubRoutes } from '@/test/api';

import { resetApiConfig } from '../api';
import { articleDetailPath } from '../cms/link-targets';
import { createDiyLinkSource, diyLinkTargets } from './link-source';

/**
 * The searchable tabs of the DIY link picker. Each hands off to the domain that
 * owns the records, and each URL is a route the storefront actually has.
 */

afterEach(() => resetApiConfig());

describe('diyLinkTargets', () => {
  it('lists published articles as storefront article links', async () => {
    const calls = stubRoutes([
      on(cmsArticleList, { items: [adminArticleExample], total: 1, page: 1, pageSize: 20 }),
    ]);

    const result = await createDiyLinkSource().listTargets('article', {
      keyword: '双十一',
      page: 1,
      pageSize: 20,
    });

    expect(calls[0]?.path).toBe('/admin-api/cms/articles');
    expect(calls[0]?.query.get('status')).toBe('published');
    expect(calls[0]?.query.get('keyword')).toBe('双十一');
    expect(result).toEqual({
      items: [
        {
          id: '101',
          name: '双十一活动说明',
          url: '/pages/extension/news_details/index?id=101',
          thumb: '/uploads/2026/10/cover.png',
          subtitle: '新闻资讯',
        },
      ],
      total: 1,
    });
  });

  it('hands products and categories to the catalog', async () => {
    const calls = stubRoutes([
      on(catalogAdminProductList, {
        items: [adminProductListItemExample],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
      on(catalogAdminCategoryTree, { items: [] }),
    ]);

    const products = await diyLinkTargets('product', { page: 1, pageSize: 20 });
    await diyLinkTargets('category', { page: 1, pageSize: 20 });

    expect(calls.map((call) => call.routeId)).toEqual([
      catalogAdminProductList.id,
      catalogAdminCategoryTree.id,
    ]);
    expect(products.items[0]?.url).toBe(
      `/pages/goods_details/index?id=${adminProductListItemExample.id}`,
    );
  });

  it('encodes the article id rather than interpolating it raw', () => {
    expect(articleDetailPath('a b')).toBe('/pages/extension/news_details/index?id=a%20b');
  });
});
