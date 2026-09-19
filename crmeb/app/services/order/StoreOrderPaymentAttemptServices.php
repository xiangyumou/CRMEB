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

namespace app\services\order;

use app\dao\order\StoreOrderPaymentAttemptDao;
use app\model\order\StoreOrderPaymentAttempt;
use app\services\BaseServices;
use crmeb\exceptions\ApiException;

/**
 * 订单支付尝试记录
 *
 * 调用网关之前先落库，回调据此定位订单；订单表的 order_id 会随付款人改写，
 * 只依赖当前 order_id 会把迟到回调路由到不存在的订单。
 *
 * Class StoreOrderPaymentAttemptServices
 * @package app\services\order
 */
class StoreOrderPaymentAttemptServices extends BaseServices
{
    /**
     * StoreOrderPaymentAttemptServices constructor.
     * @param StoreOrderPaymentAttemptDao $dao
     */
    public function __construct(StoreOrderPaymentAttemptDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 记录一次支付尝试，商户订单号唯一
     * @param int $storeOrderId
     * @param string $outTradeNo
     * @param string $driver
     * @param array $context
     * @return array
     * @throws \think\db\exception\DbException
     */
    public function record(int $storeOrderId, string $outTradeNo, string $driver, array $context = []): array
    {
        $now = time();
        $existing = $this->dao->getByOutTradeNo($outTradeNo);
        if ($existing) {
            // 同一个商户订单号只保留一条尝试记录，重复发起时刷新上下文即可
            if ((int)$existing['store_order_id'] !== $storeOrderId) {
                throw new ApiException('商户订单号已被占用，无法发起支付');
            }
            $this->dao->update((int)$existing['id'], [
                'driver' => $driver,
                'mch_id' => (string)($context['mch_id'] ?? ''),
                'app_id' => (string)($context['app_id'] ?? ''),
                'channel' => (string)($context['channel'] ?? ''),
                'pay_type' => (string)($context['pay_type'] ?? ''),
                'total_fee' => (string)($context['total_fee'] ?? '0'),
                'pay_uid' => (int)($context['pay_uid'] ?? 0),
                'update_time' => $now,
            ]);
            $row = $this->dao->getForUpdate((int)$existing['id']);
            return $row ? $row->toArray() : $existing->toArray();
        }
        $this->dao->save([
            'store_order_id' => $storeOrderId,
            'out_trade_no' => $outTradeNo,
            'driver' => $driver,
            'mch_id' => (string)($context['mch_id'] ?? ''),
            'app_id' => (string)($context['app_id'] ?? ''),
            'channel' => (string)($context['channel'] ?? ''),
            'pay_type' => (string)($context['pay_type'] ?? ''),
            'total_fee' => (string)($context['total_fee'] ?? '0'),
            'pay_uid' => (int)($context['pay_uid'] ?? 0),
            'status' => StoreOrderPaymentAttempt::STATUS_SUBMITTED,
            'trade_no' => '',
            'last_result' => '',
            'add_time' => $now,
            'update_time' => $now,
        ]);
        $row = $this->dao->getByOutTradeNo($outTradeNo);
        if (!$row) {
            throw new ApiException('支付尝试记录写入失败');
        }
        return $row->toArray();
    }

    /**
     * 按商户订单号定位尝试记录
     * @param string $outTradeNo
     * @return array|null
     */
    public function findByOutTradeNo(string $outTradeNo): ?array
    {
        if ($outTradeNo === '') return null;
        $row = $this->dao->getByOutTradeNo($outTradeNo);
        return $row ? $row->toArray() : null;
    }

    /**
     * 订单下仍未关闭的尝试记录
     * @param int $storeOrderId
     * @return array
     */
    public function openAttempts(int $storeOrderId): array
    {
        return $this->dao->getOpenAttempts($storeOrderId);
    }

    /**
     * 更新尝试结论
     * @param int $id
     * @param int $status
     * @param string $result
     * @param string $tradeNo
     * @return void
     */
    public function mark(int $id, int $status, string $result = '', string $tradeNo = ''): void
    {
        $data = ['status' => $status, 'last_result' => $this->trim($result), 'update_time' => time()];
        if ($tradeNo !== '') $data['trade_no'] = $tradeNo;
        $this->dao->update($id, $data);
    }

    /**
     * 按商户订单号标记已支付
     * @param string $outTradeNo
     * @param string $tradeNo
     * @return void
     */
    public function markPaidByOutTradeNo(string $outTradeNo, string $tradeNo): void
    {
        $row = $this->dao->getByOutTradeNo($outTradeNo);
        if (!$row) return;
        $this->mark((int)$row['id'], StoreOrderPaymentAttempt::STATUS_PAID, 'callback:paid', $tradeNo);
    }

    /**
     * 订单支付完成后关闭其余未决尝试
     * @param int $storeOrderId
     * @return void
     */
    public function closeRemaining(int $storeOrderId): void
    {
        foreach ($this->dao->getOpenAttempts($storeOrderId) as $attempt) {
            $this->mark((int)$attempt['id'], StoreOrderPaymentAttempt::STATUS_CLOSED, 'order:paid');
        }
    }

    /**
     * 截断超长的网关结论，避免写爆列
     * @param string $value
     * @return string
     */
    private function trim(string $value): string
    {
        return mb_substr($value, 0, 240);
    }
}
