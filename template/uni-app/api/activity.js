// 拼团 / 预售
//
// Contracts: next/packages/contracts/src/groupbuy/groupbuy.storefront.contract.ts
//            next/packages/contracts/src/presale/presale.storefront.contract.ts
//
// 砍价、秒杀、积分商城 are retired features (see the rewrite scope guard); their exports
// and pages are gone. What is left is stream D's, and the shape changed enough that two
// of these functions compose more than one read — see `api/mappers/activity.js`.
//
// There is **no join endpoint**: joining a team is placing an order, so it goes through
// `POST /api/v1/orders` with `kind: 'groupbuy'` and `kindMeta: {activityId, groupId?}`.
// `postCartAdd({combinationId, pinkId, new: 1})` therefore hands the confirm page a
// `groupbuy:` ticket rather than writing a hidden cart row.

import request from '../utils/request.js';
import {
  toLegacyGroupbuyList,
  toLegacyGroupbuyDetail,
  toLegacyGroupbuyGroup,
  toLegacyGroupbuyBanners,
  toLegacyGroupbuyPoster,
  toLegacyPresaleList,
  toLegacyGroupbuySummary,
} from './mappers/activity.js';
import { fromLegacyMiniCodeQuery, toLegacyMiniCode } from './mappers/wechat.js';
import store from '../store';
import { fromLegacyPage } from './mappers/_shared.js';

/**
 * 拼团产品列表
 * @param object data {page, limit}
 */
export function getCombinationList(data) {
  return request.get('/api/v1/groupbuy/activities', fromLegacyPage(data), {
    noAuth: true,
    map: toLegacyGroupbuyList,
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
    data: toLegacyGroupbuyDetail(detail.data, groups.data),
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
      data: toLegacyGroupbuyGroup(view, detail.data, siblings.data),
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
    map: toLegacyGroupbuyGroup,
    msg: '取消成功',
  });
}

/**
 * 拼团 banner
 */
export function getCombinationBannerList() {
  return request.get('/api/v1/groupbuy/banners', {}, {
    noAuth: true,
    map: toLegacyGroupbuyBanners,
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
    map: toLegacyGroupbuyPoster,
  });
}

/**
 * 预售产品列表
 * @param object data {page, limit}
 */
export function getPresellList(data) {
  return request.get('/api/v1/presale/activities', fromLegacyPage(data), {
    noAuth: true,
    map: toLegacyPresaleList,
  });
}

// ---------------------------------------------------------------------------
// 拼团人气条和拼团小程序码（B3 / E4，第三轮绑定）
// ---------------------------------------------------------------------------

/**
 * 正在进行的拼团（首屏人气条）。`api/api.js` 的 `pink` 就是这一个。
 * B3 的 `GET /api/v1/groupbuy/summary`，`auth: 'public'`（CR-1-h2）。
 */
export function getPink() {
  return request.get('/api/v1/groupbuy/summary', {}, { noAuth: true, map: toLegacyGroupbuySummary });
}

/**
 * 拼团小程序码 — E4 的 `GET /api/v1/wechat/mini-qrcodes`（CR-6-h2），`auth: 'user'`。
 * 扫码落到拼团详情，scene 带推广人（当前用户）。
 * @param object|int data 拼团活动 id
 */
export function scombinationCode(data) {
  return request.get(
    '/api/v1/wechat/mini-qrcodes',
    fromLegacyMiniCodeQuery('groupbuy', idOf(data), store.state.app.uid),
    { map: toLegacyMiniCode },
  );
}
