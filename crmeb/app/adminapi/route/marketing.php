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

    /** 砍价活动 */
    Route::group(function () {
        //砍价商品列表

        //砍价详情

        //保存新增或编辑砍价

        //删除砍价

        //修改砍价状态

        //砍价列表

        //砍价人列表

        //砍价统计

        //砍价列表

        //砍价订单

    })->option(['parent' => 'marketing', 'cate_name' => '砍价活动']);

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

    /** 秒杀活动 */
    Route::group(function () {
        //秒杀列表

        //秒杀时间段列表

        //秒杀详情

        //秒杀保存新增或编辑

        //秒杀删除

        //修改秒杀状态

        //秒杀统计

        //参与活动人员

        //秒杀订单










    })->option(['parent' => 'marketing', 'cate_name' => '秒杀活动']);

    /** 积分活动 */
    Route::group(function () {
        //积分日志列表

        //积分日志头部数据

        //积分配置编辑表单

        //积分配置保存数据

        //积分商品列表

        //积分商品新增或编辑

        //积分商品详情

        //积分商品删除

        //修改积分商品状态

        //积分商城订单列表

        //积分商城订单数据

        //积分商城订单详情数据

        //修改积分商品订单备注信息

        //获取积分订单状态

        //删除积分订单

        //积分订单发送货

        //获取积分订单配送信息表单

        //修改积分订单配送信息

        //积分订单确认收货

        //积分订单获取物流公司

        //积分订单快递公司电子面单模版

        //积分订单获取物流信息

        //打印积分订单

        //积分订单列表获取配送员

        //积分订单获取面单默认配置信息

        //积分记录




        //积分来源统计

        //积分消耗统计

    })->option(['parent' => 'marketing', 'cate_name' => '积分活动']);

    /** 抽奖活动 */
    Route::group(function () {
        //抽奖活动列表

        //抽奖活动详情

        //添加抽奖活动

        //修改抽奖活动数据

        //删除抽奖活动

        //设置抽奖活动是否显示

        //抽奖记录列表

        //抽奖中奖发货、备注处理

        //分类抽奖列表

        //保存抽奖配置


    })->option(['parent' => 'marketing', 'cate_name' => '抽奖活动']);

    /** 每日签到 */
    Route::group(function () {
        //签到奖励列表

        //添加签到奖励

        //编辑签到奖励

        //保存签到奖励

        //删除签到奖励

    })->option(['parent' => 'marketing', 'cate_name' => '每日签到']);

})->middleware([
    \app\http\middleware\AllowOriginMiddleware::class,
    \app\adminapi\middleware\AdminAuthTokenMiddleware::class,
    \app\adminapi\middleware\AdminCheckRoleMiddleware::class,
    \app\adminapi\middleware\AdminLogMiddleware::class
])->option(['mark' => 'marketing', 'mark_name' => '营销活动']);
