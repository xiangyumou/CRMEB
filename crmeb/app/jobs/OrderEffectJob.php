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

use app\services\order\StoreOrderEffectServices;
use crmeb\basic\BaseJobs;
use crmeb\traits\QueueTrait;
use think\facade\Log;

/**
 * 订单支付后置副作用补投
 * Class OrderEffectJob
 * @package app\jobs
 */
class OrderEffectJob extends BaseJobs
{
    use QueueTrait;

    /**
     * @param int $effectId
     * @return bool
     */
    public function doJob($effectId)
    {
        try {
            /** @var StoreOrderEffectServices $services */
            $services = app()->make(StoreOrderEffectServices::class);
            return $services->runById((int)$effectId);
        } catch (\Throwable $e) {
            Log::error('订单后置副作用补投失败:' . $e->getMessage(), ['effect' => $effectId]);
            return false;
        }
    }
}
