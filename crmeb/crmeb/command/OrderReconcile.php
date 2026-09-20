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

namespace crmeb\command;

use app\model\order\StoreOrderEffect;
use app\services\order\StoreOrderEffectServices;
use app\services\order\StoreOrderPaymentExceptionServices;
use think\console\Command;
use think\console\Input;
use think\console\input\Argument;
use think\console\input\Option;
use think\console\Output;

/**
 * 订单对账命令：人工核对异常收款与未知副作用
 *
 *   php think order:reconcile payments:list            列出未解决的异常收款
 *   php think order:reconcile payments:inspect <id>    展示本地与网关两侧事实
 *   php think order:reconcile payments:refund <id> --confirm-trade-no=<交易号> --operator=<操作人>
 *                                                      人工确认后按冻结金额原路退款
 *   php think order:reconcile payments:reconcile <id> --operator=<操作人>
 *                                                      查询原退款单号并收敛人工退款状态
 *   php think order:reconcile effects:list             列出结果未知或待处理的副作用
 *   php think order:reconcile effects:inspect <id>     展示副作用记录
 *   php think order:reconcile effects:retry <id> --ack-duplicate-risk --operator=<操作人>
 *                                                      显式确认重复执行风险后人工重试
 *
 *   php think order:reconcile refunds:list             列出处理中或结果未知的退款
 *   php think order:reconcile refunds:inspect <id>     展示退款冻结上下文与网关事实
 *   php think order:reconcile refunds:retry <id> --operator=<操作人>
 *                                                      按原退款单号查询后补齐本地写入
 *
 * Class OrderReconcile
 * @package crmeb\command
 */
class OrderReconcile extends Command
{
    protected function configure()
    {
        $this->setName('order:reconcile')
            ->addArgument('action', Argument::REQUIRED, 'payments:list|payments:inspect|payments:refund|payments:reconcile|refunds:list|refunds:inspect|refunds:retry|effects:list|effects:inspect|effects:retry')
            ->addArgument('id', Argument::OPTIONAL, '记录ID')
            ->addOption('confirm-trade-no', null, Option::VALUE_REQUIRED, '人工确认的网关交易号，必须与记录一致')
            ->addOption('operator', null, Option::VALUE_REQUIRED, '操作人，退款与重试必填')
            ->addOption('ack-duplicate-risk', null, Option::VALUE_NONE, '显式确认重复执行可能带来的外部副作用')
            ->setDescription('异常收款、未知退款与未知副作用的人工核对');
    }

    protected function execute(Input $input, Output $output)
    {
        $action = (string)$input->getArgument('action');
        $id = (int)$input->getArgument('id');
        switch ($action) {
            case 'payments:list':
                return $this->paymentsList($output);
            case 'payments:inspect':
                return $this->paymentsInspect($id, $output);
            case 'payments:refund':
                return $this->paymentsRefund($id, $input, $output);
            case 'payments:reconcile':
                return $this->paymentsReconcile($id, $input, $output);
            case 'refunds:list':
                return $this->refundsList($output);
            case 'refunds:inspect':
                return $this->refundsInspect($id, $output);
            case 'refunds:retry':
                return $this->refundsRetry($id, $input, $output);
            case 'effects:list':
                return $this->effectsList($output);
            case 'effects:inspect':
                return $this->effectsInspect($id, $output);
            case 'effects:retry':
                return $this->effectsRetry($id, $input, $output);
            default:
                $output->error('未知操作: ' . $action);

                return 1;
        }
    }

    private function paymentsList(Output $output): int
    {
        /** @var StoreOrderPaymentExceptionServices $services */
        $services = app()->make(StoreOrderPaymentExceptionServices::class);
        $rows = $services->listPending(200);
        if (!$rows) {
            $output->writeln('没有未解决的异常收款。');

            return 0;
        }
        $output->writeln(sprintf('%-6s %-8s %-20s %-24s %-10s %-12s %s', 'ID', '订单', '交易号', '商户订单号', '金额', '原因', '状态'));
        foreach ($rows as $row) {
            $output->writeln(sprintf(
                '%-6d %-8d %-20s %-24s %-10s %-12s %s',
                (int)$row['id'],
                (int)$row['store_order_id'],
                (string)$row['trade_no'],
                (string)$row['out_trade_no'],
                (string)$row['paid_amount'],
                (string)$row['reason'],
                '待处理'
            ));
        }
        $output->writeln(sprintf('共 %d 条，用 payments:inspect <id> 查看两侧事实，payments:refund <id> 人工退款。', count($rows)));

        return 0;
    }

