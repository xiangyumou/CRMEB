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
 * 用户模块 相关路由
 */
Route::group('user', function () {

    /** 用户 */
    Route::group(function () {
        //用户管理资源路由
        Route::resource('user', 'v1.user.User')->option([
            'real_name' => [
                'index' => '获取用户列表',
                'create' => '获取用户表单',
                'save' => '保存用户',
                'read' => '获取用户详情',
                'edit' => '获取修改用户表单',
                'update' => '修改用户',
                'delete' => '删除用户'
            ]
        ]);
        //添加用户保存
        //同步微信用户
        Route::get('user/syncUsers', 'v1.user.User/syncWechatUsers')->option(['real_name' => '同步微信用户']);
        //用户信息
        Route::get('user/user_save_info/:uid', 'v1.user.User/userSaveInfo')->option(['real_name' => '添加编辑用户信息时候的信息']);

        //修改用户状态
        //获取指定用户的信息
        Route::get('one_info/:id', 'v1.user.User/oneUserInfo')->option(['real_name' => '获取指定用户的信息']);
        //设置会员分组
        Route::post('set_group', 'v1.user.User/set_group')->option(['real_name' => '用户分组表单']);
        //执行设置会员分组
        Route::put('save_set_group', 'v1.user.User/save_set_group')->option(['real_name' => '设置用户分组']);
        //设置会员标签
        Route::post('set_label', 'v1.user.User/set_label')->option(['real_name' => '设置用户标签']);
    })->option(['parent' => 'user', 'cate_name' => '用户']);

    /** 用户分组 */
    Route::group(function () {
        //获取用户分组列表
        Route::get('user_group/list', 'v1.user.UserGroup/index')->option(['real_name' => '获取用户分组列表']);
        //添加修改分组表单
        Route::get('user_group/add/:id', 'v1.user.UserGroup/add')->option(['real_name' => '添加修改分组表单']);
        //保存分组表单数据
        Route::post('user_group/save', 'v1.user.UserGroup/save')->option(['real_name' => '保存分组表单数据']);
        //删除分组数据
        Route::delete('user_group/del/:id', 'v1.user.UserGroup/delete')->option(['real_name' => '删除用户分组数据']);
    })->option(['parent' => 'user', 'cate_name' => '用户分组']);

    /** 用户标签 */
    Route::group(function () {
        //会员标签列表
        Route::get('user_label', 'v1.user.UserLabel/index')->option(['real_name' => '用户标签列表']);
        //会员标签添加修改表单
        Route::get('user_label/add/:id', 'v1.user.UserLabel/add')->option(['real_name' => '添加或修改用户标签表单']);
        //保存标签表单数据
        Route::post('user_label/save', 'v1.user.UserLabel/save')->option(['real_name' => '添加或修改用户标签']);
        //删除会员标签
        Route::delete('user_label/del/:id', 'v1.user.UserLabel/delete')->option(['real_name' => '删除用户标签']);
        //获取用户标签
        Route::get('label/:uid', 'v1.user.UserLabel/getUserLabel')->option(['real_name' => '获取用户标签']);
        //设置和取消用户标签
        Route::post('label/:uid', 'v1.user.UserLabel/setUserLabel')->option(['real_name' => '设置和取消用户标签']);
        //设置会员分组
        //标签分类
        Route::resource('user_label_cate', 'v1.user.UserLabelCate')->except(['read'])->option([
            'real_name' => [
                'index' => '获取标签分类',
                'create' => '获取标签分类表单',
                'save' => '保存标签分类',
                'edit' => '获取修改标签分类表单',
                'update' => '修改标签分类',
                'delete' => '删除标签分类'
            ]
        ]);
        Route::get('user_label_cate/all', 'v1.user.UserLabelCate/getAll')->option(['real_name' => '获取用户标签分类全部']);
        //用户标签（分类）树形列表
        Route::get('user_tree_label', 'v1.user.UserLabel/tree_list')->option(['real_name' => '用户标签（分类）树形列表']);
    })->option(['parent' => 'user', 'cate_name' => '用户标签']);

    /** 付费会员 */
    Route::group(function () {
        //会员卡批次列表资源

        //添加会员卡批次

        //会员卡列表

        //会员卡修改状态

        //列表单字段修改操作

        //会员类型

        //会员类型删除

        //会员类型修改状态

        //会员卡类型编辑

        //兑换会员卡二维码

        //会员记录

        //会员权益

        //会员权益修改

        //会员协议

        //获取会员协议

    })->option(['parent' => 'user', 'cate_name' => '付费会员']);


    /** 用户注销 */
    Route::group(function () {
        Route::get('cancel_list', 'v1.user.UserCancel/getCancelList')->option(['real_name' => '用户注销列表']);
        Route::post('cancel/set_mark', 'v1.user.UserCancel/setMark')->option(['real_name' => '注销列表备注']);
        Route::get('cancel/agree/:id', 'v1.user.UserCancel/agreeCancel')->option(['real_name' => '同意注销']);
        Route::get('cancel/refuse/:id', 'v1.user.UserCancel/refuseCancel')->option(['real_name' => '拒绝注销']);
    })->option(['parent' => 'user', 'cate_name' => '用户注销']);

    /** 新人礼 */
    Route::group(function () {
        Route::get('new_gift', 'v1.user.User/getNewGift')->option(['real_name' => '获取新人礼']);
        Route::post('new_gift/save', 'v1.user.User/saveNewGift')->option(['real_name' => '保存新人礼']);
    })->option(['parent' => 'user', 'cate_name' => '新人礼']);

})->middleware([
    \app\http\middleware\AllowOriginMiddleware::class,
    \app\adminapi\middleware\AdminAuthTokenMiddleware::class,
    \app\adminapi\middleware\AdminCheckRoleMiddleware::class,
    \app\adminapi\middleware\AdminLogMiddleware::class
])->option(['mark' => 'user', 'mark_name' => '用户管理']);
