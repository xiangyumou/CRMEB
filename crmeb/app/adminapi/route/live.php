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
 * 直播相关路由
 */
Route::group('live', function () {

    /** 主播 */
    Route::group(function () {
        //主播列表

        //添加修改主播表单

        //保存主播数据

        //删除主播

        //设置是否显示

    })->option(['parent' => 'live', 'cate_name' => '主播']);

    /** 直播商品 */
    Route::group(function () {
        //直播商品列表

        //生成直播商品

        //添加修改商品

        //商品详情

        //商品重新审核

        //商品撤回审核

        //删除商品

        //设置是否显示

        //同步直播商品状态

    })->option(['parent' => 'live', 'cate_name' => '直播商品']);

    /** 主播间 */
    Route::group(function () {
        //直播间列表

        //直播间添加

        //直播间详情

        //直播间添加商品

        //删除直播

        //设置是否显示

        //同步直播间状态

    })->option(['parent' => 'live', 'cate_name' => '直播间']);

})->middleware([
    \app\http\middleware\AllowOriginMiddleware::class,
    \app\adminapi\middleware\AdminAuthTokenMiddleware::class,
    \app\adminapi\middleware\AdminCheckRoleMiddleware::class,
    \app\adminapi\middleware\AdminLogMiddleware::class
])->option(['mark' => 'live', 'mark_name' => '直播管理']);
