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

use app\dao\order\StoreOrderPaymentExceptionDao;
use app\model\order\StoreOrderPaymentException;
use app\services\BaseServices;
use crmeb\exceptions\AdminException;
use crmeb\services\pay\Pay;
use think\facade\Log;

/**
 * 异常收款：持久化、告警与人工退款
 *
 * 一笔异常收款一旦提交成功，就绝不能再"消失"；同一 (商户号, 交易号) 只记
 * 一次，重复通知幂等命中同一条记录。退款只由人工通过 order:reconcile 发起，
 * 按冻结金额原路退回，使用稳定退款单号，不经过商品回库和售后拆单。
 *
 * Class StoreOrderPaymentExceptionServices
 * @package app\services\order
 */
class StoreOrderPaymentExceptionServices extends BaseServices
{
    public function __construct(StoreOrderPaymentExceptionDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 记录一笔异常收款（回调路径调用）
     *
     * 按 (mch_id, trade_no) 去重：重复通知命中既有记录时直接返回，不写第二
     * 行。插入成功（提交完成）后调用方才应向网关确认收到；插入失败则让异常
     * 抛出，网关会重试。
     *
     * @param array $report store_order_id,payment_attempt_id,mch_id,trade_no,out_trade_no,reason,paid_amount,currency,payment_context
     * @return int 记录ID
     */
    public function record(array $report): int
    {
        $mchId = trim((string)($report['mch_id'] ?? ''));
        $tradeNo = trim((string)($report['trade_no'] ?? ''));
        if ($mchId === '' || $tradeNo === '') {
            //没有交易号就无法去重，也无法退款：交给日志人工排查
            Log::error('异常收款缺少商户号或交易号，无法落库', $report);
            throw new \RuntimeException('异常收款缺少商户号或交易号');
        }
        $existing = $this->dao->getByTradeNo($mchId, $tradeNo);
        if ($existing) {
            return (int)$existing['id'];
        }
        $now = time();
        try {
            $this->dao->save([
                'store_order_id' => (int)($report['store_order_id'] ?? 0),
                'payment_attempt_id' => (int)($report['payment_attempt_id'] ?? 0),
                'mch_id' => $mchId,
                'trade_no' => $tradeNo,
                'out_trade_no' => (string)($report['out_trade_no'] ?? ''),
                'reason' => (string)($report['reason'] ?? ''),
                'paid_amount' => (string)($report['paid_amount'] ?? '0'),
                'currency' => (string)($report['currency'] ?? 'CNY'),
                'payment_context' => json_encode($report['payment_context'] ?? [], JSON_UNESCAPED_UNICODE),
                'status' => StoreOrderPaymentException::STATUS_PENDING,
                'refund_no' => '',
                'refund_request' => '',
                'operator' => '',
                'refund_time' => 0,
                'alarm_time' => $now,
                'add_time' => $now,
                'update_time' => $now,
            ]);
        } catch (\Throwable $e) {
            //并发下同一笔交易可能撞唯一键：命中即视为已记录
            $existing = $this->dao->getByTradeNo($mchId, $tradeNo);
            if ($existing) {
                return (int)$existing['id'];
            }
            throw $e;
        }
        $fresh = $this->dao->getByTradeNo($mchId, $tradeNo);
        $id = (int)$fresh['id'];
        //独立告警记录：这条日志与异常记录同时存在，值班必须看到
        Log::error(sprintf('异常收款告警: #%d 订单%d 交易%s 金额%s 原因%s', $id, (int)($report['store_order_id'] ?? 0), $tradeNo, (string)($report['paid_amount'] ?? '0'), (string)($report['reason'] ?? '')));
        return $id;
    }

    /**
     * 未解决的异常收款
     * @param int $limit
     * @return array
     */
    public function listPending(int $limit = 50): array
    {
        return $this->dao->pendingList($limit);
    }

    /**
     * 人工核对：本地事实 + 网关事实
     *
     * @param int $id
     * @return array{record:array,gateway:array|null}
     */
    public function inspect(int $id): array
    {
        $row = $this->get((int)$id);
        if (!$row) {
            throw new AdminException('异常收款记录不存在');
        }
        $row = $row->toArray();
        $gateway = null;
        $context = json_decode((string)$row['payment_context'], true);
        $driver = is_array($context) ? (string)($context['driver'] ?? '') : '';
        $outTradeNo = is_array($context) ? (string)($context['out_trade_no'] ?? '') : '';
        $newMiniOpen = is_array($context) && array_key_exists('pay_new_weixin_open', $context)
            ? (bool)$context['pay_new_weixin_open']
            : (bool)sys_config('pay_new_weixin_open');
        if ($driver !== '' && $outTradeNo !== '') {
            try {
                /** @var Pay $pay */
                $pay = app()->make(Pay::class, [$driver]);
                $gateway = $pay->queryOrder($outTradeNo, [
                    'is_channel' => (int)($context['channel'] ?? 0),
                    'pay_new_weixin_open' => $newMiniOpen,
                ]);
            } catch (\Throwable $e) {
                $gateway = ['state' => 'unknown', 'trade_no' => '', 'raw' => $e->getMessage()];
            }
        }

        $refund = null;
        $refundNo = trim((string)($row['refund_no'] ?? ''));
        if ($refundNo !== '' && $driver !== '') {
            try {
                /** @var Pay $pay */
                $pay = app()->make(Pay::class, [$driver]);
                $refund = $pay->queryRefund($outTradeNo, $refundNo, [
                    'pay_new_weixin_open' => $newMiniOpen,
                ]);
            } catch (\Throwable $e) {
                $refund = ['state' => 'unknown', 'refund_no' => $refundNo, 'raw' => $e->getMessage()];
            }
        }

        return ['record' => $row, 'gateway' => $gateway, 'refund' => $refund];
    }

    /**
     * 人工确认后按冻结金额原路退款
     *
     * 同一记录永远使用同一退款单号：网关按单号幂等，重试或并发重复执行都
     * 不会重复退钱。退款不恢复商品库存、不退优惠券、不走售后拆单——异常
     * 收款从未占用过这些资源。
     *
     * @param int $id
     * @param string $confirmTradeNo 操作人显式确认的交易号，必须与记录一致
     * @param string $operator 操作人
     * @return array{status:int,refund_no:string}
     */
    public function refund(int $id, string $confirmTradeNo, string $operator): array
    {
        if (trim((string)$operator) === '') {
            throw new AdminException('退款必须记录操作人');
        }

        //先锁定异常收款并持久化 PROCESSING。网关调用不放在数据库事务里，
        //因此超时或进程退出后不会把"已经可能退款"的事实回滚成待处理。
        $prepared = $this->transaction(function () use ($id, $confirmTradeNo, $operator) {
            $row = $this->dao->getForUpdate((int)$id);
            if (!$row) throw new AdminException('异常收款记录不存在');
            $row = $row->toArray();
            if (trim($confirmTradeNo) !== trim((string)$row['trade_no'])) {
                throw new AdminException('确认交易号与记录不符，拒绝退款');
            }
            if ((int)$row['status'] === StoreOrderPaymentException::STATUS_REFUNDED) {
                throw new AdminException('该异常收款已退款，请勿重复操作');
            }
            if (in_array((int)$row['status'], [StoreOrderPaymentException::STATUS_REFUND_PROCESSING, StoreOrderPaymentException::STATUS_REFUND_UNKNOWN], true)) {
                throw new AdminException('该异常收款已有退款请求，请先查询原退款单号');
            }
            if ((float)$row['paid_amount'] <= 0) throw new AdminException('记录缺少实收金额，无法退款，请人工核实');
            $context = json_decode((string)$row['payment_context'], true);
            $context = is_array($context) ? $context : [];
            $context['pay_new_weixin_open'] = array_key_exists('pay_new_weixin_open', $context)
                ? (bool)$context['pay_new_weixin_open']
                : (bool)sys_config('pay_new_weixin_open');
            $driver = (string)($context['driver'] ?? '');
            $outTradeNo = (string)($context['out_trade_no'] ?? '');
            if ($driver === '' || $outTradeNo === '') {
                throw new AdminException('记录缺少冻结的支付上下文，无法原路退款，请人工处理');
            }
            $refundNo = trim((string)$row['refund_no']);
            if ($refundNo === '') $refundNo = 'PE' . (int)$row['id'] . substr(md5($row['mch_id'] . '|' . $row['trade_no']), 0, 12);
            $payPrice = (string)($context['total_fee'] ?? $row['paid_amount']);
            $this->dao->update((int)$row['id'], [
                'refund_no' => $refundNo,
                'operator' => (string)$operator,
                'status' => StoreOrderPaymentException::STATUS_REFUND_PROCESSING,
                'refund_request' => json_encode([
                    'refund_no' => $refundNo,
                    'refund_price' => (string)$row['paid_amount'],
                    'pay_price' => $payPrice,
                    'trade_no' => (string)$row['trade_no'],
                    'context' => $context,
                    'submitted_time' => time(),
                ], JSON_UNESCAPED_UNICODE),
                'update_time' => time(),
            ]);
            return compact('row', 'context', 'driver', 'outTradeNo', 'refundNo', 'payPrice');
        });

        /** @var Pay $pay */
        $pay = app()->make(Pay::class, [$prepared['driver']]);
        $options = [
            'refund_id' => $prepared['refundNo'],
            'refund_price' => (string)$prepared['row']['paid_amount'],
            'pay_price' => $prepared['payPrice'],
            'paid_amount' => (string)$prepared['row']['paid_amount'],
            'type' => 'trade_no',
            'trade_no' => (string)$prepared['row']['trade_no'],
            'is_channel' => (int)($prepared['context']['channel'] ?? 0),
            'pay_new_weixin_open' => (bool)$prepared['context']['pay_new_weixin_open'],
        ];
        //异常收款按冻结的标准支付事实原路退款。v2 的标准公众号/开放平台
        //退款必须显式走 wechat 分支，不能因为没有售后控制器的标志而落到
        //不匹配的小程序适配器。
        if ((int)($prepared['context']['channel'] ?? 0) !== 1 || !(bool)$prepared['context']['pay_new_weixin_open']) {
            $options['wechat'] = true;
        }
        $gatewayState = 'unknown';
        $error = '';
        try {
            $result = $pay->refund((string)$prepared['row']['trade_no'], $options);
            $gatewayState = is_array($result) ? (string)($result['state'] ?? 'unknown') : ((bool)$result ? 'success' : 'unknown');
        } catch (\Throwable $e) {
            $error = $e->getMessage();
        }

        $update = [
            'refund_request' => json_encode([
                'refund_no' => $prepared['refundNo'],
                'refund_price' => (string)$prepared['row']['paid_amount'],
                'pay_price' => $prepared['payPrice'],
                'trade_no' => (string)$prepared['row']['trade_no'],
                'gateway_state' => $gatewayState,
                'gateway_accepted' => in_array($gatewayState, ['success', 'processing'], true),
                'error' => $error,
                'time' => time(),
            ], JSON_UNESCAPED_UNICODE),
            'update_time' => time(),
        ];
        if ($gatewayState === 'success') {
            $update['status'] = StoreOrderPaymentException::STATUS_REFUNDED;
            $update['refund_time'] = time();
        } elseif ($gatewayState === 'closed') {
            $update['status'] = StoreOrderPaymentException::STATUS_REFUND_FAILED;
        } elseif ($gatewayState === 'processing') {
            //网关已受理但尚未完成：人工查询时复用同一退款单号
            $update['status'] = StoreOrderPaymentException::STATUS_REFUND_PROCESSING;
        } else {
            //结果未知：人工查询时复用同一退款单号，绝不换号重发
            $update['status'] = StoreOrderPaymentException::STATUS_REFUND_UNKNOWN;
        }
        $this->dao->update((int)$prepared['row']['id'], $update);

        return ['status' => (int)$update['status'], 'refund_no' => $prepared['refundNo']];
    }

    /**
     * 查询并收敛人工退款的持久状态。结果未知时只保留 UNKNOWN，绝不换退款
     * 单号重发；确认成功后再次调用也只是幂等地保留 REFUNDED。
     * @return array{status:int,refund_no:string}
     */
    public function reconcileRefund(int $id, string $operator): array
    {
        if (trim($operator) === '') throw new AdminException('查询退款必须记录操作人');
        $row = $this->dao->get((int)$id);
        if (!$row) throw new AdminException('异常收款记录不存在');
        $row = $row->toArray();
        if ((int)$row['status'] === StoreOrderPaymentException::STATUS_REFUNDED) {
            return ['status' => (int)$row['status'], 'refund_no' => (string)$row['refund_no']];
        }
        $detail = $this->inspect($id);
        $result = $detail['refund'] ?? [];
        $state = is_array($result) ? (string)($result['state'] ?? 'unknown') : 'unknown';
        $status = $state === 'success'
            ? StoreOrderPaymentException::STATUS_REFUNDED
            : ($state === 'processing'
                ? StoreOrderPaymentException::STATUS_REFUND_PROCESSING
                : ($state === 'closed' ? StoreOrderPaymentException::STATUS_REFUND_FAILED : StoreOrderPaymentException::STATUS_REFUND_UNKNOWN));
        $data = ['status' => $status, 'operator' => $operator, 'update_time' => time()];
        if ($status === StoreOrderPaymentException::STATUS_REFUNDED) $data['refund_time'] = time();
        $this->dao->update($id, $data);
        return ['status' => $status, 'refund_no' => (string)$row['refund_no']];
    }
}
