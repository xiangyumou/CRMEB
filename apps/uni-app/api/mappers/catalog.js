// catalog DTOs → the product view models `pages/goods_details`,
// `components/productWindow`, `mixins/skuSelect.js` and the list pages read.
//
// Contract: packages/contracts/src/catalog/catalog.storefront.contract.ts
//           packages/contracts/src/catalog/catalog.review.contract.ts

import {
  toId,
  toInt,
  money,
  text,
  flag,
  list,
  mapList,
  pagedList,
  pageDateTime,
  unixSeconds,
  fromPagePaging,
  idList,
  withPickedIds,
} from './_shared.js';

/** Retired everywhere: 会员价 / svip, 积分, 门店自提, 虚拟商品的线下核销. */
const RETIRED = {
  is_vip: 0,
  vip_price: 0,
  svip_price_open: false,
  store_self_mention: 0,
  is_gift: 0,
  presale_pay_status: 0,
  routine_contact_type: 0,
};

/** `productSummary` → the card shape every product list renders. */
export function toPageProductCard(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    store_name: text(dto.name),
    store_info: text(dto.subtitle),
    image: text(dto.imageUrl),
    recommend_image: text(dto.cardImageUrl),
    price: money(dto.price),
    ot_price: money(dto.originalPrice, ''),
    stock: toInt(dto.stock, 0),
    sales: toInt(dto.salesDisplay, 0),
    unit_name: text(dto.unitName, '件'),
    is_virtual: dto.kind && dto.kind !== 'physical' ? 1 : 0,
    virtual_type: virtualType(dto.kind),
    product_type: virtualType(dto.kind),
    activity: [],
    label: mapList(dto.labels, toPageLabel),
    is_gift_bag: 0,
    // `cart_button` (1 = 加入购物车 shown): `productBottom.vue`, the
    // category pages and `skuSelect` all branch on this name.
    cart_button: dto.canAddToCart === false ? 0 : 1,
    ...RETIRED,
  };
}

function virtualType(kind) {
  // page `virtual_type`: 0 实物, 1 卡密, 2 优惠券, 3 手动发货
  if (kind === 'virtual_card') return 1;
  if (kind === 'virtual_coupon') return 2;
  if (kind === 'virtual_manual') return 3;
  return 0;
}

export function toPageLabel(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    label_name: text(dto.name),
    type: text(dto.style, 'text'),
    color: text(dto.fontColor),
    bg_color: text(dto.backgroundColor),
    border_color: text(dto.borderColor),
    pic: text(dto.imageUrl),
  };
}

/** `GET /api/v1/catalog/products` → the bare array list pages page through. */
export function toPageProductList(dto) {
  return mapList(dto && dto.items, toPageProductCard);
}

/** The same payload, but with the count some pages need. */
export function toPageProductPage(dto) {
  return pagedList(dto, toPageProductCard);
}

/**
 * `productSpec[]` → `productAttr[]`.
 * `{name, values:[{value, imageUrl}]}` → `{attr_name, attr_values:[string], attr_value:[{attr, pic}]}`
 */
export function toPageProductAttr(specs) {
  return mapList(specs, (spec) => ({
    attr_name: text(spec.name),
    attr_values: mapList(spec.values, (v) => text(v.value)),
    attr_value: mapList(spec.values, (v) => ({ attr: text(v.value), pic: text(v.imageUrl) })),
  }));
}

/**
 * `sku[]` → `productValue`, the dictionary `mixins/skuSelect.js` keys by
 * `attr_values.join(',')`. `unique` carries the **sku id**, which is what
 * `POST /api/v1/cart/items` wants back as `skuId`.
 */
export function toPageProductValue(skus, fallbackName) {
  const out = {};
  for (const sku of list(skus)) {
    out[text(sku.specText).split('|').join(',')] = toPageSku(sku, fallbackName);
  }
  return out;
}

