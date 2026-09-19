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

namespace app\jobs;


use app\services\order\StoreOrderServices;
use crmeb\basic\BaseJobs;
use crmeb\traits\QueueTrait;
use think\facade\Log;

/**
 * 未支付订单到期取消
 * Class UnpaidOrderCancelJob
 * @package crmeb\jobs
 */
class UnpaidOrderCancelJob extends BaseJobs
{

    use QueueTrait;

    public function doJob($orderId)
    {
        /** @var StoreOrderServices $services */
        $services = app()->make(StoreOrderServices::class);
        $orderInfo = $services->get($orderId);
        if (!$orderInfo) {
            return true;
        }
        if ($orderInfo->paid) {
            return true;
        }
        if ($orderInfo->is_del) {
            return true;
        }
        if ($orderInfo->pay_type == 'offline') {
            return true;
        }
        if ($orderInfo->is_cancel == 1) {
            return true;
        }
        try {
            //手动、队列、定时取消共用同一个入口：先确认网关侧已无可支付的单子，
            //再在同一个事务里退券、各层回库并写入取消状态，任一失败整体回滚。
            return $services->cancelUnpaidOrder((int)$orderInfo['id'], '订单未支付已超过系统预设时间');
        } catch (\Throwable $e) {
            Log::error('自动取消订单失败,失败原因:' . $e->getMessage());
            return false;
        }
    }
}