    private function paymentsInspect(int $id, Output $output): int
    {
        /** @var StoreOrderPaymentExceptionServices $services */
        $services = app()->make(StoreOrderPaymentExceptionServices::class);
        try {
            $detail = $services->inspect($id);
        } catch (\Throwable $e) {
            $output->error($e->getMessage());

            return 1;
        }
        $output->writeln('本地记录:');
        $output->writeln(json_encode($detail['record'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $output->writeln('网关事实:');
        $output->writeln($detail['gateway'] === null
            ? '无法查询（缺少冻结上下文）'
            : json_encode($detail['gateway'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        if (array_key_exists('refund', $detail)) {
            $output->writeln('网关退款事实:');
            $output->writeln($detail['refund'] === null
                ? '尚未发起退款或缺少退款单号'
                : json_encode($detail['refund'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        }

        return 0;
    }

    private function paymentsRefund(int $id, Input $input, Output $output): int
    {
        $tradeNo = (string)$input->getOption('confirm-trade-no');
        $operator = (string)$input->getOption('operator');
        if ($tradeNo === '' || $operator === '') {
            $output->error('退款必须携带 --confirm-trade-no=<记录上的交易号> 和 --operator=<操作人>');

            return 1;
        }
        /** @var StoreOrderPaymentExceptionServices $services */
        $services = app()->make(StoreOrderPaymentExceptionServices::class);
        try {
            $result = $services->refund($id, $tradeNo, $operator);
        } catch (\Throwable $e) {
            $output->error($e->getMessage());

            return 1;
        }
        if ($result['status'] === \app\model\order\StoreOrderPaymentException::STATUS_REFUNDED) {
            $output->writeln(sprintf('退款完成，退款单号 %s。', $result['refund_no']));

            return 0;
        }
        $output->warning(sprintf('网关受理结果未知，退款单号 %s 已冻结；请稍后用 payments:inspect 核对后重试，重试复用同一退款单号。', $result['refund_no']));

        return 1;
    }

    private function paymentsReconcile(int $id, Input $input, Output $output): int
    {
        $operator = (string)$input->getOption('operator');
        if ($operator === '') {
            $output->error('查询退款必须携带 --operator=<操作人>');

            return 1;
        }
        /** @var StoreOrderPaymentExceptionServices $services */
        $services = app()->make(StoreOrderPaymentExceptionServices::class);
        try {
            $result = $services->reconcileRefund($id, $operator);
        } catch (\Throwable $e) {
            $output->error($e->getMessage());

            return 1;
        }
        if ($result['status'] === \app\model\order\StoreOrderPaymentException::STATUS_REFUNDED) {
            $output->writeln(sprintf('退款已确认完成，退款单号 %s。', $result['refund_no']));

            return 0;
        }
        $output->warning(sprintf('退款仍未确认，退款单号 %s 保持人工核对状态。', $result['refund_no']));

        return 1;
    }

    private function refundsList(Output $output): int
    {
        /** @var \app\services\order\StoreOrderRefundServices $services */
        $services = app()->make(\app\services\order\StoreOrderRefundServices::class);
        $rows = $services->pendingReconcileList(200);
        if (!$rows) {
            $output->writeln('没有处理中或结果未知的退款。');

            return 0;
        }
        $output->writeln(sprintf('%-6s %-8s %-24s %-10s %-10s %s', 'ID', '订单', '退款单号', '金额', '状态', '冻结时间'));
        foreach ($rows as $row) {
            $request = json_decode((string)$row['refund_request'], true);
            $request = is_array($request) ? $request : [];
            $output->writeln(sprintf(
                '%-6d %-8d %-24s %-10s %-10s %s',
                (int)$row['id'],
                (int)$row['store_order_id'],
                (string)$row['out_refund_no'],
                (string)($request['refund_price'] ?? '0'),
                (int)$row['refund_state'] === 2 ? '结果未知' : '处理中',
                isset($request['frozen_time']) ? date('Y-m-d H:i:s', (int)$request['frozen_time']) : ''
            ));
        }
        $output->writeln(sprintf('共 %d 条，用 refunds:inspect <id> 查看两侧事实。', count($rows)));

        return 0;
    }

    private function refundsInspect(int $id, Output $output): int
    {
        /** @var \app\services\order\StoreOrderRefundServices $services */
        $services = app()->make(\app\services\order\StoreOrderRefundServices::class);
        try {
            $detail = $services->inspectRefund($id);
        } catch (\Throwable $e) {
            $output->error($e->getMessage());

            return 1;
        }
        $output->writeln('本地售后单:');
        $output->writeln(json_encode($detail['refund'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $output->writeln('冻结的支付上下文:');
        $output->writeln(json_encode($detail['context'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $output->writeln('网关退款事实:');
        $output->writeln($detail['gateway'] === null
            ? '无法查询（缺少冻结上下文或退款单号）'
            : json_encode($detail['gateway'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        return 0;
    }

    private function refundsRetry(int $id, Input $input, Output $output): int
    {
        $operator = (string)$input->getOption('operator');
        if ($operator === '') {
            $output->error('重试必须携带 --operator=<操作人>');

            return 1;
        }
        /** @var \app\services\order\StoreOrderRefundServices $services */
        $services = app()->make(\app\services\order\StoreOrderRefundServices::class);
        try {
            $result = $services->retryUnknownRefund($id, $operator);
        } catch (\Throwable $e) {
            $output->error($e->getMessage());

            return 1;
        }
        $output->writeln(sprintf('按原退款单号 %s 核对并补齐本地写入完成。', $result['refund_no']));

        return 0;
    }

    private function effectsList(Output $output): int    {
        /** @var StoreOrderEffectServices $services */
        $services = app()->make(StoreOrderEffectServices::class);
        $rows = $services->pendingIds(200);
        if (!$rows) {
            $output->writeln('没有待处理或结果未知的副作用。');

            return 0;
        }
        /** @var \app\dao\order\StoreOrderEffectDao $dao */
        $dao = app()->make(\app\dao\order\StoreOrderEffectDao::class);
        foreach ($rows as $effectId) {
            $effect = $dao->get((int)$effectId);
            if (!$effect) {
                continue;
            }
            $effect = $effect->toArray();
            $output->writeln(sprintf(
                '%-6d %-8d %-28s %-10s attempts=%-3d %s',
                (int)$effect['id'],
                (int)$effect['store_order_id'],
                (string)$effect['event_type'],
                (int)$effect['status'] === StoreOrderEffect::STATUS_UNKNOWN ? '结果未知' : '待处理',
                (int)$effect['attempts'],
                (string)$effect['last_error']
            ));
        }
        $output->writeln(sprintf('共 %d 条。', count($rows)));

        return 0;
    }

    private function effectsInspect(int $id, Output $output): int
    {
        /** @var \app\dao\order\StoreOrderEffectDao $dao */
        $dao = app()->make(\app\dao\order\StoreOrderEffectDao::class);
        $effect = $dao->get($id);
        if (!$effect) {
            $output->error('副作用记录不存在');

            return 1;
        }
        $output->writeln(json_encode($effect->toArray(), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        return 0;
    }

    private function effectsRetry(int $id, Input $input, Output $output): int
    {
        $operator = (string)$input->getOption('operator');
        $ackRisk = (bool)$input->getOption('ack-duplicate-risk');
        if ($operator === '' || !$ackRisk) {
            $output->error('人工重试必须显式携带 --ack-duplicate-risk 和 --operator=<操作人>：外部动作可能已执行过一次，重复执行有重复通知/重复开票的风险。');

            return 1;
        }
        /** @var \app\dao\order\StoreOrderEffectDao $dao */
        $dao = app()->make(\app\dao\order\StoreOrderEffectDao::class);
        $effect = $dao->get($id);
        if (!$effect) {
            $output->error('副作用记录不存在');

            return 1;
        }
        //把记录放回待处理并注明人工确认，由下一次投递执行
        $dao->update($id, [
            'status' => StoreOrderEffect::STATUS_PENDING,
            'last_error' => '人工重试，操作人:' . $operator,
            'update_time' => time(),
        ]);
        /** @var StoreOrderEffectServices $services */
        $services = app()->make(StoreOrderEffectServices::class);
        $ok = $services->runById($id);
        $output->writeln($ok ? '重试已执行完成。' : '重试仍未成功，记录保持结果未知。');

        return $ok ? 0 : 1;
    }
}
