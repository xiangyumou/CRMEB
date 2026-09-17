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
 * 导出excel相关路由
 */
Route::group('export', function () {
    //用户列表
    Route::get('user_list', 'v1.export.ExportExcel/userList')->option(['real_name' => '用户列表导出']);
    //订单列表
    Route::get('order_list', 'v1.export.ExportExcel/orderList')->option(['real_name' => '订单列表导出']);
    //发货订单列表
    Route::get('order_delivery_list', 'v1.export.ExportExcel/orderDeliveryList')->option(['real_name' => '发货订单列表导出']);
    //商品列表
    Route::get('product_list', 'v1.export.ExportExcel/productList')->option(['real_name' => '商品列表导出']);
    //砍价列表

    //拼团列表
    Route::get('combination_list', 'v1.export.ExportExcel/combinationList')->option(['real_name' => '拼团商品列表导出']);
    //秒杀列表

    //导出会员卡
    //分销用户推广列表

    //用户资金监控
    //用户佣金

    //用户积分

    //用户充值

    //核销订单

})->middleware([
    \app\http\middleware\AllowOriginMiddleware::class,
    \app\adminapi\middleware\AdminAuthTokenMiddleware::class,
    \app\adminapi\middleware\AdminCheckRoleMiddleware::class,
    \app\adminapi\middleware\AdminLogMiddleware::class
])->option(['mark' => 'export', 'mark_name' => '数据导出']);
