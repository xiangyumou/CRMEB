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

namespace app\services\pay;

use app\services\order\StoreOrderPaymentAttemptServices;
use app\services\order\StoreOrderSuccessServices;
use think\facade\Log;

/**
 * 支付成功回调 所有的异步通知回调都会走下面的三个方法,不在取分微信/支付宝支付回调
 * Class PayNotifyServices
 * @package app\services\pay
 */
class PayNotifyServices
{

    /**
     * 订单支付成功之后
     * @param string|null $order_id 订单id
     * @param string|null $trade_no
     * @param string $payType
     * @return bool
     * @throws \Psr\SimpleCache\InvalidArgumentException
     */
    public function wechatProduct(string $order_id = null, string $trade_no = null, string $payType = PayServices::WEIXIN_PAY, array $payment = [])
    {
        try {
            /** @var StoreOrderSuccessServices $services */
            $services = app()->make(StoreOrderSuccessServices::class);
            $outTradeNo = (string)$order_id;
            /**
             * 商户订单号会随付款人改写，只按当前 order_id 查会把迟到回调路由到
             * 不存在的订单。先用落库的支付尝试记录定位真正的订单。
             */
            $attempt = $outTradeNo === ''
                ? null
                : app()->make(StoreOrderPaymentAttemptServices::class)->findByOutTradeNo($outTradeNo);
            $orderInfo = $attempt ? $services->getOne(['id' => (int)$attempt['store_order_id']]) : null;
            if (!$orderInfo) {
                $orderInfo = $services->getOne(['order_id' => $order_id]);
            }
            if (!$orderInfo) {
                //历史遗留或非本店的回调：保留原有确认行为，但留下可追查的记录
                Log::warning('微信支付回调未匹配到订单', ['out_trade_no' => $outTradeNo, 'trade_no' => $trade_no]);
                return true;
            }
            if (array_key_exists('paid_amount', $payment)
                && !$this->paymentMatches((string)$orderInfo->pay_price, $payment)) return false;
            if ($orderInfo->paid) {
                if ($attempt) {
                    app()->make(StoreOrderPaymentAttemptServices::class)->markPaidByOutTradeNo($outTradeNo, (string)$trade_no);
                }
                return true;
            }
            if ((int)($orderInfo->is_cancel ?? 0) === 1) {
                //取消流程会先关闭网关支付单；此处仍收到回调说明两侧状态不一致，
                //既不能当作支付成功，也不能吞掉
                Log::error('微信支付回调命中的订单已取消', ['out_trade_no' => $outTradeNo, 'order_id' => $orderInfo->id]);
                return false;
            }
            $other = ['trade_no' => $trade_no];
            if ($attempt) {
                $other['out_trade_no'] = $outTradeNo;
            }
            $success = $services->paySuccess($orderInfo->toArray(), $payType, $other);
            if (!$success) {
                $orderInfo = $services->getOne(['order_id' => $order_id]);
                return $orderInfo && $orderInfo->paid;
            }
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }

    private function paymentMatches(string $expectedAmount, array $payment): bool
    {
        if (!array_key_exists('paid_amount', $payment) || $payment['paid_amount'] === null) {
            return true;
        }
        $amount = (string)$payment['paid_amount'];
        $currency = strtoupper((string)($payment['currency'] ?? 'CNY'));
        if ($currency !== 'CNY' || !preg_match('/^\d+(?:\.\d{1,2})?$/', $amount)) {
            return false;
        }
        return bccomp($expectedAmount, $amount, 2) === 0;
    }

}
