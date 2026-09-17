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

use app\services\order\StoreOrderSuccessServices;

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
            $orderInfo = $services->getOne(['order_id' => $order_id]);
            if (!$orderInfo) return true;
            if (array_key_exists('paid_amount', $payment)
                && !$this->paymentMatches((string)$orderInfo->pay_price, $payment)) return false;
            if ($orderInfo->paid) return true;
            $success = $services->paySuccess($orderInfo->toArray(), $payType, ['trade_no' => $trade_no]);
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
