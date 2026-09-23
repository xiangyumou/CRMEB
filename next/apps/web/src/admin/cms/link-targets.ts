import { cmsArticleList } from '@shop/contracts/cms/cms.admin.contract';

import { callRoute } from '../api';
import type { LinkTargetResult } from '../kit';

/**
 * The 文章 tab of the DIY link picker.
 *
 * `createDiyLinkSource` serves the 商城页面 registry itself and hands each
 * searchable tab to the domain that owns the records; this is the CMS's.
 *
 * Only published articles are offered, because a link to a draft is a link to a
 * 404 on the storefront — the one place the admin should not be able to build.
 *
 * The URLs are uni-app routes (`/pages/extension/news_details/index?id=`), not
 * admin routes: what is stored here ends up in a DIY page that the storefront
 * renders and navigates.
 */

/** `/pages/extension/news_details/index?id=101` — the storefront's article page. */
export function articleDetailPath(id: string): string {
  return `/pages/extension/news_details/index?id=${encodeURIComponent(id)}`;
}

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
      url: articleDetailPath(item.id),
      ...(item.coverImageUrl ? { thumb: item.coverImageUrl } : {}),
      ...(item.categoryTitle ? { subtitle: item.categoryTitle } : {}),
    })),
    total: page.total,
  };
}