export function toPageSku(sku, fallbackName) {
  if (!sku) return {};
  return {
    product_id: 0,
    suk: text(sku.specText).split('|').join(','),
    unique: text(sku.id),
    sku_code: text(sku.skuCode),
    image: text(sku.imageUrl),
    price: money(sku.price),
    ot_price: money(sku.originalPrice, ''),
    stock: toInt(sku.stock, 0),
    // 拼团 / 预售 pages gate their buy button on `product_stock` (the
    // product's own stock behind the activity quota).
    product_stock: toInt(sku.stock, 0),
    quota: toInt(sku.stock, 0),
    quota_show: toInt(sku.stock, 0),
    weight: text(sku.weight, '0'),
    volume: text(sku.volume, '0'),
    store_name: text(fallbackName),
    vip_price: 0,
  };
}

/** `GET /api/v1/catalog/products/:id` → the 商品详情 payload. */
export function toPageProductDetail(dto) {
  if (!dto) return {};
  const skus = list(dto.skus);
  const first = skus[0];
  return {
    storeInfo: {
      ...toPageProductCard(dto),
      slider_image: mapList(dto.sliderImages, (u) => text(u)),
      video_link: text(dto.videoUrl),
      description: text(dto.descriptionHtml),
      spec_type: dto.specMode ? 1 : 0,
      min_qty: toInt(dto.minPurchaseQuantity, 1),
      // the page's `limit_num` is "0 = unlimited"
      limit_num: dto.purchaseLimitMode === 'none' ? 0 : toInt(dto.purchaseLimitQuantity, 0),
      limit_type: text(dto.purchaseLimitMode, 'none'),
      freight_type: text(dto.freightMode, 'template'),
      postage: money(dto.fixedFreight, '0.00'),
      browse: toInt(dto.views, 0),
      unique: first ? text(first.id) : '',
      default_sku: first ? text(first.specText).split('|').join(',') : '',
      params_list: mapList(dto.params, (p) => ({ name: text(p.name), value: text(p.value) })),
      protection_list: mapList(dto.protections, (p) => ({
        id: toId(p.id),
        title: text(p.title),
        content: text(p.content),
        pic: text(p.iconUrl),
      })),
      custom_form: dto.customForm || null,
      userCollect: !!dto.favorited,
      command_word: '',
      wechat_code: '',
      code_base: '',
    },
    productAttr: toPageProductAttr(dto.specs),
    productValue: toPageProductValue(dto.skus, dto.name),
    spec_unique: first ? text(first.id) : '',
    reply: dto.reviewSummary && dto.reviewSummary.total ? [] : [],
    replyCount: toInt(dto.reviewSummary && dto.reviewSummary.total, 0),
    replyChance: toInt(dto.reviewSummary && dto.reviewSummary.goodRate, 0),
    coupons: mapList(dto.giftCouponIds, (id) => ({ id: toId(id) })),
    good_list: [],
    // `priceName` is the 分销 「最高返佣」 amount the product page's
    // red-packet badge prints (`shareRedPackets`), shown when it is not 0.
    // 分销 is retired, so it is pinned to 0: the badge never renders, and an
    // object here was printed as raw JSON on the product page.
    priceName: 0,
    activity: [],
    ...RETIRED,
  };
}

/** `GET /api/v1/catalog/products/:id/skus` → what `getAttr` answers. */
export function toPageAttr(dto, productName) {
  if (!dto) return {};
  const skus = list(dto.skus);
  return {
    productAttr: toPageProductAttr(dto.specs),
    productValue: toPageProductValue(dto.skus, productName),
    storeInfo: {
      id: toId(dto.productId),
      spec_type: dto.specMode ? 1 : 0,
      unique: skus[0] ? text(skus[0].id) : '',
      is_vip: 0,
    },
  };
}

/**
 * `realPrice(productId, unique)` reads a single sku out of the sku list.
 * The page reads 到手价 / 划线价 / 会员价; 会员价 is retired, so it mirrors 到手价.
 */
