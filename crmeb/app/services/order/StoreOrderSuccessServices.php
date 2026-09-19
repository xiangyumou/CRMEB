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


use app\dao\order\StoreOrderDao;
use app\jobs\OrderEffectJob;
use app\services\activity\combination\StorePinkServices;
use app\services\BaseServices;
use app\services\pay\PayServices;
use crmeb\exceptions\ApiException;
use think\facade\Log;

/**
 * Class StoreOrderSuccessServices
 * @package app\services\order
 * @method getOne(array $where, ?string $field = '*', array $with = []) 获取去一条数据
 */
class StoreOrderSuccessServices extends BaseServices
{
    /**
     *
     * StoreOrderSuccessServices constructor.
     * @param StoreOrderDao $dao
     */
    public function __construct(StoreOrderDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 0元支付
     * @param array $orderInfo
     * @param int $uid
     * @return bool
     * @throws \think\Exception
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\ModelNotFoundException
     * @throws \think\exception\DbException
     */
    public function zeroYuanPayment(array $orderInfo, int $uid, string $payType = PayServices::WEIXIN_PAY)
    {
        if ($orderInfo['paid']) {
            throw new ApiException('该订单已支付');
        }
        return $this->paySuccess($orderInfo, $payType);//余额支付成功
    }

    /**
     * 支付成功
     *
     * 支付状态、拼团建团、支付尝试结论和待执行副作用必须一次提交：任何一步失败都不能
     * 留下"已收款但没有履约"的订单。通知、推送、打印等外部动作不能在事务提交前发出，
     * 只登记副作用，提交之后再执行，失败的记录由队列和定时任务补投。
     *
     * @param array $orderInfo
     * @param string $paytype
     * @param array $other
     * @return bool
     * @throws \Psr\SimpleCache\InvalidArgumentException
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function paySuccess(array $orderInfo, string $paytype = PayServices::WEIXIN_PAY, array $other = [])
    {
        $orderId = (int)$orderInfo['id'];
        $updata = ['paid' => 1, 'pay_type' => $paytype, 'pay_time' => time()];
        $orderInfo['pay_time'] = $updata['pay_time'];
        $orderInfo['pay_type'] = $paytype;
        if ($other && isset($other['trade_no'])) {
            $updata['trade_no'] = $other['trade_no'];
        }
        $outTradeNo = (string)($other['out_trade_no'] ?? '');

        /** @var StoreOrderPaymentAttemptServices $attemptServices */
        $attemptServices = app()->make(StoreOrderPaymentAttemptServices::class);
        /** @var StoreOrderEffectServices $effectServices */
        $effectServices = app()->make(StoreOrderEffectServices::class);

        $paid = $this->transaction(function () use ($orderInfo, $orderId, $updata, $attemptServices, $effectServices, $outTradeNo) {
            //未支付、未被取消的订单才能完成支付，取消释放出去的库存不会再被占用
            if (!$this->dao->markPaid($orderId, $updata)) {
                return false;
            }
            if ($orderInfo['combination_id'] && !$orderInfo['refund_status']) {
                /** @var StorePinkServices $pinkServices */
                $pinkServices = app()->make(StorePinkServices::class);
                /** @var StoreOrderServices $orderServices */
                $orderServices = app()->make(StoreOrderServices::class);
                if (!$pinkServices->createPink($orderServices->tidyOrder($orderInfo, true))) {
                    //建团失败必须回滚整个支付事务，否则回调重试时订单已支付，建团永远不会执行
                    throw new ApiException('拼团创建失败');
                }
            }
            if ($outTradeNo !== '') {
                $attemptServices->markPaidByOutTradeNo($outTradeNo, (string)($updata['trade_no'] ?? ''));
            }
            $attemptServices->closeRemaining($orderId);
            $effectId = $effectServices->record($orderId, StoreOrderEffectServices::EVENT_PAY_SUCCESS, [
                'trade_no' => (string)($updata['trade_no'] ?? ''),
                'out_trade_no' => $outTradeNo,
            ]);
            return $effectId;
        });
        if (!$paid) {
            return false;
        }
        //事务提交之后再执行外部动作：队列可用时由消费者执行，队列关闭时同步执行。
        //执行失败或进程中断留下的待处理记录，由定时任务补投。
        try {
            // 参数必须是参数数组：传裸值会被当成方法名，通知会静默丢失。
            OrderEffectJob::dispatch([(int)$paid]);
        } catch (\Throwable $e) {
            Log::error('订单支付后置动作执行失败:' . $e->getMessage(), ['order_id' => $orderId]);
        }
        return true;
    }

}
