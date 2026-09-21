// 拼团 / 预售
//
// 砍价、秒杀、积分商城 are retired features (see the rewrite scope guard); their exports
// and pages are gone. What is left belongs to stream D (group-buy / presale), whose
// contract is not written yet, so every call below is CONTRACT-PENDING(D) and pointed
// at the path the conventions imply. docs/rewrite/status/h.md tracks them.

import request from '../utils/request.js';

/**
 * 拼团产品列表
 * @param object data {page, limit}
 */
export function getCombinationList(data) {
  return request.get('/api/v1/groupbuys', data, { noAuth: true });
}

/**
 * 拼团产品详情
 * @param int id
 */
export function getCombinationDetail(id) {
  return request.get(`/api/v1/groupbuys/${id}`, {}, { noAuth: true });
}

/**
 * 拼团团单详情（参团页）
 * @param int id 团单 id
 */
export function getCombinationPink(id) {
  return request.get(`/api/v1/groupbuy-teams/${id}`, {}, { noAuth: true });
}

/**
 * 取消拼团
 * @param object data {id}
 */
export function postCombinationRemove(data) {
  return request.post(`/api/v1/groupbuy-teams/${(data || {}).id}/cancel`, {}, { msg: '取消成功' });
}

/**
 * 拼团 banner
 */
export function getCombinationBannerList() {
  return request.get('/api/v1/groupbuys/banners', {}, { noAuth: true });
}

/**
 * 正在进行的拼团团单
 */
export function getPink() {
  return request.get('/api/v1/groupbuy-teams', { state: 'open' }, { noAuth: true });
}

/**
 * 拼团海报数据
 * @param object data {id}
 */
export function getCombinationPosterData(data) {
  return request.get(`/api/v1/groupbuys/${(data || {}).id}/poster`, {}, { noAuth: true });
}

/**
 * 拼团小程序码
 * @param object data
 */
export function scombinationCode(data) {
  return request.get('/api/v1/wechat/qrcodes/groupbuy', data);
}

/**
 * 预售产品列表
 * @param object data {page, limit}
 */
export function getPresellList(data) {
  return request.get('/api/v1/presales', data, { noAuth: true });
}
