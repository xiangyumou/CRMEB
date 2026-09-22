// catalog DTOs → the legacy product view models `pages/goods_details`,
// `components/productWindow`, `mixins/skuSelect.js` and the list pages read.
//
// Contract: next/packages/contracts/src/catalog/catalog.storefront.contract.ts
//           next/packages/contracts/src/catalog/catalog.review.contract.ts

import {
  toId,
  toInt,
  money,
  text,
  flag,
  list,
  mapList,
  pagedList,
  legacyDateTime,
  unixSeconds,
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
export function toLegacyProductCard(dto) {
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
    label: mapList(dto.labels, toLegacyLabel),
    is_gift_bag: 0,
    can_add_cart: dto.canAddToCart !== false,
    ...RETIRED,
  };
}

function virtualType(kind) {
  // legacy: 0 实物, 1 卡密, 2 优惠券, 3 手动发货
  if (kind === 'virtual_card') return 1;
  if (kind === 'virtual_coupon') return 2;
  if (kind === 'virtual_manual') return 3;
  return 0;
}

export function toLegacyLabel(dto) {
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
export function toLegacyProductList(dto) {
  return mapList(dto && dto.items, toLegacyProductCard);
}

/** The same payload, but with the count some pages need. */
export function toLegacyProductPage(dto) {
  return pagedList(dto, toLegacyProductCard);
}

/**
 * `productSpec[]` → `productAttr[]`.
 * `{name, values:[{value, imageUrl}]}` → `{attr_name, attr_values:[string], attr_value:[{attr, pic}]}`
 */
export function toLegacyProductAttr(specs) {
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
export function toLegacyProductValue(skus, fallbackName) {
  const out = {};
  for (const sku of list(skus)) {
    out[text(sku.specText).split('|').join(',')] = toLegacySku(sku, fallbackName);
  }
  return out;
}

export function toLegacySku(sku, fallbackName) {
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
    quota: toInt(sku.stock, 0),
    quota_show: toInt(sku.stock, 0),
    weight: text(sku.weight, '0'),
    volume: text(sku.volume, '0'),
    store_name: text(fallbackName),
    vip_price: 0,
  };
}

/** `GET /api/v1/catalog/products/:id` → the 商品详情 payload. */
export function toLegacyProductDetail(dto) {
  if (!dto) return {};
  const skus = list(dto.skus);
  const first = skus[0];
  return {
    storeInfo: {
      ...toLegacyProductCard(dto),
      slider_image: mapList(dto.sliderImages, (u) => text(u)),
      video_link: text(dto.videoUrl),
      description: text(dto.descriptionHtml),
      spec_type: dto.specMode ? 1 : 0,
      min_qty: toInt(dto.minPurchaseQuantity, 1),
      // legacy `limit_num` is "0 = unlimited"
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
    productAttr: toLegacyProductAttr(dto.specs),
    productValue: toLegacyProductValue(dto.skus, dto.name),
    spec_unique: first ? text(first.id) : '',
    reply: dto.reviewSummary && dto.reviewSummary.total ? [] : [],
    replyCount: toInt(dto.reviewSummary && dto.reviewSummary.total, 0),
    replyChance: toInt(dto.reviewSummary && dto.reviewSummary.goodRate, 0),
    coupons: mapList(dto.giftCouponIds, (id) => ({ id: toId(id) })),
    good_list: [],
    priceName: {
      // 到手价 breakdown; only the plain price survives the rewrite.
      price: money(dto.price),
      ot_price: money(dto.originalPrice, ''),
      vip_price: 0,
      member_price: 0,
    },
    activity: [],
    ...RETIRED,
  };
}

/** `GET /api/v1/catalog/products/:id/skus` → what `getAttr` used to answer. */
export function toLegacyAttr(dto, productName) {
  if (!dto) return {};
  const skus = list(dto.skus);
  return {
    productAttr: toLegacyProductAttr(dto.specs),
    productValue: toLegacyProductValue(dto.skus, productName),
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
 * The legacy route answered 到手价 / 划线价 / 会员价; 会员价 is retired, so it mirrors 到手价.
 */
export function toLegacyRealPrice(dto, skuId) {
  const sku = list(dto && dto.skus).find((s) => String(s.id) === String(skuId)) || null;
  if (!sku) return { real_price: '', ot_price: '', member_price: 0 };
  return {
    real_price: money(sku.price),
    ot_price: money(sku.originalPrice, ''),
    member_price: 0,
  };
}

/** `GET /api/v1/catalog/categories` → the nested 分类 list. */
export function toLegacyCategoryTree(dto) {
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
export function toLegacyCategoryVersion(dto) {
  return { version: text(dto && dto.version) };
}

/** `review` → the shape `components/userEvaluation` renders. */
export function toLegacyReply(dto) {
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
    merchant_reply_time: legacyDateTime(dto.replyAt),
    add_time: legacyDateTime(dto.createdAt),
    add_time_y: legacyDateTime(dto.createdAt),
    // 我的评价 carries the product back with it
    store_name: text(dto.productName),
    product_id: dto.productId === undefined ? 0 : toId(dto.productId),
    image: text(dto.productImageUrl),
  };
}

export function toLegacyReplyList(dto) {
  return mapList(dto && dto.items, toLegacyReply);
}

export function toLegacyReplyPage(dto) {
  return pagedList(dto, toLegacyReply);
}

/** `GET /api/v1/catalog/products/:id/review-summary` → `getReplyConfig`. */
export function toLegacyReplyConfig(dto) {
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
export function toLegacyHotKeywords(dto) {
  return mapList(dto && dto.items, (k) => text(k.keyword));
}

/** `GET /api/v1/me/search-history` → `searchList`. */
export function toLegacySearchHistory(dto) {
  return mapList(dto && dto.items, (k) => ({
    keyword: text(k.keyword),
    add_time: unixSeconds(k.searchedAt),
  }));
}

/** `GET /api/v1/me/favorites` → `getCollectUserList` (`{list, count}`). */
export function toLegacyCollectList(dto) {
  return {
    list: mapList(dto && dto.items, (row) => ({
      ...toLegacyProductCard(row.product),
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
export function toLegacyVisitList(dto) {
  const items = mapList(dto && dto.items, (row) => ({
    ...toLegacyProductCard(row.product),
    product_id: toId(row.product && row.product.id),
    add_time: unixSeconds(row.viewedAt),
    time: dayOf(row.viewedAt),
  }));
  const days = [];
  for (const item of items) if (days.indexOf(item.time) === -1) days.push(item.time);
  return { list: items, count: toInt(dto && dto.total, 0), time: days };
}

function dayOf(instant) {
  return legacyDateTime(instant).slice(0, 10);
}

/** `POST /api/v1/me/favorites` → `collectAdd`; pages only toast. */
export function toLegacyFavoriteResult(dto) {
  return { favorited: !!(dto && dto.favorited) };
}

/**
 * `POST /api/v1/me/favorites/batch` → `collectAll` (CR-2-h §3).
 *
 * The page only ever read "it worked", so the legacy shape is preserved and the
 * per-id detail is carried alongside for anything that wants it later.
 * `favorited` is true when every id the shopper ticked is now a favourite,
 * which is the claim the 收藏成功 toast makes.
 */
export function toLegacyCollectAllResult(dto) {
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

/** Legacy `collect/del` and `collect/all` take ids joined with `,`. */
export function fromLegacyIdList(ids) {
  if (Array.isArray(ids)) return ids.map((v) => String(v));
  if (ids === undefined || ids === null || ids === '') return [];
  return String(ids)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** `orderComment(data)` body → `POST /api/v1/catalog/reviews`. */
export function fromLegacyCommentInput(data) {
  const src = data || {};
  return {
    orderItemId: String(src.unique || src.orderItemId || ''),
    productScore: toInt(src.product_score, 5),
    serviceScore: toInt(src.service_score, 5),
    content: text(src.comment),
    images: fromLegacyIdList(src.pics),
  };
}

export const __retired = RETIRED;
export { flag };
