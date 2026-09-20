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
use app\services\product\product\StoreProductCouponServices;
use app\services\statistic\CapitalFlowServices;
use app\services\user\UserServices;
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
            /**
             * 本地履约与支付状态同一次提交：订单状态记录、商品赠券、支付流水、
             * 虚拟商品分配、开票状态都必须与"已支付"一起成功或一起回滚。
             * 任何一步失败都不允许留下"已收款但没有履约"的订单。
             */
            $paidOrder = $this->dao->get($orderId);
            $paidOrderInfo = $paidOrder ? $paidOrder->toArray() : $orderInfo;
            $this->fulfillLocally($paidOrderInfo, $updata);
            //外部动作按目标拆分登记：某一条通知失败不会让流水、发卡或打印重跑
            $closeTaskIds = [];
            $paidAttemptId = 0;
            if ($outTradeNo !== '') {
                $paidAttempt = $attemptServices->findByOutTradeNo($outTradeNo);
                $paidAttemptId = (int)($paidAttempt['id'] ?? 0);
            }
            $closeTaskIds = $effectServices->recordCloseTasks($orderId, $paidAttemptId > 0 ? [$paidAttemptId] : []);
            $effectId = $effectServices->record($orderId, StoreOrderEffectServices::EVENT_PAY_NOTICE, [
                'trade_no' => (string)($updata['trade_no'] ?? ''),
                'out_trade_no' => $outTradeNo,
            ]);
            $effectServices->record($orderId, StoreOrderEffectServices::EVENT_PAY_PRINT, ['trade_no' => (string)($updata['trade_no'] ?? '')]);
            $effectServices->record($orderId, StoreOrderEffectServices::EVENT_PAY_INVOICE, ['trade_no' => (string)($updata['trade_no'] ?? '')]);
            return ['effect_id' => $effectId, 'close_task_ids' => $closeTaskIds];
        });
        if (!$paid) {
            return false;
        }
        //事务提交之后再执行外部动作：队列可用时由消费者执行，队列关闭时同步执行。
        //执行失败或进程中断留下的待处理记录，由定时任务补投。
        try {
            foreach (array_merge([$paid['effect_id']], $paid['close_task_ids']) as $effectId) {
                // 参数必须是参数数组：传裸值会被当成方法名，通知会静默丢失。
                OrderEffectJob::dispatch([(int)$effectId]);
            }
        } catch (\Throwable $e) {
            Log::error('订单支付后置动作执行失败:' . $e->getMessage(), ['order_id' => $orderId]);
        }
        return true;
    }

    /**
     * 本地履约：与支付状态在同一个事务里提交，失败则整笔支付回滚
     *
     * 只做本地写入（订单状态记录、商品赠券、支付流水、虚拟商品分配、开票
     * 状态），不发出任何外部调用。每一步都按订单自身状态幂等，重复执行不会
     * 重复赠券、重复记流水或重复发卡。
     *
     * @param array $orderInfo
     * @param array $updata 支付更新（含 pay_type、trade_no）
     * @return void
     */
    private function fulfillLocally(array $orderInfo, array $updata): void
    {
        $orderId = (int)$orderInfo['id'];
        $payType = (string)($updata['pay_type'] ?? $orderInfo['pay_type'] ?? '');
        $orderInfo['pay_type'] = $payType;
        $orderInfo['trade_no'] = (string)($updata['trade_no'] ?? $orderInfo['trade_no'] ?? '');

        //写入订单状态事件（同一订单同一事件只写一次）
        /** @var StoreOrderStatusServices $statusService */
        $statusService = app()->make(StoreOrderStatusServices::class);
        if (!$statusService->count(['oid' => $orderId, 'change_type' => 'pay_success'])) {
            $statusService->save([
                'oid' => $orderId,
                'change_type' => 'pay_success',
                'change_message' => '用户付款成功',
                'change_time' => time(),
            ]);
        }

        //赠送购买商品优惠券，仅普通商品订单才会赠送；发放记录随支付一起提交，
        //重复执行按已发放记录跳过
        if (!$orderInfo['seckill_id'] && !$orderInfo['bargain_id'] && !$orderInfo['combination_id']) {
            /** @var StoreProductCouponServices $couponServices */
            $couponServices = app()->make(StoreProductCouponServices::class);
            $couponServices->giveOrderProductCoupon((int)$orderInfo['uid'], $orderId);
        }

        //虚拟商品本地分配：原子占用一张卡密，同一张卡不会发给两个订单
        if (in_array((int)$orderInfo['virtual_type'], [1, 2], true) && (int)$orderInfo['combination_id'] === 0) {
            /** @var StoreOrderDeliveryServices $deliveryServices */
            $deliveryServices = app()->make(StoreOrderDeliveryServices::class);
            if ((int)$orderInfo['virtual_type'] === 1) {
                $deliveryServices->assignVirtualGoods($orderInfo);
            } else {
                $deliveryServices->assignVirtualCoupon($orderInfo);
            }
        }

        //支付流水：同一订单只记一条，重试不会重复入账
        if ($payType === PayServices::WEIXIN_PAY) {
            /** @var CapitalFlowServices $capitalFlowServices */
            $capitalFlowServices = app()->make(CapitalFlowServices::class);
            if (!$capitalFlowServices->hasOrderFlow((string)$orderInfo['order_id'], 'order')) {
                /** @var UserServices $userServices */
                $userServices = app()->make(UserServices::class);
                $userInfo = $userServices->get((int)$orderInfo['uid']);
                $orderInfo['nickname'] = $userInfo['nickname'] ?? '';
                $orderInfo['phone'] = $userInfo['phone'] ?? '';
                $capitalFlowServices->setFlow($orderInfo, 'order');
            }
        }

        //开票数据支付状态
        app()->make(StoreOrderInvoiceServices::class)->update(['order_id' => $orderId], ['is_pay' => 1]);
    }

}
