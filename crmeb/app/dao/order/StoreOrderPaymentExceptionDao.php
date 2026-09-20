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
use app\model\order\StoreOrderPaymentException;

/**
 * 异常收款记录
 * Class StoreOrderPaymentExceptionDao
 * @package app\dao\order
 */
class StoreOrderPaymentExceptionDao extends BaseDao
{
    /**
     * 设置模型
     * @return string
     */
    protected function setModel(): string
    {
        return StoreOrderPaymentException::class;
    }

    /**
     * 按商户号+交易号取唯一记录（回调按交易号去重的依据）
     * @param string $mchId
     * @param string $tradeNo
     * @return array|\think\Model|null
     */
    public function getByTradeNo(string $mchId, string $tradeNo)
    {
        return $this->getOne(['mch_id' => $mchId, 'trade_no' => $tradeNo]);
    }

    /** @param int $id @return array|\think\Model|null */
    public function getForUpdate(int $id)
    {
        return $this->getModel()->where('id', $id)->lock(true)->find();
    }

    /**
     * 未解决的异常收款，老记录在前
     * @param int $limit
     * @return array
     */
    public function pendingList(int $limit = 50): array
    {
        return $this->getModel()
            ->whereIn('status', [
                StoreOrderPaymentException::STATUS_PENDING,
                StoreOrderPaymentException::STATUS_REFUND_PROCESSING,
                StoreOrderPaymentException::STATUS_REFUND_UNKNOWN,
            ])
            ->order('id')
            ->limit($limit)
            ->select()
            ->toArray();
    }
}
