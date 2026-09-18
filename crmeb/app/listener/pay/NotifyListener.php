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

namespace app\listener\pay;


use app\services\pay\PayNotifyServices;
use crmeb\utils\Hook;

/**
 * 支付异步回调
 * Class NotifyListener
 * @package app\listener\pay
 */
class NotifyListener
{
    /**
     * @param $event
     * @return bool
     * @throws \Psr\SimpleCache\InvalidArgumentException
     */
    public function handle($event)
    {
        [$notify, $payType] = $event;
        // Only the retained shop order can produce a notification: member cards,
        // recharges and their `wechat` message type are gone.
        if ($payType !== 'weixin' || ($notify['attach'] ?? '') !== 'product') return false;

        if (($count = strpos($notify['out_trade_no'], '_')) !== false) {
            $notify['out_trade_no'] = substr($notify['out_trade_no'], $count + 1);
        }
        $payment = [
            'paid_amount' => $notify['paid_amount'] ?? null,
            'currency' => $notify['currency'] ?? null,
            'merchant_id' => $notify['merchant_id'] ?? null,
        ];
        if (!$this->merchantMatches($payment['merchant_id'], $payType)) {
            return false;
        }
        return (new Hook(PayNotifyServices::class, 'wechat'))->listen(
            $notify['attach'],
            $notify['out_trade_no'],
            $notify['transaction_id'],
            $payType,
            $payment
        );
    }

    private function merchantMatches($merchantId, string $payType): bool
    {
        if ($merchantId === null || $merchantId === '') {
            return true;
        }
        $configured = array_filter([
            (string)sys_config('pay_weixin_mchid'),
            (string)sys_config('pay_sub_merchant_id'),
            (string)sys_config('pay_new_weixin_mchid'),
        ]);
        foreach ($configured as $expected) {
            if (hash_equals($expected, (string)$merchantId)) {
                return true;
            }
        }
        return false;
    }
}
