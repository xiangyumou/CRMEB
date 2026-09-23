import { cmsArticleList, cmsCategoryList } from '@shop/contracts/cms/cms.admin.contract';

import { callRoute } from '../api';
import type { LinkTargetResult, LinkTargetType } from '../kit';

/**
 * The CMS half of the DIY link picker.
 *
 * `createDiyLinkSource({ targets })` serves the 商城页面 registry
 * itself and delegates the searchable halves — a product, a category, an
 * article — to whoever owns the records. This is that callback for `article`,
 * and it composes: a caller that also has the catalog's version chains them and
 * falls through on the types it does not answer.
 *
 * ```ts
 * const source = createDiyLinkSource({
 *   targets: (type, query) =>
 *     type === 'article' ? articleLinkTargets(query) : catalogLinkTargets(type, query),
 * });
 * ```
 *
 * Only published articles are offered, because a link to a draft is a link to a
 * 404 on the storefront — the one place the admin should not be able to build.
 *
 * The URLs are the uni-app paths stored pages carry
 * (`/pages/news_details/index?id=`), not admin routes: what is stored here ends
 * up in a DIY page that the mini-program renders.
 */

export const ARTICLE_LINK_PREFIX = '/pages/news_details/index?id=';
export const ARTICLE_CATEGORY_LINK_PREFIX = '/pages/news_list/index?cid=';

export async function articleLinkTargets(query: {
  keyword?: string | undefined;
  page: number;
  pageSize: number;
}): Promise<LinkTargetResult> {
  const page = await callRoute(cmsArticleList, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      status: 'published',
      ...(query.keyword ? { keyword: query.keyword } : {}),
    },
  });
  return {
    items: page.items.map((item) => ({
      id: item.id,
      name: item.title,
      url: `${ARTICLE_LINK_PREFIX}${item.id}`,
      ...(item.coverImageUrl ? { thumb: item.coverImageUrl } : {}),
      ...(item.categoryTitle ? { subtitle: item.categoryTitle } : {}),
    })),
    total: page.total,
  };
}

/**
 * 文章分类 as link targets.
 *
 * The picker's `category` tab is the product taxonomy's in every other stream,
 * so this one is exported separately rather than claiming that type: a caller
 * that wants article categories asks for them by name.
 */
export async function articleCategoryLinkTargets(query: {
  keyword?: string | undefined;
}): Promise<LinkTargetResult> {
  const list = await callRoute(cmsCategoryList, {
    query: { status: 'visible', ...(query.keyword ? { keyword: query.keyword } : {}) },
  });
  return {
    items: list.items.map((item) => ({
      id: item.id,
      name: item.title,
      url: `${ARTICLE_CATEGORY_LINK_PREFIX}${item.id}`,
      ...(item.imageUrl ? { thumb: item.imageUrl } : {}),
      subtitle: `${item.articleCount} 篇`,
    })),
    total: list.items.length,
  };
}

/**
 * Ready-made `targets` callback: answers `article`, and hands anything else to
 * `next` (the catalog's, when it exists) or returns nothing.
 */
export function cmsLinkTargets(
  next?: (
    type: Exclude<LinkTargetType, 'page' | 'custom'>,
    query: { keyword?: string | undefined; page: number; pageSize: number },
  ) => Promise<LinkTargetResult>,
) {
  return async (
    type: Exclude<LinkTargetType, 'page' | 'custom'>,
    query: { keyword?: string | undefined; page: number; pageSize: number },
  ): Promise<LinkTargetResult> => {
    if (type === 'article') return articleLinkTargets(query);
    if (next) return next(type, query);
    return { items: [], total: 0 };
  };
}
