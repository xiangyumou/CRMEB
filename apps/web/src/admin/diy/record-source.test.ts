import { afterEach, describe, expect, it } from 'vitest';

import { catalogAdminCategoryTree } from '@shop/contracts/catalog/catalog.category.admin.contract';
import { catalogAdminProductList } from '@shop/contracts/catalog/catalog.product.admin.contract';
import { catalogAdminLabelList } from '@shop/contracts/catalog/catalog.taxonomy.admin.contract';
import { cmsArticleList, cmsCategoryList } from '@shop/contracts/cms/cms.admin.contract';
import { couponAdminList } from '@shop/contracts/coupon/coupon.admin.contract';
import { groupbuyAdminActivityList } from '@shop/contracts/groupbuy/groupbuy.admin.contract';

import { on, stubRoutes } from '@/test/api';

import { resetApiConfig } from '../api';
import type { DiyPickerKind } from './data-source';
import { createDiyDataSource } from './record-source';

/**
 * The legacy editor's names for the decor editor's record kinds. What each kind
 * sends and maps back is tested where it lives, in
 * `admin/decor/record-kinds.test.ts` and `admin/decor/catalog-records.test.ts`.
 */

afterEach(() => resetApiConfig());

const source = () => createDiyDataSource({ now: () => new Date('2026-06-15T12:00:00+08:00') });

describe('createDiyDataSource', () => {
  it.each([
    ['product', catalogAdminProductList.id],
    ['labels', catalogAdminLabelList.id],
    ['article', cmsArticleList.id],
    ['coupon', couponAdminList.id],
    ['combination', groupbuyAdminActivityList.id],
  ] satisfies [DiyPickerKind, string][])(
    'answers %s from its owning route, never from an in-memory list',
    async (kind, routeId) => {
      const empty = { items: [], total: 0, page: 1, pageSize: 10 };
      const calls = stubRoutes([
        on(catalogAdminProductList, empty),
        on(catalogAdminLabelList, empty),
        on(cmsArticleList, empty),
        on(couponAdminList, empty),
        on(groupbuyAdminActivityList, empty),
      ]);
      expect(await source().list(kind, { page: 1, pageSize: 10 })).toEqual({
        items: [],
        total: 0,
      });
      expect(calls.map((call) => call.routeId)).toEqual([routeId]);
    },
  );

  it('answers both category trees from their owning routes', async () => {
    const calls = stubRoutes([
      on(catalogAdminCategoryTree, { items: [] }),
      on(cmsCategoryList, { items: [] }),
    ]);
    await source().categories('product');
    await source().categories('article');
    expect(calls.map((call) => call.routeId)).toEqual([
      catalogAdminCategoryTree.id,
      cmsCategoryList.id,
    ]);
  });
});
