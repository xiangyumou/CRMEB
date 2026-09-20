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

namespace app\jobs\notice;

use app\services\order\StoreOrderServices;
use app\services\order\StoreOrderEffectServices;
use crmeb\basic\BaseJobs;
use crmeb\traits\QueueTrait;
use think\facade\Log;

/**
 * 小票打印
 * Class PrintJob
 * @package app\jobs\notice
 */
class PrintJob extends BaseJobs
{
    use QueueTrait;

    /**
     * 小票打印
     * @param $id
     * @return bool|void
     */
    public function doJob($id, $print_type, $effectId = 0)
    {
        try {
            /** @var StoreOrderServices $orderServices */
            $orderServices = app()->make(StoreOrderServices::class);
            $orderServices->orderPrintTicket((int)$id, $print_type);
            if ((int)$effectId > 0) {
                app()->make(StoreOrderEffectServices::class)->markAsyncDone((int)$effectId);
            }
            return true;
        } catch (\Throwable $e) {
            Log::error('小票打印失败失败,失败原因:' . $e->getMessage());
            if ((int)$effectId > 0) {
                app()->make(StoreOrderEffectServices::class)->markAsyncUnknown((int)$effectId, $e->getMessage());
            }
            return true;
        }
    }
}
