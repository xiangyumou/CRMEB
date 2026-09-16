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
 * 财务模块 相关路由
 */
Route::group('finance', function () {

    /** 提现 */
    Route::group(function () {
        //申请列表

        //编辑表单

        //保存修改

        //拒绝申请

        //通过申请

    })->option(['parent' => 'finance', 'cate_name' => '提现']);

    /** 资金记录 */
    Route::group(function () {
        //筛选类型
        Route::get('finance/bill_type', 'v1.finance.Finance/bill_type')->option(['real_name' => '资金记录类型']);
        //资金记录
        Route::get('finance/list', 'v1.finance.Finance/list')->option(['real_name' => '资金记录列表']);
        //佣金记录

        //佣金详情用户信息

        //佣金提现记录个人列表

        /** 余额记录 */


    })->option(['parent' => 'finance', 'cate_name' => '资金记录']);

    /** 充值 */
    Route::group(function () {
        //充值记录列表

        //删除记录

        //获取用户充值数据

        //退款表单

        //退款

    })->option(['parent' => 'finance', 'cate_name' => '充值']);


})->middleware([
    \app\http\middleware\AllowOriginMiddleware::class,
    \app\adminapi\middleware\AdminAuthTokenMiddleware::class,
    \app\adminapi\middleware\AdminCheckRoleMiddleware::class,
    \app\adminapi\middleware\AdminLogMiddleware::class
])->option(['mark' => 'finance', 'mark_name' => '财务管理']);
