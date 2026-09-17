<?php
// +----------------------------------------------------------------------
// | CRMEB [ CRMEB赋能开发者，助力企业发展 ]
// +----------------------------------------------------------------------
// | Copyright (c) 2016~2026 https://www.crmeb.com All rights reserved.
// +----------------------------------------------------------------------
// | Licensed CRMEB并不是自由软件，未经许可不能去掉CRMEB相关版权
// +----------------------------------------------------------------------
// | Author: CRMEB Team <admin@crmeb.com>
// +----------------------------------------------------------------------
use think\facade\Route;

/**
 * 优惠卷，砍价，拼团，秒杀 路由
 */
Route::group('marketing', function () {

    /** 优惠券 */
    Route::group(function () {
        //已发布优惠券列表
        Route::get('coupon/released', 'v1.marketing.StoreCouponIssue/index')->option(['real_name' => '已发布优惠券列表']);
        //添加优惠券
        Route::post('coupon/save_coupon', 'v1.marketing.StoreCouponIssue/saveCoupon')->option(['real_name' => '添加优惠券']);
        //修改优惠券状态
        Route::get('coupon/status/:id/:status', 'v1.marketing.StoreCouponIssue/status')->option(['real_name' => '修改优惠券状态']);
        //一键复制优惠券
        Route::get('coupon/copy/:id', 'v1.marketing.StoreCouponIssue/copy')->option(['real_name' => '一键复制优惠券']);
        //发送优惠券列表
        Route::get('coupon/grant', 'v1.marketing.StoreCouponIssue/index')->option(['real_name' => '发送优惠券列表']);
        //已发布优惠券删除
        Route::delete('coupon/released/:id', 'v1.marketing.StoreCouponIssue/delete')->option(['real_name' => '已发布优惠券删除']);
        //已发布优惠券修改状态表单
        Route::get('coupon/released/:id/status', 'v1.marketing.StoreCouponIssue/edit')->option(['real_name' => '已发布优惠券修改状态表单']);
        //已发布优惠券修改状态
        Route::put('coupon/released/status/:id', 'v1.marketing.StoreCouponIssue/status')->option(['real_name' => '已发布优惠券修改状态']);
        //已发布优惠券领取记录
        Route::get('coupon/released/issue_log/:id', 'v1.marketing.StoreCouponIssue/issue_log')->option(['real_name' => '已发布优惠券领取记录']);
        //会员领取记录
        Route::get('coupon/user', 'v1.marketing.StoreCouponUser/index')->option(['real_name' => '会员领取记录']);
        //发送优惠券
        Route::post('coupon/user/grant', 'v1.marketing.StoreCouponUser/grant')->option(['real_name' => '发送优惠券']);
    })->option(['parent' => 'marketing', 'cate_name' => '优惠券']);


    /** 预售活动 */
    Route::group(function () {
        //预售商品列表
        Route::get('advance/index', 'v1.marketing.StoreAdvance/index')->option(['real_name' => '预售商品列表']);
        //预售商品详情
        Route::get('advance/info/:id', 'v1.marketing.StoreAdvance/info')->option(['real_name' => '预售商品详情']);
        //保存新增或编辑预售
        Route::post('advance/save/:id', 'v1.marketing.StoreAdvance/save')->option(['real_name' => '保存新增或编辑预售']);
        //删除预售
        Route::delete('advance/:id', 'v1.marketing.StoreAdvance/del')->option(['real_name' => '删除预售']);
        //修改预售状态
        Route::put('advance/set_status/:id/:status', 'v1.marketing.StoreAdvance/setStatus')->option(['real_name' => '修改预售状态']);
    })->option(['parent' => 'marketing', 'cate_name' => '预售活动']);

    /** 拼团活动 */
    Route::group(function () {
        //拼团商品列表
        Route::get('combination', 'v1.marketing.StoreCombination/index')->option(['real_name' => '拼团商品列表']);
        //拼团统计
        Route::get('combination/statistics', 'v1.marketing.StoreCombination/statistics')->option(['real_name' => '拼团商品统计']);
        //拼团商品详情
        Route::get('combination/:id', 'v1.marketing.StoreCombination/read')->option(['real_name' => '拼团商品详情']);
        //保存新疆或编辑
        Route::post('combination/:id', 'v1.marketing.StoreCombination/save')->option(['real_name' => '新增或编辑拼团商品']);
        //删除
        Route::delete('combination/:id', 'v1.marketing.StoreCombination/delete')->option(['real_name' => '删除拼团商品']);
        //修改拼团状态
        Route::put('combination/set_status/:id/:status', 'v1.marketing.StoreCombination/set_status')->option(['real_name' => '修改拼团商品状态']);
        //拼团列表
        Route::get('combination/combine/list', 'v1.marketing.StoreCombination/combine_list')->option(['real_name' => '参与拼团列表']);
        //拼团人列表
        Route::get('combination/order_pink/:id', 'v1.marketing.StoreCombination/order_pink')->option(['real_name' => '拼团人列表']);
        //拼团统计
        Route::get('combination/statistics/head/:id', 'v1.marketing.StoreCombination/combinationStatistics')->option(['real_name' => '拼团统计']);
        //拼团列表
        Route::get('combination/statistics/list/:id', 'v1.marketing.StoreCombination/combinationStatisticsList')->option(['real_name' => '拼团统计列表']);
        //拼团订单
        Route::get('combination/statistics/order/:id', 'v1.marketing.StoreCombination/combinationStatisticsOrder')->option(['real_name' => '拼团统计订单']);
        //立即成团
        Route::get('combination/immediately/:id', 'v1.marketing.StoreCombination/immediatelyCombination')->option(['real_name' => '立即成团']);

    })->option(['parent' => 'marketing', 'cate_name' => '拼团活动']);





})->middleware([
    \app\http\middleware\AllowOriginMiddleware::class,
    \app\adminapi\middleware\AdminAuthTokenMiddleware::class,
    \app\adminapi\middleware\AdminCheckRoleMiddleware::class,
    \app\adminapi\middleware\AdminLogMiddleware::class
])->option(['mark' => 'marketing', 'mark_name' => '营销活动']);
