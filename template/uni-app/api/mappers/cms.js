// 文章 DTOs → the legacy 资讯 payload `pages/extension/news_*` and
// `subpackage/diyComponents/articleList.vue` render.
//
// Contract: next/packages/contracts/src/cms/cms.storefront.contract.ts
//
// Two legacy habits the new shape does not have, and the mapper reinstates:
//
//  * **`image_input` is an array.** The list template branches on
//    `item.image_input.length` (1 / 2 / >2 thumbnails) and the detail page reads
//    `image_input[0]` for the share card, so a single `coverImageUrl` becomes a
//    one-element array and a missing cover becomes `[]` — never `[null]`.
//  * **`add_time` is a formatted string.** `articleList.vue` runs it through
//    `dayjs(...)`, so it must stay parseable; `legacyDateTime` keeps the offset the
//    payload carried instead of re-rendering it in the phone's timezone.
//
// `likes` has no successor — the legacy column was never written by anything — so it
// is pinned to 0 and the 点赞 count renders as zero rather than `undefined`.

import { toId, toInt, money, legacyDateTime, mapList, text } from './_shared.js';

/** `coverImageUrl` → the `image_input` array the templates iterate. */
function images(url) {
  return url ? [String(url)] : [];
}

/** `articleListItem` → one 资讯 row. */
export function toLegacyArticle(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    cid: dto.categoryId === null || dto.categoryId === undefined ? 0 : toId(dto.categoryId),
    catename: text(dto.categoryTitle),
    title: text(dto.title),
    synopsis: text(dto.summary),
    author: text(dto.author),
    image_input: images(dto.coverImageUrl),
    url: text(dto.sourceUrl),
    visit: toInt(dto.views, 0),
    likes: 0,
    is_hot: dto.isHot ? 1 : 0,
    is_banner: dto.isBanner ? 1 : 0,
    sort: toInt(dto.sortOrder, 0),
    add_time: legacyDateTime(dto.publishedAt),
  };
}

/** `pagedArticles` → the bare array the pages `concat` onto their list. */
export function toLegacyArticleList(dto) {
  return mapList(dto && dto.items, toLegacyArticle);
}

/** The product an article promotes → the 关联商品 card's `store_info`. */
export function toLegacyArticleProduct(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    store_name: text(dto.name),
    image: text(dto.imageUrl),
    price: money(dto.price),
    ot_price: money(dto.originalPrice, ''),
  };
}

/** `articleDetail` → what `news_details` binds, `store_info` included. */
export function toLegacyArticleDetail(dto) {
  if (!dto) return {};
  return Object.assign(toLegacyArticle(dto), {
    content: text(dto.contentHtml),
    store_info: toLegacyArticleProduct(dto.product),
  });
}

/** One node of `publicArticleCategoryList`. */
function toLegacyArticleCategory(dto) {
  return {
    id: toId(dto && dto.id),
    title: text(dto && dto.title),
    image: text(dto && dto.imageUrl),
  };
}

/**
 * `publicArticleCategoryList` → the two-level 导航 the 资讯 page scrolls.
 * `children` is always an array: the template reads `item.children.length` before
 * it reads anything else.
 */
export function toLegacyArticleCategories(dto) {
  return mapList(dto && dto.items, (node) =>
    Object.assign(toLegacyArticleCategory(node), {
      children: mapList(node && node.children, toLegacyArticleCategory),
    }),
  );
}