export function toPageRealPrice(dto, skuId) {
  const sku = list(dto && dto.skus).find((s) => String(s.id) === String(skuId)) || null;
  if (!sku) return { real_price: '', ot_price: '', member_price: 0 };
  return {
    real_price: money(sku.price),
    ot_price: money(sku.originalPrice, ''),
    member_price: 0,
  };
}

/** `GET /api/v1/catalog/categories` → the nested 分类 list. */
export function toPageCategoryTree(dto) {
  const node = (c) => ({
    id: toId(c.id),
    cate_name: text(c.name),
    pic: text(c.iconUrl),
    big_pic: text(c.bannerUrl),
    children: mapList(c.children, node),
  });
  return mapList(dto && dto.items, node);
}

/** The category tree's version string, used to skip a re-fetch. */
export function toPageCategoryVersion(dto) {
  return { version: text(dto && dto.version) };
}

/** `review` → the shape `components/userEvaluation` renders. */
export function toPageReply(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.id),
    oid: 0,
    uid: 0,
    unique: text(dto.skuId),
    suk: text(dto.specText).split('|').join(','),
    nickname: text(dto.authorNickname),
    avatar: text(dto.authorAvatarUrl),
    product_score: toInt(dto.productScore, 5),
    service_score: toInt(dto.serviceScore, 5),
    star: toInt(dto.productScore, 5),
    comment: text(dto.content),
    pics: mapList(dto.images, (u) => text(u)),
    merchant_reply_content: text(dto.replyContent),
    merchant_reply_time: pageDateTime(dto.replyAt),
    add_time: pageDateTime(dto.createdAt),
    add_time_y: pageDateTime(dto.createdAt),
    // 我的评价 carries the product back with it
    store_name: text(dto.productName),
    product_id: dto.productId === undefined ? 0 : toId(dto.productId),
    image: text(dto.productImageUrl),
  };
}

export function toPageReplyList(dto) {
  return mapList(dto && dto.items, toPageReply);
}

export function toPageReplyPage(dto) {
  return pagedList(dto, toPageReply);
}

/** `GET /api/v1/catalog/products/:id/review-summary` → `getReplyConfig`. */
export function toPageReplyConfig(dto) {
  if (!dto) return { sum_count: 0, good_count: 0, in_count: 0, poor_count: 0, reply_chance: 0, reply_star: 5 };
  return {
    sum_count: toInt(dto.total, 0),
    good_count: toInt(dto.goodCount, 0),
    in_count: toInt(dto.mediumCount, 0),
    poor_count: toInt(dto.badCount, 0),
    pics_count: toInt(dto.withImagesCount, 0),
    reply_chance: toInt(dto.goodRate, 0),
    reply_star: dto.averageScore === undefined || dto.averageScore === null ? 5 : dto.averageScore,
  };
}

/** `GET /api/v1/catalog/search/hot-keywords` → `getSearchKeyword`. */
export function toPageHotKeywords(dto) {
  return mapList(dto && dto.items, (k) => text(k.keyword));
}

/** `GET /api/v1/me/search-history` → `searchList`. */
export function toPageSearchHistory(dto) {
  return mapList(dto && dto.items, (k) => ({
    keyword: text(k.keyword),
    add_time: unixSeconds(k.searchedAt),
  }));
}

/** `GET /api/v1/me/favorites` → `getCollectUserList` (`{list, count}`). */
export function toPageCollectList(dto) {
  return {
    list: mapList(dto && dto.items, (row) => ({
      ...toPageProductCard(row.product),
      product_id: toId(row.product && row.product.id),
      category: 'product',
      add_time: unixSeconds(row.createdAt),
    })),
    count: toInt(dto && dto.total, 0),
  };
}

/**
 * `GET /api/v1/me/history` → `getVisitList`.
 * The page groups by day itself and reads both `list` and `time`.
 */
