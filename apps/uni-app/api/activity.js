// 拼团 / 预售
//
// Contracts: packages/contracts/src/groupbuy/groupbuy.storefront.contract.ts
//            packages/contracts/src/presale/presale.storefront.contract.ts
//
// 砍价、秒杀、积分商城 are not part of the shop; they have no exports and no pages. Two
// of these functions compose more than one read — see `api/mappers/activity.js`.
//
// There is **no join endpoint**: joining a team is placing an order, so it goes through
// `POST /api/v1/orders` with `kind: 'groupbuy'` and `kindMeta: {activityId, groupId?}`.
// `postCartAdd({combinationId, pinkId, new: 1})` therefore hands the confirm page a
// `groupbuy:` ticket rather than writing a hidden cart row.

import request from '../utils/request.js';
import {
  toPageGroupbuyList,
  toPageGroupbuyDetail,
  toPageGroupbuyGroup,
  toPageGroupbuyBanners,
  toPageGroupbuyPoster,
  toPagePresaleList,
  toPageGroupbuySummary,
} from './mappers/activity.js';
import { fromPageMiniCodeQuery, toPageMiniCode } from './mappers/wechat.js';
import store from '../store';
import { fromPagePaging } from './mappers/_shared.js';

/**
 * 拼团产品列表
 * @param object data {page, limit}
 */
export function getCombinationList(data) {
  return request.get('/api/v1/groupbuy/activities', fromPagePaging(data), {
    noAuth: true,
    map: toPageGroupbuyList,
  });
}

/**
 * 拼团产品详情.
 *
 * Two reads: the activity carries the product and its SKUs, and `…/groups` carries the
 * teams still looking for members — the 正在拼单 strip the page renders under it. The
 * strip is decoration, so a failure there still shows the product.
 *
 * @param int id 活动 id
 */
export function getCombinationDetail(id) {
  return Promise.all([
    request.get(`/api/v1/groupbuy/activities/${id}`, {}, { noAuth: true }),
    request
      .get(`/api/v1/groupbuy/activities/${id}/groups`, { page: 1, pageSize: 20 }, { noAuth: true })
      .catch(() => ({ data: { items: [] } })),
  ]).then(([detail, groups]) => ({
    data: toPageGroupbuyDetail(detail.data, groups.data),
    msg: '',
    status: 200,
  }));
}

/**
 * 拼团团单详情（参团页）.
 *
 * The group view says nothing about the product — it is a seat counter — so the
 * activity is read for the SKU picker, and a page of sibling activities fills the
 * 大家都在拼 strip. Both are decoration and both are allowed to fail.
 *
 * @param int id 团单 id
 */
export function getCombinationPink(id) {
  return request.get(`/api/v1/groupbuy/groups/${id}`, {}, { noAuth: true }).then((viewRes) => {
    const view = viewRes.data || {};
    return Promise.all([
      view.activityId
        ? request
            .get(`/api/v1/groupbuy/activities/${view.activityId}`, {}, { noAuth: true })
            .catch(() => ({ data: null }))
        : Promise.resolve({ data: null }),
      request
        .get('/api/v1/groupbuy/activities', { page: 1, pageSize: 6 }, { noAuth: true })
        .catch(() => ({ data: { items: [] } })),
    ]).then(([detail, siblings]) => ({
      data: toPageGroupbuyGroup(view, detail.data, siblings.data),
      msg: '',
      status: 200,
    }));
  });
}

/**
 * 取消开团（团长撤回尚无人付款的团）
 * @param object data {id}
 */
export function postCombinationRemove(data) {
  return request.post(`/api/v1/groupbuy/groups/${(data || {}).id}/withdrawal`, {}, {
    map: toPageGroupbuyGroup,
    msg: '取消成功',
  });
}

/**
 * 拼团 banner
 */
export function getCombinationBannerList() {
  return request.get('/api/v1/groupbuy/banners', {}, {
    noAuth: true,
    map: toPageGroupbuyBanners,
  });
}

/** The poster and QR-code helpers are called with a bare id in some pages and `{id}` in others. */
function idOf(value) {
  return value && typeof value === 'object' ? value.id : value;
}

/**
 * 拼团海报数据
 * @param object|int data 团单 id，或 `{id}`
 */
export function getCombinationPosterData(data) {
  return request.get(`/api/v1/groupbuy/groups/${idOf(data)}/poster`, {}, {
    map: toPageGroupbuyPoster,
  });
}

/**
 * 预售产品列表
 * @param object data {page, limit}
 */
export function getPresellList(data) {
  return request.get('/api/v1/presale/activities', fromPagePaging(data), {
    noAuth: true,
    map: toPagePresaleList,
  });
}

// ---------------------------------------------------------------------------
// 拼团人气条和拼团小程序码
// ---------------------------------------------------------------------------

/**
 * 正在进行的拼团（首屏人气条）。`api/api.js` 的 `pink` 就是这一个。
 * `GET /api/v1/groupbuy/summary`，`auth: 'public'`。
 */
export function getPink() {
  return request.get('/api/v1/groupbuy/summary', {}, { noAuth: true, map: toPageGroupbuySummary });
}

/**
 * 拼团小程序码 — `GET /api/v1/wechat/mini-qrcodes`，`auth: 'user'`。
 * 扫码落到拼团详情，scene 带推广人（当前用户）。
 * @param object|int data 拼团活动 id
 */
export function scombinationCode(data) {
  return request.get(
    '/api/v1/wechat/mini-qrcodes',
    fromPageMiniCodeQuery('groupbuy', idOf(data), store.state.app.uid),
    { map: toPageMiniCode },
  );
}
