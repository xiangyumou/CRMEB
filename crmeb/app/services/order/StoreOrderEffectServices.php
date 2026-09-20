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

use app\dao\order\StoreOrderEffectDao;
use app\model\order\StoreOrderEffect;
use app\model\order\StoreOrderPaymentAttempt;
use app\model\order\StoreOrderPaymentException;
use app\services\BaseServices;
use think\facade\Log;

/**
 * 订单支付后置副作用
 *
 * 支付事务里只登记"还需要做什么"，提交之后立即执行；执行失败或进程中断留下的
 * 记录由队列和定时任务补投。每条副作用按 (订单ID, 事件类型) 唯一，重复投递
 * 只会命中同一条记录。
 *
 * Class StoreOrderEffectServices
 * @package app\services\order
 */
class StoreOrderEffectServices extends BaseServices
{
    /** 支付成功后的通知、打印、开票、流水等后置动作 */
    const EVENT_PAY_SUCCESS = 'pay_success';
    /** 逐尝试关单任务前缀，完整事件名为 close_attempt.<支付尝试ID> */
    const EVENT_CLOSE_ATTEMPT_PREFIX = 'close_attempt.';

    /**
     * StoreOrderEffectServices constructor.
     * @param StoreOrderEffectDao $dao
     */
    public function __construct(StoreOrderEffectDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 登记一条副作用，与调用方所在事务一起提交
     * @param int $storeOrderId
     * @param string $eventType
     * @param array $payload
     * @return int 副作用记录ID
     * @throws \think\db\exception\DbException
     */
    public function record(int $storeOrderId, string $eventType, array $payload = []): int
    {
        $existing = $this->dao->getOne(['store_order_id' => $storeOrderId, 'event_type' => $eventType]);
        if ($existing) return (int)$existing['id'];
        $now = time();
        $effect = $this->dao->save([
            'store_order_id' => $storeOrderId,
            'event_type' => $eventType,
            'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'status' => StoreOrderEffect::STATUS_PENDING,
            'attempts' => 0,
            'last_error' => '',
            'add_time' => $now,
            'update_time' => $now,
        ]);
        return (int)$effect['id'];
    }

    /**
     * 为订单名下每一条未决支付尝试登记一条关单任务
     *
     * 支付成功事务调用本方法：本地不会再认领这些尝试，但网关侧的支付单必须
     * 逐条真实关闭，只有网关明确关闭成功才把尝试标记为已关闭。任务按尝试
     * 拆分，一条失败不影响其他尝试。
     *
     * @param int $storeOrderId
     * @param int[] $excludeAttemptIds 已确认支付、无需关单的尝试
     * @return int[] 关单任务的副作用记录ID
     */
    public function recordCloseTasks(int $storeOrderId, array $excludeAttemptIds = []): array
    {
        /** @var StoreOrderPaymentAttemptServices $attemptServices */
        $attemptServices = app()->make(StoreOrderPaymentAttemptServices::class);
        $taskIds = [];
        foreach ($attemptServices->openAttempts($storeOrderId) as $attempt) {
            if (in_array((int)$attempt['id'], $excludeAttemptIds, true)) {
                continue;
            }
            $taskIds[] = $this->record(
                $storeOrderId,
                self::EVENT_CLOSE_ATTEMPT_PREFIX . (int)$attempt['id'],
                ['attempt_id' => (int)$attempt['id']]
            );
        }
        return $taskIds;
    }

    /**
     * 需要处理或补投的副作用ID，供队列和定时任务重新投递
     * @param int $limit
     * @return array
     */
    public function pendingIds(int $limit = 50): array
    {
        return array_map('intval', $this->dao->pendingIds($limit));
    }

    /**
     * 执行一条副作用并记录结果
     * @param int $id
     * @return bool
     * @throws \think\db\exception\DbException
     */
    public function runById(int $id): bool
    {
        $effect = $this->dao->get($id);
        if (!$effect) return true;
        $effect = $effect->toArray();
        if ((int)$effect['status'] === StoreOrderEffect::STATUS_DONE) return true;
        return $this->runEffect($effect);
    }

    /**
     * 执行一条副作用
     * @param array $effect
     * @return bool
     */
    public function runEffect(array $effect): bool
    {
        $id = (int)$effect['id'];
        //只有领取成功的进程才能执行外部动作，队列与定时任务并发投递时不会重复执行
        if (!$this->dao->claim($id, (int)$effect['attempts'] + 1)) {
            return true;
        }
        try {
            $this->execute($effect);
            $this->dao->update($id, ['status' => StoreOrderEffect::STATUS_DONE, 'last_error' => '', 'update_time' => time()]);
            return true;
        } catch (\Throwable $e) {
            // 外部调用没有幂等能力，这里只能记录未知结果并等待补投或人工确认
            $this->dao->update($id, [
                'status' => StoreOrderEffect::STATUS_UNKNOWN,
                'last_error' => mb_substr($e->getMessage(), 0, 240),
                'update_time' => time(),
            ]);
            Log::error('订单后置副作用执行失败:' . $e->getMessage(), ['effect' => $id, 'type' => $effect['event_type']]);
            return false;
        }
    }

    /**
     * 按类型执行副作用
     * @param array $effect
     * @return void
     */
    private function execute(array $effect): void
    {
        $eventType = (string)$effect['event_type'];
        if (strpos($eventType, self::EVENT_CLOSE_ATTEMPT_PREFIX) === 0) {
            $this->closeAttempt($effect);
            return;
        }
        switch ($eventType) {
            case self::EVENT_PAY_SUCCESS:
                $this->paySuccess($effect['store_order_id']);
                break;
            default:
                throw new \RuntimeException('未知的订单副作用类型:' . $eventType);
        }
    }

    /**
     * 执行一条关单任务：向网关真实关单，只有明确关闭成功才修改尝试状态
     *
     * 查到已收款说明订单支付之外还有一笔真实收款：落异常收款记录（人工退款），
     * 不影响已支付订单本身。
     *
     * @param array $effect
     * @return void
     * @throws \RuntimeException 网关结果未知时抛出，任务标记未知等待补投
     */
    private function closeAttempt(array $effect): void
    {
        $payload = json_decode((string)$effect['payload'], true);
        $attemptId = (int)($payload['attempt_id'] ?? 0);
        $attemptId = $attemptId ?: (int)substr((string)$effect['event_type'], strlen(self::EVENT_CLOSE_ATTEMPT_PREFIX));
        /** @var StoreOrderPaymentAttemptServices $attemptServices */
        $attemptServices = app()->make(StoreOrderPaymentAttemptServices::class);
        $attempt = $attemptServices->get($attemptId);
        if (!$attempt) {
            return; //尝试已不存在：任务完成
        }
        $attempt = $attempt->toArray();
        /** @var \app\services\pay\PayTradeServices $payTrade */
        $payTrade = app()->make(\app\services\pay\PayTradeServices::class);
        $result = $payTrade->settleResult($attempt);
        if (!empty($result['identity_mismatch'])) {
            throw new \RuntimeException('支付配置与记录身份不匹配，请人工核对后处理');
        }
        if ($result['state'] === \app\services\pay\PayTradeServices::STATE_CLOSED) {
            $attemptServices->mark($attemptId, StoreOrderPaymentAttempt::STATUS_CLOSED, 'close-task:closed');
            return;
        }
        if ($result['state'] === \app\services\pay\PayTradeServices::STATE_PAID) {
            //第二笔真实收款：落异常收款记录，由人工核对退款，不再动订单
            /** @var StoreOrderPaymentExceptionServices $exceptions */
            $exceptions = app()->make(StoreOrderPaymentExceptionServices::class);
            $exceptions->record([
                'store_order_id' => (int)$effect['store_order_id'],
                'payment_attempt_id' => $attemptId,
                'mch_id' => (string)($attempt['mch_id'] ?? ''),
                'trade_no' => (string)($result['trade_no'] ?? ''),
                'out_trade_no' => (string)($attempt['out_trade_no'] ?? ''),
                'reason' => StoreOrderPaymentException::REASON_DUPLICATE,
                'paid_amount' => (string)($attempt['total_fee'] ?? '0'),
                'currency' => 'CNY',
                'payment_context' => [
                    'driver' => (string)($attempt['driver'] ?? ''),
                    'channel' => (int)($attempt['channel'] ?? 0),
                    'out_trade_no' => (string)($attempt['out_trade_no'] ?? ''),
                ],
            ]);
            $attemptServices->mark($attemptId, StoreOrderPaymentAttempt::STATUS_PAID, 'close-task:paid', (string)($result['trade_no'] ?? ''));
            return;
        }
        //未知或查无此单：保留尝试状态，等待补投或人工核对
        throw new \RuntimeException(empty($result['not_exist'])
            ? '关单结果未知，稍后重试'
            : '网关查无此单但本地曾发起创建，保持待核对，请人工确认');
    }

    /**
     * 订单支付成功后的通知、推送、打印与流水
     * @param int $storeOrderId
     * @return void
     */
    private function paySuccess(int $storeOrderId): void
    {
        /** @var StoreOrderServices $orderServices */
        $orderServices = app()->make(StoreOrderServices::class);
        $order = $orderServices->get($storeOrderId);
        if (!$order) {
            throw new \RuntimeException('订单不存在:' . $storeOrderId);
        }
        $orderInfo = $order->toArray();
        /** @var StoreOrderCartInfoServices $cartInfoServices */
        $cartInfoServices = app()->make(StoreOrderCartInfoServices::class);
        $orderInfo['storeName'] = $cartInfoServices->getCarIdByProductTitle($storeOrderId);
        $orderInfo['send_name'] = $orderInfo['real_name'];

        //订单支付成功后置事件
        event('OrderPaySuccessListener', [$orderInfo]);
        //用户推送消息事件
        event('NoticeListener', [$orderInfo, 'order_pay_success']);
        //支付成功给客服发送消息
        event('NoticeListener', [$orderInfo, 'admin_pay_success_code']);
        // 推送订单
        event('OutPushListener', ['order_pay_push', ['order_id' => $storeOrderId]]);

        //自定义消息-订单支付成功
        $orderInfo['time'] = date('Y-m-d H:i:s');
        $orderInfo['phone'] = $orderInfo['user_phone'];
        event('CustomNoticeListener', [$orderInfo['uid'], $orderInfo, 'order_pay_success']);

        //自定义事件-订单支付
        event('CustomEventListener', ['order_pay', [
            'uid' => $orderInfo['uid'],
            'id' => $storeOrderId,
            'order_id' => $orderInfo['order_id'],
            'real_name' => $orderInfo['real_name'],
            'user_phone' => $orderInfo['user_phone'],
            'user_address' => $orderInfo['user_address'],
            'total_num' => $orderInfo['total_num'],
            'pay_price' => $orderInfo['pay_price'],
            'pay_postage' => $orderInfo['pay_postage'],
            'deduction_price' => $orderInfo['deduction_price'],
            'coupon_price' => $orderInfo['coupon_price'],
            'store_name' => $orderInfo['storeName'],
            'add_time' => date('Y-m-d H:i:s', $orderInfo['add_time']),
        ]]);
    }
}