export function toPageVisitList(dto) {
  const items = mapList(dto && dto.items, (row) => ({
    ...toPageProductCard(row.product),
    product_id: toId(row.product && row.product.id),
    add_time: unixSeconds(row.viewedAt),
    time: dayOf(row.viewedAt),
  }));
  const days = [];
  for (const item of items) if (days.indexOf(item.time) === -1) days.push(item.time);
  return { list: items, count: toInt(dto && dto.total, 0), time: days };
}

function dayOf(instant) {
  return pageDateTime(instant).slice(0, 10);
}

/** `POST /api/v1/me/favorites` → `collectAdd`; pages only toast. */
export function toPageFavoriteResult(dto) {
  return { favorited: !!(dto && dto.favorited) };
}

/**
 * `POST /api/v1/me/favorites/batch` → `collectAll`.
 *
 * The page only ever read "it worked", so that shape is kept and the
 * per-id detail is carried alongside for anything that wants it later.
 * `favorited` is true when every id the shopper ticked is now a favourite,
 * which is the claim the 收藏成功 toast makes.
 */
export function toPageCollectAllResult(dto) {
  const items = mapList(dto && dto.items, (row) => ({
    product_id: toId(row && row.productId),
    favorited: !!(row && row.favorited),
  }));
  return {
    favorited: items.length > 0 && items.every((row) => row.favorited),
    added: toInt(dto && dto.added, 0),
    list: items,
  };
}

/**
 * A product list's filters → `GET /api/v1/catalog/products`. Two sets of names reach it:
 *
 * - the 商品列表 / 搜索 pages: `keyword`, `cid` / `sid`, `labelId`, `priceMin` / `priceMax`,
 *   `news`, `salesOrder` / `priceOrder`;
 * - the DIY 商品列表 (which also draws 优品推荐 and 商品选项卡): `ids` for 指定商品,
 *   `cate_id` for 指定分类 and `store_label_id` for 商品标签, each joined with `,`.
 */
export function fromPageProductQuery(data) {
  const src = data || {};
  const query = fromPagePaging(src);
  withPickedIds(query, src.ids);
  if (src.keyword) query.keyword = String(src.keyword);
  if (src.cid) query.categoryId = String(src.cid);
  if (src.sid) query.categoryId = String(src.sid);
  const categories = idList(src.cate_id !== undefined ? src.cate_id : src.cate_ids);
  if (categories.length) query.categoryIds = categories.join(',');
  if (src.labelId) query.labelId = String(src.labelId);
  const labels = idList(src.store_label_id);
  if (labels.length) query.labelIds = labels.join(',');
  if (src.priceMin) query.priceFrom = String(src.priceMin);
  if (src.priceMax) query.priceTo = String(src.priceMax);
  if (src.news) query.feature = 'new';
  if (src.salesOrder) {
    query.sortBy = 'sales';
    query.sortOrder = src.salesOrder === 'asc' ? 'asc' : 'desc';
  }
  if (src.priceOrder) {
    query.sortBy = 'price';
    query.sortOrder = src.priceOrder === 'asc' ? 'asc' : 'desc';
  }
  return query;
}

/** The pages pass ids joined with `,` (or an array). */
export function fromPageIdList(ids) {
  if (Array.isArray(ids)) return ids.map((v) => String(v));
  if (ids === undefined || ids === null || ids === '') return [];
  return String(ids)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** `orderComment(data)` body → `POST /api/v1/catalog/reviews`. */
export function fromPageCommentInput(data) {
  const src = data || {};
  return {
    orderItemId: String(src.unique || src.orderItemId || ''),
    productScore: toInt(src.product_score, 5),
    serviceScore: toInt(src.service_score, 5),
    content: text(src.comment),
    images: fromPageIdList(src.pics),
  };
}

export const __retired = RETIRED;
export { flag };
