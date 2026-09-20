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

namespace app\dao\order;

use app\dao\BaseDao;
use app\model\order\StoreOrderPaymentAttempt;

/**
 * 订单支付尝试记录
 * Class StoreOrderPaymentAttemptDao
 * @package app\dao\order
 */
class StoreOrderPaymentAttemptDao extends BaseDao
{
    /**
     * 设置模型
     * @return string
     */
    protected function setModel(): string
    {
        return StoreOrderPaymentAttempt::class;
    }

    /**
     * 按商户订单号取一条尝试记录
     * @param string $outTradeNo
     * @param bool $lock
     * @return array|\think\Model|null
     */
    public function getByOutTradeNo(string $outTradeNo, bool $lock = false)
    {
        $query = $this->getModel()->where('out_trade_no', $outTradeNo);
        if ($lock) $query->lock(true);
        return $query->find();
    }

    /**
     * 锁定一条尝试记录
     * @param int $id
     * @return array|\think\Model|null
     */
    public function getForUpdate(int $id)
    {
        return $this->getModel()->where('id', $id)->lock(true)->find();
    }

    /**
     * 条件状态迁移，避免并发回调覆盖创建中或已收款的结论。
     * @param int $id
     * @param int $from
     * @param array $data
     * @return int
     */
    public function transition(int $id, int $from, array $data): int
    {
        return (int)$this->getModel()->where('id', $id)->where('status', $from)->update($data);
    }

    /**
     * 订单下仍未关闭的尝试记录
     * @param int $storeOrderId
     * @return array
     */
    public function getOpenAttempts(int $storeOrderId): array
    {
        return $this->getModel()
            ->where('store_order_id', $storeOrderId)
            ->whereIn('status', [StoreOrderPaymentAttempt::STATUS_SUBMITTED, StoreOrderPaymentAttempt::STATUS_UNKNOWN, StoreOrderPaymentAttempt::STATUS_CREATING])
            ->order('id asc')
            ->select()->toArray();
    }
}
