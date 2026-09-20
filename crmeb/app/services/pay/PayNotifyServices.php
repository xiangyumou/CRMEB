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
use app\services\order\StoreOrderPaymentExceptionServices;
use app\services\order\StoreOrderSuccessServices;
use app\model\order\StoreOrderPaymentException;
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
            /** @var StoreOrderPaymentAttemptServices $attemptServices */
            $attemptServices = app()->make(StoreOrderPaymentAttemptServices::class);
            $attempt = $outTradeNo === ''
                ? null
                : $attemptServices->findByOutTradeNo($outTradeNo);
            $orderInfo = $attempt ? $services->getOne(['id' => (int)$attempt['store_order_id']]) : null;
            if (!$orderInfo) {
                $orderInfo = $services->getOne(['order_id' => $order_id]);
            }
            if (!$orderInfo) {
                //无法归属的收款：持久化异常记录（含告警），提交成功后确认收到，
                //让网关停止重试；提交失败则返回失败要求网关重试
                $this->recordPaymentException(
                    (int)($attempt['store_order_id'] ?? 0),
                    (int)($attempt['id'] ?? 0),
                    (string)$trade_no,
                    (string)$outTradeNo,
                    $payment,
                    StoreOrderPaymentException::REASON_UNMATCHED
                );
                return true;
            }
            if (array_key_exists('paid_amount', $payment)
                && !$this->paymentMatches((string)$orderInfo->pay_price, $payment)) return false;
            if ($orderInfo->paid) {
                //同交易号的重复通知幂等确认；不同交易号说明这是一笔真实的
                //第二笔收款，必须落异常记录，不能当作第一笔的重复通知吞掉
                $knownTrade = trim((string)($orderInfo->trade_no ?? '')) ?: trim((string)($attempt['trade_no'] ?? ''));
                if ((string)$trade_no !== '' && $knownTrade !== '' && (string)$trade_no !== $knownTrade) {
                    $this->recordPaymentException(
                        (int)$orderInfo->id,
                        (int)($attempt['id'] ?? 0),
                        (string)$trade_no,
                        (string)$outTradeNo,
                        $payment,
                        StoreOrderPaymentException::REASON_DUPLICATE
                    );
                } elseif ($attempt) {
                    $attemptServices->markPaidByOutTradeNo($outTradeNo, (string)$trade_no);
                }
                return true;
            }
            if ((int)($orderInfo->is_cancel ?? 0) === 1) {
                //取消流程已经核验过网关；此时仍收到收款回调，两侧状态不一致，
                //钱已经收了但不能追加履约：落异常收款记录，由人工核对退款
                $this->recordPaymentException(
                    (int)$orderInfo->id,
                    (int)($attempt['id'] ?? 0),
                    (string)$trade_no,
                    (string)$outTradeNo,
                    $payment,
                    StoreOrderPaymentException::REASON_CANCELLED
                );
                return true;
            }
            $other = ['trade_no' => $trade_no];
            if ($attempt) {
                $other['out_trade_no'] = $outTradeNo;
            }
            $success = $services->paySuccess($orderInfo->toArray(), $payType, $other);
            if (!$success) {
                //另一条回调可能已经抢先完成了订单。不能只用 paid=true
                //吞掉不同交易号，否则第二笔真实收款不会进入人工核对队列。
                $finalOrder = $attempt
                    ? $services->getOne(['id' => (int)$attempt['store_order_id']])
                    : $services->getOne(['order_id' => $order_id]);
                if (!$finalOrder) return false;
                $knownTrade = trim((string)($finalOrder->trade_no ?? ''));
                if ($finalOrder->paid) {
                    if ($knownTrade !== '' && trim((string)$trade_no) !== '' && $knownTrade !== trim((string)$trade_no)) {
                        $this->recordPaymentException(
                            (int)$finalOrder->id,
                            (int)($attempt['id'] ?? 0),
                            (string)$trade_no,
                            (string)$outTradeNo,
                            $payment,
                            StoreOrderPaymentException::REASON_DUPLICATE
                        );
                    }
                    return true;
                }
                if ((int)($finalOrder->is_cancel ?? 0) === 1) {
                    $this->recordPaymentException(
                        (int)$finalOrder->id,
                        (int)($attempt['id'] ?? 0),
                        (string)$trade_no,
                        (string)$outTradeNo,
                        $payment,
                        StoreOrderPaymentException::REASON_CANCELLED
                    );
                }
                return false;
            }
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * 持久化一笔异常收款并附带冻结的支付上下文
     *
     * 记录提交成功才返回（调用方随后向网关确认）；提交失败抛出，让网关重试。
     */
    private function recordPaymentException(
        int $storeOrderId,
        int $attemptId,
        string $tradeNo,
        string $outTradeNo,
        array $payment,
        string $reason
    ): void {
        /** @var StoreOrderPaymentExceptionServices $exceptions */
        $exceptions = app()->make(StoreOrderPaymentExceptionServices::class);
        $driver = '';
        $channel = 0;
        $attempt = null;
        if ($attemptId > 0) {
            $attempt = app()->make(StoreOrderPaymentAttemptServices::class)->get($attemptId);
            if ($attempt) {
                $driver = (string)$attempt['driver'];
                $channel = (int)$attempt['channel'];
            }
        }
        if ($driver === '') {
            $driver = sys_config('pay_wechat_type') == 1 ? 'v3_wechat_pay' : 'wechat_pay';
        }
        $paymentContext = json_decode((string)($attempt['payment_context'] ?? ''), true);
        $paymentContext = is_array($paymentContext) ? $paymentContext : [];
        if (!array_key_exists('pay_new_weixin_open', $paymentContext)) {
            $paymentContext['pay_new_weixin_open'] = (bool)sys_config('pay_new_weixin_open');
        }
        $exceptions->record([
            'store_order_id' => $storeOrderId,
            'payment_attempt_id' => $attemptId,
            'mch_id' => (string)($payment['merchant_id'] ?? ''),
            'trade_no' => $tradeNo,
            'out_trade_no' => $outTradeNo,
            'reason' => $reason,
            'paid_amount' => (string)($payment['paid_amount'] ?? '0'),
            'currency' => (string)($payment['currency'] ?? 'CNY'),
            'payment_context' => [
                'driver' => $driver,
                'channel' => $channel,
                'out_trade_no' => $outTradeNo,
                'mch_id' => (string)($attempt['mch_id'] ?? ($payment['merchant_id'] ?? '')),
                'app_id' => (string)($attempt['app_id'] ?? ''),
                'total_fee' => (string)($attempt['total_fee'] ?? ($payment['paid_amount'] ?? '0')),
                'pay_new_weixin_open' => (bool)$paymentContext['pay_new_weixin_open'],
            ],
        ]);
        //只有异常记录提交成功后，才把这笔实际收款标记为已支付。这样关单
        //任务不会再把已经收款的尝试当作仍可关闭的支付单。
        if ($attemptId > 0 && $tradeNo !== '') {
            app()->make(StoreOrderPaymentAttemptServices::class)->markExceptionPaid(
                $attemptId,
                $tradeNo,
                'callback:exception:' . $reason
            );
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
