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
     *
     * 尝试的驱动、商户、应用、渠道、金额和付款人一旦落库就不可被覆盖：同一
     * 商户订单号再次发起支付时，只有上下文完全一致才是同一笔尝试（幂等重放）；
     * 上下文变化说明配置或付款人变了，必须停下来提示人工处理，绝不悄悄改写
     * 已提交给网关的事实。
     *
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
        $identity = [
            'driver' => (string)$driver,
            'mch_id' => (string)($context['mch_id'] ?? ''),
            'app_id' => (string)($context['app_id'] ?? ''),
            'channel' => (string)($context['channel'] ?? ''),
            'pay_type' => (string)($context['pay_type'] ?? ''),
            'total_fee' => (string)($context['total_fee'] ?? '0'),
            'pay_uid' => (string)(int)($context['pay_uid'] ?? 0),
        ];
        $existing = $this->dao->getByOutTradeNo($outTradeNo);
        if ($existing) {
            // 同一个商户订单号只保留一条尝试记录
            if ((int)$existing['store_order_id'] !== $storeOrderId) {
                throw new ApiException('商户订单号已被占用，无法发起支付');
            }
            $stored = [
                'driver' => (string)$existing['driver'],
                'mch_id' => (string)$existing['mch_id'],
                'app_id' => (string)$existing['app_id'],
                'channel' => (string)$existing['channel'],
                'pay_type' => (string)$existing['pay_type'],
                'total_fee' => (string)$existing['total_fee'],
                'pay_uid' => (string)(int)$existing['pay_uid'],
            ];
            foreach ($identity as $field => $value) {
                if ($field === 'total_fee') {
                    //金额按固定两位小数比较，不受表示方式影响
                    if (bccomp($stored[$field] === '' ? '0' : $stored[$field], $value === '' ? '0' : $value, 2) !== 0) {
                        throw new ApiException('支付尝试上下文已变化（金额），请人工核对后处理');
                    }
                    continue;
                }
                if ($stored[$field] !== $value) {
                    throw new ApiException('支付尝试上下文已变化（驱动、商户、应用、渠道或付款人），请人工核对后处理');
                }
            }
            if ((int)$existing['status'] === StoreOrderPaymentAttempt::STATUS_UNKNOWN) {
                throw new ApiException('该支付存在未确认的网关结果，请人工核对后处理');
            }
            if ((int)$existing['status'] === StoreOrderPaymentAttempt::STATUS_PAID) {
                throw new ApiException('该支付尝试已确认收款，无法重复发起');
            }
            if ((int)$existing['status'] !== StoreOrderPaymentAttempt::STATUS_SUBMITTED) {
                //已被本地关闭的尝试（例如上一次创建被拒绝）在上下文一致的前提下重新打开
                $this->dao->update((int)$existing['id'], [
                    'status' => StoreOrderPaymentAttempt::STATUS_SUBMITTED,
                    'last_result' => '',
                    'update_time' => $now,
                ]);
            }
            $row = $this->dao->get((int)$existing['id']);
            return $row ? $row->toArray() : $existing->toArray();
        }
        $this->dao->save([
            'store_order_id' => $storeOrderId,
            'out_trade_no' => $outTradeNo,
            'driver' => $identity['driver'],
            'mch_id' => $identity['mch_id'],
            'app_id' => $identity['app_id'],
            'channel' => $identity['channel'],
            'pay_type' => $identity['pay_type'],
            'total_fee' => $identity['total_fee'],
            'pay_uid' => (int)$identity['pay_uid'],
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
     * 当前配置下按渠道落库的商户/应用身份
     *
     * 只保存配置身份信息，不保存密钥；回调与结算用它和当前配置对账。
     * @param int $channel
     * @return array{mch_id:string,app_id:string}
     */
    public function configIdentity(int $channel): array
    {
        $newMiniOpen = (bool)sys_config('pay_new_weixin_open');
        $mchId = ($newMiniOpen && $channel === 1)
            ? (string)sys_config('pay_new_weixin_mchid')
            : (string)sys_config('pay_weixin_mchid');
        $subMch = trim((string)sys_config('pay_sub_merchant_id'));
        if ($subMch !== '' && !($newMiniOpen && $channel === 1)) {
            $mchId = $subMch;
        }
        if ($channel === 1) {
            $appId = (string)sys_config('routine_appId');
        } elseif ($channel === 4) {
            $appId = (string)sys_config('wechat_app_appid');
        } else {
            $appId = (string)sys_config('wechat_appid');
        }

        return ['mch_id' => trim((string)$mchId), 'app_id' => trim((string)$appId)];
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
