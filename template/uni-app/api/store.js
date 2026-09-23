// 商品 / 分类 / 评价 / 收藏 / 足迹

import request from '../utils/request.js';
import {
  toPageProductDetail,
  toPageProductList,
  toPageCategoryTree,
  toPageAttr,
  toPageRealPrice,
  toPageReplyList,
  toPageReplyConfig,
  toPageHotKeywords,
  toPageCollectList,
  toPageVisitList,
  toPageFavoriteResult,
  toPageCollectAllResult,
  fromPageIdList,
} from './mappers/catalog.js';
import { toPagePresaleDetail } from './mappers/activity.js';
import { toPageCartAddResult, fromPageCartAddInput } from './mappers/cart.js';
import { buyNowTicket } from './mappers/order.js';
import { fromPagePaging } from './mappers/_shared.js';
import { fromPageMiniCodeQuery, toPageMiniCode } from './mappers/wechat.js';
import store from '../store';

/**
 * 获取产品详情
 * @param int id
 */
export function getProductDetail(id) {
  return request.get(`/api/v1/catalog/products/${id}`, {}, {
    noAuth: true,
    map: toPageProductDetail,
  });
}

/**
 * 获取产品列表
 * @param object data {page, limit, keyword, cid, sid, priceOrder, news, …}
 */
export function getProductslist(data) {
  return request.get('/api/v1/catalog/products', fromPageProductQuery(data), {
    noAuth: true,
    map: toPageProductList,
  });
}

/** The page's 商品列表筛选 → the contract's query. */
function fromPageProductQuery(data) {
  const src = data || {};
  const query = fromPagePaging(src);
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
    { noAuth: true, map: toPageProductList },
  );
}

/**
 * 获取分类列表
 */
export function getCategoryList() {
  return request.get('/api/v1/catalog/categories', {}, {
    noAuth: true,
    map: toPageCategoryTree,
  });
}

/**
 * 获取首页的属性（规格）
 * @param int id 商品 id
 * @param int type 页面传的活动类型，路由只有普通商品
 */
export function getAttr(id, type) {
  return request.get(`/api/v1/catalog/products/${id}/skus`, {}, {
    noAuth: true,
    map: toPageAttr,
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
    map: (dto) => toPageRealPrice(dto, unique),
  });
}

/**
 * 获取产品评论
 * @param int id
 * @param object data {page, limit, type}
 */
export function getReplyList(id, data) {
  const src = data || {};
  const query = fromPagePaging(src);
  if (src.type !== undefined && src.type !== '') query.rating = pageRating(src.type);
  return request.get(`/api/v1/catalog/products/${id}/reviews`, query, {
    noAuth: true,
    map: toPageReplyList,
  });
}

/** 页面的评价筛选：0 全部 1 好评 2 中评 3 差评 4 有图 */
function pageRating(type) {
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
    map: toPageReplyConfig,
  });
}

/**
 * 获取搜索关键字
 */
export function getSearchKeyword() {
  return request.get('/api/v1/catalog/search/hot-keywords', {}, {
    noAuth: true,
    map: toPageHotKeywords,
  });
}

/**
 * 添加收藏
 * @param int id
 */
export function collectAdd(id) {
  return request.post('/api/v1/me/favorites', { productId: String(id) }, {
    map: toPageFavoriteResult,
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
  // One request, not one per product, which would be N chances to half-succeed.
  // The route is idempotent and partial-tolerant: an id whose product went off
  // shelf comes back `favorited: false` instead of failing the rest, and the page
  // only ever read "it worked".
  return request.post('/api/v1/me/favorites/batch', { productIds: fromPageIdList(id) }, {
    map: toPageCollectAllResult,
    msg: '收藏成功',
  });
}

/**
 * 获取收藏列表
 * @param object data {page, limit}
 */
export function getCollectUserList(data) {
  return request.get('/api/v1/me/favorites', fromPagePaging(data), { map: toPageCollectList });
}

/**
 * 获取浏览记录列表
 * @param object data {page, limit}
 */
export function getVisitList(data) {
  return request.get('/api/v1/me/history', fromPagePaging(data), { map: toPageVisitList });
}

/**
 * 删除浏览记录
 * @param object data {ids}
 */
export function deleteVisitList(data) {
  const src = data || {};
  return request.post(
    '/api/v1/me/history/deletions',
    { productIds: fromPageIdList(src.ids !== undefined ? src.ids : src) },
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
  const query = fromPagePaging(data);
  query.feature = GROOM_FEATURE[Number(type)] || 'recommended';
  return request.get('/api/v1/catalog/products', query, {
    noAuth: true,
    // The 推荐位 page reads `{banner, list}`; there is no banner in the new DTO.
    map: (dto) => ({ banner: [], list: toPageProductList(dto) }),
  });
}

/**
 * 预售详情。预售是营销域的一个活动，不是商品上的几个字段，所以这里的 id 是**活动
 * id**，而返回值由 `mappers/activity.js` 组装成商品详情页认得的
 * `{storeInfo, productAttr, productValue}`。
 *
 * @param int id 活动 id
 */
export function getPresellProductDetail(id) {
  return request.get(`/api/v1/presale/activities/${id}`, {}, {
    noAuth: true,
    map: toPagePresaleDetail,
  });
}

// ---------------------------------------------------------------------------
// 商品海报的小程序码 — `GET /api/v1/wechat/mini-qrcodes`
// ---------------------------------------------------------------------------

/**
 * 产品分享二维码。路由是 `auth: 'user'`，所以不再 `noAuth`：海报只在小程序里、
 * 登录后生成，scene 带当前用户作推广人。
 * @param int id 商品 id
 */
export function getProductCode(id) {
  return request.get(
    '/api/v1/wechat/mini-qrcodes',
    fromPageMiniCodeQuery('product', id, store.state.app.uid),
    { map: toPageMiniCode },
  );
}

// ---------------------------------------------------------------------------
// 购物车（合约已合并）
// ---------------------------------------------------------------------------

/**
 * 购车添加
 * @param object data {productId, cartNum, uniqueId, new, combinationId,
 * advanceId, pinkId}
 */
export function postCartAdd(data) {
  const src = data || {};
  // `new: 1` is 立即购买 (`goods_combination_details` spells the same flag `is_new`).
  // Nothing is written to the cart any more; the confirm page gets a ticket it
  // can turn into a `buy-now` checkout preview. 拼团 (`combinationId`, plus
  // `pinkId` when joining an existing team) and 预售 (`advanceId`) ride along
  // inside the ticket, because the confirm page forwards nothing but `cartId` to
  // the preview.
  if (src.new || src.is_new) {
    const activityId = src.combinationId || src.advanceId || '';
    const kind = src.combinationId ? 'groupbuy' : src.advanceId ? 'presale' : 'normal';
    const ticket = buyNowTicket(src.uniqueId || '', src.cartNum, kind, activityId, src.pinkId);
    return Promise.resolve({ data: { cartId: ticket }, msg: '', status: 200 });
  }
  return request.post('/api/v1/cart/items', fromPageCartAddInput(src), {
    map: toPageCartAddResult,
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
      { map: toPageCartAddResult, msg: '添加成功' },
    );
  }
  // Decrement by variant, without listing the whole cart to find a row id first —
  // that would be an extra round trip on the hottest screen in the app, and a
  // read-then-write besides. `/cart/items/decrements` is one conditional
  // statement and removes the row when it reaches zero.
  return request.post(
    '/api/v1/cart/items/decrements',
    { skuId: String(src.unique || ''), quantity },
    { map: toPageCartAddResult, msg: '修改成功' },
  );
}
