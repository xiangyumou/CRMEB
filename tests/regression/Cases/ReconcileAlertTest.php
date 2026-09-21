<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;

use app\model\order\StoreOrderEffect;
use app\services\order\OrderReconcileAlertServices;
use app\services\order\StoreOrderEffectServices;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * 异常收款、结果未知的退款与副作用的定时巡检。
 *
 * 这三类记录是支付链路刻意留给人工的出口，此前只能由 `php think order:reconcile`
 * 人工列出，没有任何告警——也就是说没人想起来敲那条命令，它们就一直躺着。
 * 发布文档把"真实收款开始前需要一个定时检查"列为开放条件。
 *
 * 下面钉住三件事：出现未收敛记录时会告警、干净时不会告警（否则告警会被当成噪音
 * 忽略掉）、以及刚登记还没轮到的副作用不算异常。
 */
final class ReconcileAlertTest extends RegressionTestCase
{
    private function alertServices(): OrderReconcileAlertServices
    {
        return app()->make(OrderReconcileAlertServices::class);
    }

    /**
     * 已经收敛的记录必须安静。一个总在响的告警等于没有告警。
     *
     * 断言的是"这几条不出现"，而不是"全局计数为零"：回归用例共用同一个库，
     * 断言全局为零会变成对别的用例的依赖。
     */
    public function testSettledRecordsAreNotReported(): void
    {
        $orderId = random_int(900000000, 999999999);
        $done = $this->seedEffect($orderId, [
            'status' => StoreOrderEffect::STATUS_DONE,
            'update_time' => time() - OrderReconcileAlertServices::STALE_SECONDS - 60,
        ]);
        $resolved = $this->seedPaymentException([
            'status' => \app\model\order\StoreOrderPaymentException::STATUS_REFUNDED,
        ]);

        $summary = $this->alertServices()->inspect();

        self::assertNotContains($done, $summary['details']['effects'], '已完成的副作用不该再报');
        self::assertNotContains($resolved, $summary['details']['payments'], '已处理的异常收款不该再报');
    }

    /**
     * 异常收款没有自动收敛路径，出现即需要人处理，因此不看年龄。
     */
    public function testAnUnresolvedPaymentExceptionIsReported(): void
    {
        $id = $this->seedPaymentException();

        $summary = $this->alertServices()->alert();

        self::assertSame(1, $summary['payments'], '未解决的异常收款应当被报出来');
        self::assertContains($id, $summary['details']['payments']);
        self::assertGreaterThan(0, $summary['total']);
    }

    /**
     * 通知类副作用结果未知时，自动补投队列刻意**不**收它（必须人工确认后重试），
     * 所以它不会自愈——等下去不会有任何变化，出现即告警。
     *
     * 这条同时钉住一个反直觉的点：`pendingIds()` 是自动补投队列，最需要人看的记录
     * 恰恰不在里面；拿它做告警会把这些全漏掉。
     */
    public function testAnUnknownNoticeEffectIsReportedImmediately(): void
    {
        $orderId = random_int(900000000, 999999999);
        $id = $this->seedEffect($orderId, [
            'status' => StoreOrderEffect::STATUS_UNKNOWN,
            'update_time' => time(),
        ]);

        $auto = app()->make(StoreOrderEffectServices::class)->pendingIds(500);
        self::assertNotContains($id, $auto, '前提：自动补投队列确实不收通知类的未知结果');

        $summary = $this->alertServices()->inspect();
        self::assertContains($id, $summary['details']['effects'], '不会自愈的记录必须被报出来');
    }

    /**
     * 重试次数用尽的记录同样不会被自动路径再碰。
     */
    public function testAnExhaustedEffectIsReported(): void
    {
        $orderId = random_int(900000000, 999999999);
        $id = $this->seedEffect($orderId, [
            'event_type' => 'pay_invoice',
            'status' => StoreOrderEffect::STATUS_PENDING,
            'attempts' => StoreOrderEffect::MAX_ATTEMPTS,
        ]);

        $summary = $this->alertServices()->inspect();

        self::assertContains($id, $summary['details']['effects'], '重试用尽的记录必须被报出来');
    }

    /**
     * 刚登记、还在自动补投队列里的副作用不算异常：定时器 30 秒内就会投递，
     * 立刻告警只会制造噪音。
     */
    public function testAFreshlyRegisteredEffectIsNotReported(): void
    {
        $orderId = random_int(900000000, 999999999);
        $id = $this->seedEffect($orderId, [
            'status' => StoreOrderEffect::STATUS_PENDING,
            'update_time' => time(),
        ]);

        $summary = $this->alertServices()->inspect();

        self::assertNotContains($id, $summary['details']['effects'], '刚登记的副作用交给定时器');
    }

    private function seedPaymentException(array $overrides = []): int
    {
        $id = (int)Db::name('store_order_payment_exception')->insertGetId(array_merge([
            'store_order_id' => random_int(900000000, 999999999),
            'payment_attempt_id' => 0,
            'mch_id' => 'regression-mch',
            'trade_no' => 'regression-' . bin2hex(random_bytes(6)),
            'out_trade_no' => 'regression-' . bin2hex(random_bytes(6)),
            'paid_amount' => '10.00',
            'currency' => 'CNY',
            'reason' => 'regression',
            'status' => \app\model\order\StoreOrderPaymentException::STATUS_PENDING,
            'add_time' => time(),
            'update_time' => time(),
        ], $overrides));
        $this->registerCleanup(static function () use ($id): void {
            Db::name('store_order_payment_exception')->where('id', $id)->delete();
        });
        return $id;
    }

    private function seedEffect(int $orderId, array $overrides): int
    {
        $id = (int)Db::name('store_order_effect')->insertGetId(array_merge([
            'store_order_id' => $orderId,
            'event_type' => StoreOrderEffectServices::EVENT_PAY_NOTICE,
            'payload' => '{}',
            'status' => StoreOrderEffect::STATUS_PENDING,
            'attempts' => 0,
            'last_error' => '',
            'add_time' => time(),
            'update_time' => time(),
        ], $overrides));
        $this->registerCleanup(static function () use ($id): void {
            Db::name('store_order_effect')->where('id', $id)->delete();
        });
        return $id;
    }
}
