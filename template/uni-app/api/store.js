// 商品 / 分类 / 评价 / 收藏 / 足迹

import request from '../utils/request.js';
import {
  toLegacyProductDetail,
  toLegacyProductList,
  toLegacyCategoryTree,
  toLegacyAttr,
  toLegacyRealPrice,
  toLegacyReplyList,
  toLegacyReplyConfig,
  toLegacyHotKeywords,
  toLegacyCollectList,
  toLegacyVisitList,
  toLegacyFavoriteResult,
  fromLegacyIdList,
} from './mappers/catalog.js';
import { toLegacyCartAddResult, fromLegacyCartAddInput } from './mappers/cart.js';
import { fromLegacyPage } from './mappers/_shared.js';

/**
 * 获取产品详情
 * @param int id
 */
export function getProductDetail(id) {
  return request.get(`/api/v1/catalog/products/${id}`, {}, {
    noAuth: true,
    map: toLegacyProductDetail,
  });
}

/**
 * 获取产品列表
 * @param object data {page, limit, keyword, cid, sid, priceOrder, news, …}
 */
export function getProductslist(data) {
  return request.get('/api/v1/catalog/products', fromLegacyProductQuery(data), {
    noAuth: true,
    map: toLegacyProductList,
  });
}

/** Legacy 商品列表筛选 → the contract's query. */
function fromLegacyProductQuery(data) {
  const src = data || {};
  const query = fromLegacyPage(src);
  if (src.keyword) query.keyword = String(src.keyword);
  if (src.cid) query.categoryId = String(src.cid);
  if (src.sid) query.categoryId = String(src.sid);
  if (src.labelId) query.labelId = String(src.labelId);
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

/**
 * 获取推荐产品
 */
export function getProductHot(page, limit) {
  return request.get(
    '/api/v1/catalog/products',
    { page: page === undefined ? 1 : page, pageSize: limit === undefined ? 4 : limit, feature: 'hot' },
    { noAuth: true, map: toLegacyProductList },
  );
}

/**
 * 获取分类列表
 */
export function getCategoryList() {
  return request.get('/api/v1/catalog/categories', {}, {
    noAuth: true,
    map: toLegacyCategoryTree,
  });
}

/**
 * 获取首页的属性（规格）
 * @param int id 商品 id
 * @param int type 旧的活动类型，新接口只有普通商品
 */
export function getAttr(id, type) {
  return request.get(`/api/v1/catalog/products/${id}/skus`, {}, {
    noAuth: true,
    map: toLegacyAttr,
  });
}

/**
 * 到手价获取
 * @param int id 商品 id
 * @param string unique 规格 id
 */
export function realPrice(id, unique) {
  return request.get(`/api/v1/catalog/products/${id}/skus`, {}, {
    noAuth: true,
    map: (dto) => toLegacyRealPrice(dto, unique),
  });
}

/**
 * 获取产品评论
 * @param int id
 * @param object data {page, limit, type}
 */
export function getReplyList(id, data) {
  const src = data || {};
  const query = fromLegacyPage(src);
  if (src.type !== undefined && src.type !== '') query.rating = legacyRating(src.type);
  return request.get(`/api/v1/catalog/products/${id}/reviews`, query, {
    noAuth: true,
    map: toLegacyReplyList,
  });
}

/** 旧的评价筛选：0 全部 1 好评 2 中评 3 差评 4 有图 */
function legacyRating(type) {
  switch (Number(type)) {
    case 1:
      return 'good';
    case 2:
      return 'medium';
    case 3:
      return 'bad';
    case 4:
      return 'with_images';
    default:
      return 'all';
  }
}

/**
 * 产品评价数量和好评度
 * @param int id
 */
export function getReplyConfig(id) {
  return request.get(`/api/v1/catalog/products/${id}/review-summary`, {}, {
    noAuth: true,
    map: toLegacyReplyConfig,
  });
}

/**
 * 获取搜索关键字
 */
export function getSearchKeyword() {
  return request.get('/api/v1/catalog/search/hot-keywords', {}, {
    noAuth: true,
    map: toLegacyHotKeywords,
  });
}

/**
 * 添加收藏
 * @param int id
 */
export function collectAdd(id) {
  return request.post('/api/v1/me/favorites', { productId: String(id) }, {
    map: toLegacyFavoriteResult,
    msg: '收藏成功',
  });
}

/**
 * 删除收藏产品
 * @param int id
 */
export function collectDel(id) {
  return request.delete(`/api/v1/me/favorites/${id}`, {}, { msg: '取消收藏成功' });
}

/**
 * 批量收藏
 * @param object id 产品编号 join(',') 切割成字符串
 */
export function collectAll(id) {
  const productIds = fromLegacyIdList(id);
  // One call per product: the batch route only *removes*. See docs/rewrite/cr/CR-2-h.md.
  return Promise.all(
    productIds.map((productId) => request.post('/api/v1/me/favorites', { productId })),
  ).then(() => ({ data: { favorited: true }, msg: '收藏成功', status: 200 }));
}

/**
 * 获取收藏列表
 * @param object data {page, limit}
 */
export function getCollectUserList(data) {
  return request.get('/api/v1/me/favorites', fromLegacyPage(data), { map: toLegacyCollectList });
}

/**
 * 获取浏览记录列表
 * @param object data {page, limit}
 */
export function getVisitList(data) {
  return request.get('/api/v1/me/history', fromLegacyPage(data), { map: toLegacyVisitList });
}

/**
 * 删除浏览记录
 * @param object data {ids}
 */
export function deleteVisitList(data) {
  const src = data || {};
  return request.post(
    '/api/v1/me/history/deletions',
    { productIds: fromLegacyIdList(src.ids !== undefined ? src.ids : src) },
    { msg: '删除成功' },
  );
}

/**
 * 首页推荐位：1 精品 2 热门 3 最新 4 促销
 * @param int type
 * @param object data
 */
const GROOM_FEATURE = { 1: 'best', 2: 'hot', 3: 'new', 4: 'benefit' };

export function getGroomList(type, data) {
  const query = fromLegacyPage(data);
  query.feature = GROOM_FEATURE[Number(type)] || 'recommended';
  return request.get('/api/v1/catalog/products', query, {
    noAuth: true,
    // The 推荐位 page reads `{banner, list}`; there is no banner in the new DTO.
    map: (dto) => ({ banner: [], list: toLegacyProductList(dto) }),
  });
}

// ---------------------------------------------------------------------------
// CONTRACT-PENDING — 待其他 stream 的合约落地
// ---------------------------------------------------------------------------

// CONTRACT-PENDING(E2) — 商品分享二维码 (公众号/小程序码) lives in the wechat domain.
/**
 * 产品分享二维码
 * @param int id
 */
export function getProductCode(id) {
  return request.get(`/api/v1/wechat/qrcodes/product/${id}`, {}, { noAuth: true });
}

// CONTRACT-PENDING(D) — 预售详情. groupbuy/presale contracts are still being written.
/**
 * 预售详情
 * @param int id
 */
export function getPresellProductDetail(id) {
  return request.get(`/api/v1/presales/${id}`, {}, { map: toLegacyProductDetail });
}

// ---------------------------------------------------------------------------
// 购物车（合约已合并）
// ---------------------------------------------------------------------------

/**
 * 购车添加
 * @param object data {productId, cartNum, uniqueId, new}
 */
export function postCartAdd(data) {
  const src = data || {};
  // `new: 1` is 立即购买. Nothing is written to the cart any more; the confirm page
  // gets a ticket it can turn into a `buy-now` checkout preview.
  if (src.new) {
    const ticket = `buynow:${src.uniqueId || ''}:${Number(src.cartNum) || 1}`;
    return Promise.resolve({ data: { cartId: ticket }, msg: '', status: 200 });
  }
  return request.post('/api/v1/cart/items', fromLegacyCartAddInput(src), {
    map: toLegacyCartAddResult,
    msg: '添加成功',
  });
}

/**
 * 购车添加、减少
 * @param object data {product_id, num, type, unique} — type 1 加, 0 减
 */
export function postCartNum(data) {
  const src = data || {};
  const quantity = Number(src.num) || 1;
  if (Number(src.type) !== 0) {
    return request.post(
      '/api/v1/cart/items',
      { skuId: String(src.unique || ''), quantity },
      { map: toLegacyCartAddResult, msg: '添加成功' },
    );
  }
  // Decrement: the quick-add UI has no cart row id, so find the row first.
  // See docs/rewrite/cr/CR-2-h.md.
  return request.get('/api/v1/cart', { filter: 'all', pageSize: 100 }).then((res) => {
    const rows = (res.data && res.data.items) || [];
    const row = rows.find((r) => String(r.skuId) === String(src.unique));
    if (!row) return { data: { cartId: 0 }, msg: '', status: 200 };
    const next = Number(row.quantity) - quantity;
    if (next <= 0) {
      return request.delete(`/api/v1/cart/items/${row.id}`, {}, { msg: '删除成功' });
    }
    return request.patch(`/api/v1/cart/items/${row.id}`, { quantity: next }, {
      map: toLegacyCartAddResult,
      msg: '修改成功',
    });
  });
}
