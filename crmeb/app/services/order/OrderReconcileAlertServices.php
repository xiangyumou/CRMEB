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

use think\facade\Log;

/**
 * 异常收款、结果未知的退款与副作用的定时巡检。
 *
 * 这三类记录是支付链路刻意留给人工处理的出口：钱已经收了但订单已取消、退款网关受理
 * 而本地收尾未完成、非幂等的外部动作结果未知。它们只能由
 * `php think order:reconcile` 人工列出，**没有任何告警**——也就是说，只要没人想起来
 * 去敲那条命令，这些记录就会一直躺着。发布文档把"真实收款开始前需要一个定时检查"
 * 列为开放条件，这个类就是那个检查。
 *
 * 判定用的是同一批服务方法（`listPending`、`pendingReconcileList`、`pendingIds`），
 * 不另写一套查询，免得告警口径和人工核对口径对不上。
 *
 * 年龄阈值的意义：副作用刚登记时本来就是 pending，定时器 30 秒内就会投递，立刻告警
 * 只会制造噪音。超过阈值还没收敛，才说明需要人看。异常收款没有自动收敛路径，
 * 所以它不看年龄，出现即告警。
 */
class OrderReconcileAlertServices
{
    /** 处理中/未知状态超过这个秒数仍未收敛才算异常。 */
    const STALE_SECONDS = 900;

    /** 单次巡检最多读多少条，与人工核对命令保持一致。 */
    const SCAN_LIMIT = 200;

    /**
     * 跑一次巡检。
     *
     * @return array{payments:int,refunds:int,effects:int,total:int,details:array<string,array<int>>}
     */
    public function inspect(int $now = 0): array
    {
        $now = $now > 0 ? $now : time();
        $stale = $now - self::STALE_SECONDS;

        $payments = [];
        foreach (app()->make(StoreOrderPaymentExceptionServices::class)->listPending(self::SCAN_LIMIT) as $row) {
            // 异常收款没有自动收敛路径，出现即需要人处理。
            $payments[] = (int)$row['id'];
        }

        $refunds = [];
        foreach (app()->make(StoreOrderRefundServices::class)->pendingReconcileList(self::SCAN_LIMIT) as $row) {
            if ($this->rowTime($row) <= $stale) $refunds[] = (int)$row['id'];
        }

        // 注意用的是 manualIds 而不是 pendingIds：后者是**自动补投**队列，
        // 通知与打印的未知结果被它刻意排除（必须人工确认后重试）。也就是说最需要
        // 人看的记录恰恰不在自动队列里，拿 pendingIds 做告警会把它们全漏掉。
        // 这些记录不会自愈，所以不套年龄阈值——等下去不会有任何变化。
        $effects = app()->make(StoreOrderEffectServices::class)->manualIds(self::SCAN_LIMIT);

        return [
            'payments' => count($payments),
            'refunds' => count($refunds),
            'effects' => count($effects),
            'total' => count($payments) + count($refunds) + count($effects),
            'details' => ['payments' => $payments, 'refunds' => $refunds, 'effects' => $effects],
        ];
    }

    /**
     * 巡检并在有未收敛记录时告警。
     *
     * 告警走 error 级日志：这是监控真正会盯的那一层。返回摘要，便于调用方与用例断言。
     *
     * @return array{payments:int,refunds:int,effects:int,total:int,details:array<string,array<int>>}
     */
    public function alert(int $now = 0): array
    {
        $summary = $this->inspect($now);
        if ($summary['total'] > 0) {
            Log::error('订单对账巡检发现未收敛记录', [
                'payments' => $summary['payments'],
                'refunds' => $summary['refunds'],
                'effects' => $summary['effects'],
                'detail' => $summary['details'],
                'hint' => 'php think order:reconcile payments:list | refunds:list | effects:list',
            ]);
        }
        return $summary;
    }

    /**
     * 记录的时间戳。不同表的字段名不一致，取能拿到的最新的一个。
     */
    private function rowTime(array $row): int
    {
        foreach (['update_time', 'add_time', 'create_time'] as $field) {
            if (isset($row[$field]) && is_numeric($row[$field]) && (int)$row[$field] > 0) {
                return (int)$row[$field];
            }
        }
        return 0;
    }
}
