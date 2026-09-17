// +----------------------------------------------------------------------
// | CRMEB [ CRMEB赋能开发者，助力企业发展 ]
// +----------------------------------------------------------------------
// | Copyright (c) 2016~2023 https://www.crmeb.com All rights reserved.
// +----------------------------------------------------------------------
// | Licensed CRMEB并不是自由软件，未经许可不能去掉CRMEB相关版权
// +----------------------------------------------------------------------
// | Author: CRMEB Team <admin@crmeb.com>
// +----------------------------------------------------------------------

import request from '@/libs/request';

/**
 * @description 已发布管理--列表
 * @param {Object} param params {Object} 传值参数
 */
export function releasedListApi(params) {
  return request({
    url: 'marketing/coupon/released',
    method: 'get',
    params,
  });
}

/**
 * @description 已发布管理--领取记录
 * @param {Number} param id {Number} 已发布优惠券id
 */
export function releasedissueLogApi(id, params) {
  return request({
    url: `marketing/coupon/released/issue_log/${id}`,
    method: 'get',
    params,
  });
}

/**
 * @description 已发布管理--修改状态表单
 * @param {Number} param id {Number} 已发布优惠券id
 */
export function releaseStatusApi(id) {
  return request({
    url: `marketing/coupon/released/${id}/status`,
    method: 'get',
  });
}

/**
 * @description 优惠券列表--是否开启
 * @param {*} data
 */
export function couponStatusApi(data) {
  return request({
    url: `marketing/coupon/status/${data.id}/${data.status}`,
    method: 'get',
  });
}

/**
 * @description 优惠券列表--已发布记录详情
 * @param {Number} param id {Number} 已发布优惠券id
 */
export function couponDetailApi(id) {
  return request({
    url: `marketing/coupon/released/${id}/status`,
    method: 'get',
  });
}

/**
 * @description 优惠券制作--保存
 */
export function couponSaveApi(data) {
  return request({
    url: `marketing/coupon/save_coupon`,
    method: 'post',
    data,
  });
}

/**
 * @description 会员领取记录 -- 列表
 * @param {Object} param params {Object} 传值参数
 */
export function userListApi(params) {
  return request({
    url: `/marketing/coupon/user`,
    method: 'get',
    params,
  });
}

/**
 * @description 预售商品 -- 修改状态
 * @param {Object} param data {Object} 传值参数
 */
export function advanceSetStatusApi(data) {
  return request({
    url: `marketing/advance/set_status/${data.id}/${data.status}`,
    method: 'PUT',
  });
}

/**
 * @description 预售商品 -- 列表
 * @param {Object} param params {Object} 传值参数
 */
export function presellListApi(params) {
  return request({
    url: `marketing/advance/index`,
    method: 'get',
    params,
  });
}

/**
 * @description 预售商品 -- 保存编辑
 * @param {Object} param data {Object} 传值参数
 */
export function presellCreatApi(data) {
  return request({
    url: `marketing/advance/save/${data.id}`,
    method: 'POST',
    data,
  });
}

/**
 * @description 预售商品 -- 详情
 * @param {Number} param id {Number} 拼团商品id
 */
export function presellInfoApi(id) {
  return request({
    url: `marketing/advance/info/${id}`,
    method: 'get',
  });
}

/**
 * @description 拼团商品 -- 列表
 * @param {Object} param data {Object} 传值参数
 */
export function combinationListApi(params) {
  return request({
    url: `marketing/combination`,
    method: 'get',
    params,
  });
}

/**
 * @description 拼团商品 -- 修改状态
 * @param {Object} param data {Object} 传值参数
 */
export function combinationSetStatusApi(data) {
  return request({
    url: `marketing/combination/set_status/${data.id}/${data.status}`,
    method: 'PUT',
  });
}

/**
 * @description 拼团商品 -- 拼团统计
 * @param {Object} param data {Object} 传值参数
 */
export function statisticsApi() {
  return request({
    url: `marketing/combination/statistics`,
    method: 'GET',
  });
}

/**
 * @description 拼团商品 -- 详情
 * @param {Number} param id {Number} 拼团商品id
 */
export function combinationInfoApi(id) {
  return request({
    url: `marketing/combination/${id}`,
    method: 'get',
  });
}

/**
 * @description 拼团商品 -- 保存编辑
 * @param {Object} param data {Object} 传值参数
 */
export function combinationCreatApi(data) {
  return request({
    url: `marketing/combination/${data.id}`,
    method: 'POST',
    data,
  });
}

/**
 * @description 拼团商品 -- 拼团列表
 */
export function combineListApi(params) {
  return request({
    url: `marketing/combination/combine/list`,
    method: 'GET',
    params,
  });
}

/**
 * @description 拼团商品 -- 拼团人列表
 * @param {Number} param id {Number} 拼团商品id
 */
export function orderPinkListApi(id) {
  return request({
    url: `marketing/combination/order_pink/${id}`,
    method: 'GET',
  });
}

/**
 * @description 商品列表 -- 头部
 */
export function productAttrsApi(id, type) {
  return request({
    url: `product/product/attrs/${id}/${type}`,
    method: 'GET',
  });
}

/**
 * @description 已发布管理 -- 删除
 */
export function delCouponReleased(id) {
  return request({
    url: `marketing/coupon/released/${id}`,
    method: 'DELETE',
  });
}

/**
 * 拼团统计
 * @param {*} id
 * @param {*} params
 * @returns
 */
export function getcombinationStatistics(id, params) {
  return request({
    url: `marketing/combination/statistics/head/${id}`,
    method: 'get',
    params,
  });
}

/**
 * 拼团列表
 * @param {*} id
 * @param {*} params
 * @returns
 */
export function getcombinationStatisticsPeople(id, params) {
  return request({
    url: `marketing/combination/statistics/list/${id}`,
    method: 'get',
    params,
  });
}

/**
 * 拼团订单
 * @param {*} id
 * @param {*} params
 * @returns
 */
export function getcombinationStatisticsOrder(id, params) {
  return request({
    url: `marketing/combination/statistics/order/${id}`,
    method: 'get',
    params,
  });
}

/**
 * 编辑新人礼
 */
export function editNewbie(data) {
  return request({
    url: 'user/new_gift/save',
    method: 'post',
    data,
  });
}
/**
 * 编辑新人礼
 */
export function getNewbie(data) {
  return request({
    url: 'user/new_gift',
    method: 'get',
  });
}

/**
 * 拼团立即成团
 */
export function combineJoinApi(id) {
  return request({
    url: 'marketing/combination/immediately/' + id,
    method: 'get',
  });
}
