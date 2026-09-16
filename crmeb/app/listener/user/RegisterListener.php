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
namespace app\listener\user;


use app\services\activity\coupon\StoreCouponIssueServices;
use crmeb\interfaces\ListenerInterface;

/**
 * 注册完成后置事件
 * Class RegisterListener
 * @package app\listener\user
 */
class RegisterListener implements ListenerInterface
{
    /**
     * 注册完成后置事件
     * @param $event
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function handle($event): void
    {
        [$spreadUid, $userType, $name, $uid, $isNew] = $event;
        if ($isNew) {
            app()->make(StoreCouponIssueServices::class)->userFirstSubGiveCoupon((int)$uid);
        }
    }
}
