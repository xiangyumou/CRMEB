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

use app\services\order\StoreOrderInvoiceServices;
use app\services\order\StoreOrderEffectServices;
use crmeb\basic\BaseJobs;
use crmeb\traits\QueueTrait;

class OrderInvoiceJob extends BaseJobs
{
    use QueueTrait;

    /**
     * 自动开票队列
     * @param $id
     * @return bool
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2024/5/16
     */
    public function autoInvoice($id, $effectId = 0)
    {
        try {
            if (sys_config('elec_invoice', 1) != 1) {
                if ((int)$effectId > 0) app()->make(StoreOrderEffectServices::class)->markAsyncDone((int)$effectId);
                return true;
            }
            /** @var StoreOrderInvoiceServices $services */
            $services = app()->make(StoreOrderInvoiceServices::class);
            $services->invoiceIssuance($id);
            if ((int)$effectId > 0) app()->make(StoreOrderEffectServices::class)->markAsyncDone((int)$effectId);
        } catch (\Throwable $e) {
            if ((int)$effectId > 0) {
                app()->make(StoreOrderEffectServices::class)->markAsyncUnknown((int)$effectId, $e->getMessage());
            }
        }
        return true;
    }

    /**
     * 自动冲红队列
     * @param $id
     * @return bool
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2024/5/16
     */
    public function autoInvoiceRed($id)
    {
        try {
            if (sys_config('elec_invoice', 1) != 1) {
                return true;
            }
            /** @var StoreOrderInvoiceServices $services */
            $services = app()->make(StoreOrderInvoiceServices::class);
            $services->redInvoiceIssuance($id);
        } catch (\Exception $e) {
        }
        return true;
    }
}
