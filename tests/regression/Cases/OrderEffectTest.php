<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\order\StoreOrderEffectDao;
use app\jobs\OrderEffectJob;
use app\model\order\StoreOrderEffect;
use app\services\order\StoreOrderEffectServices;
use app\services\order\StoreOrderSuccessServices;
use app\services\pay\PayServices;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * Post-payment effects.
 *
 * The payment transaction may only record "this still has to happen" — the notice,
 * the push, the print and the invoice must not leave the process before the order is
 * committed. Those effects therefore live in their own table, are handed to a queue
 * job right after the commit, and are re-delivered by the timer when the first
 * attempt or the process dies. Two delivery paths reaching one record must not run
 * the external call twice, and a record nobody picked up must not be forgotten.
 *
 * The effect handler is replaced here because the external calls themselves belong
 * to the notice and printing stack, not to the delivery contract this class asserts.
 */
final class OrderEffectTest extends RegressionTestCase
{
    private function effectServices(): StoreOrderEffectServices
    {
        return app()->make(StoreOrderEffectServices::class);
    }

    private function effectDao(): StoreOrderEffectDao
    {
        return app()->make(StoreOrderEffectDao::class);
    }

    /** @return int[] rows left behind by one test */
    private function seedEffects(int $orderId, array $rows): array
    {
        $ids = [];
        foreach ($rows as $row) {
            $ids[] = (int)Db::name('store_order_effect')->insertGetId(array_merge([
                'store_order_id' => $orderId,
                'event_type' => 'regression_' . bin2hex(random_bytes(3)),
                'payload' => '{}',
                'status' => StoreOrderEffect::STATUS_PENDING,
                'attempts' => 0,
                'last_error' => '',
                'add_time' => time(),
                'update_time' => time(),
            ], $row));
        }
        $this->registerCleanup(function () use ($orderId): void {
            Db::name('store_order_effect')->where('store_order_id', $orderId)->delete();
        });
        return $ids;
    }

    /**
     * The payment path registers one effect per order and target and hands each to
     * the repair job. Leaving the registration out is what let a paid order reach
     * the storefront with no notice and no printed receipt, and the records are
     * split per target so one failing notice cannot replay the print or the
     * invoice. Only one entry per target may be written no matter how often the
     * gateway repeats its callback.
     */
    public function testPaymentSuccessRegistersOneEffectAndHandsItToTheRepairJob(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder((int)$user['uid']);
        $orderId = (int)$order['id'];

        $effects = $this->createMock(StoreOrderEffectServices::class);
        // One record per external target: the notice is what the job carries, and
        // the print and the invoice get their own records.
        $effects->expects(self::exactly(7))
            ->method('record')
            ->withConsecutive(
                [$orderId, StoreOrderEffectServices::EVENT_PAY_NOTICE, self::isType('array')],
                [$orderId, StoreOrderEffectServices::EVENT_PAY_NOTICE_ADMIN, self::isType('array')],
                [$orderId, StoreOrderEffectServices::EVENT_PAY_NOTICE_PUSH, self::isType('array')],
                [$orderId, StoreOrderEffectServices::EVENT_PAY_NOTICE_CUSTOM, self::isType('array')],
                [$orderId, StoreOrderEffectServices::EVENT_PAY_NOTICE_EVENT, self::isType('array')],
                [$orderId, StoreOrderEffectServices::EVENT_PAY_PRINT, self::isType('array')],
                [$orderId, StoreOrderEffectServices::EVENT_PAY_INVOICE, self::isType('array')]
            )
            ->willReturnOnConsecutiveCalls(4242, 4243, 4244, 4245, 4246, 4247, 4248);
        // The recorded row is what the queue job carries; the job has to end up
        // running exactly that row.
        $effects->expects(self::exactly(7))
            ->method('runById')
            ->withConsecutive([4242], [4243], [4244], [4245], [4246], [4247], [4248])
            ->willReturn(true);
        $this->replace(StoreOrderEffectServices::class, $effects);

        $orderInfo = array_merge($order, ['combination_id' => 0, 'refund_status' => 0]);
        self::assertTrue(
            app()->make(StoreOrderSuccessServices::class)->paySuccess($orderInfo, PayServices::WEIXIN_PAY),
            'the payment must be recorded'
        );
        self::assertSame(1, (int)Db::name('store_order')->where('id', $orderId)->value('paid'));
        self::assertSame(
            0,
            (int)Db::name('store_order_effect')->where('store_order_id', $orderId)->count(),
            'the effect is registered through the service only, never by a second write path'
        );
    }

    /**
     * Registration is keyed by order and event type, so a repeated callback cannot
     * add a second entry, and the entry is claimable through exactly one delivery.
     */
    public function testOneEffectPerOrderAndEventAndOneClaimPerDelivery(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder((int)$user['uid']);
        $orderId = (int)$order['id'];
        $this->registerCleanup(function () use ($orderId): void {
            Db::name('store_order_effect')->where('store_order_id', $orderId)->delete();
        });

        $first = $this->effectServices()->record($orderId, StoreOrderEffectServices::EVENT_PAY_SUCCESS, ['trade_no' => 't1']);
        $second = $this->effectServices()->record($orderId, StoreOrderEffectServices::EVENT_PAY_SUCCESS, ['trade_no' => 't2']);
        self::assertSame($first, $second, 'a repeated callback reuses the entry it already wrote');
        self::assertSame(1, (int)Db::name('store_order_effect')->where('store_order_id', $orderId)->count());

        self::assertSame(
            StoreOrderEffect::STATUS_PENDING,
            (int)Db::name('store_order_effect')->where('id', $first)->value('status')
        );
        self::assertContains($first, $this->effectServices()->pendingIds(50), 'the queue and the timer can see it');

        // Two deliveries released together: only the one that claims the row may
        // run the external call.
        self::assertTrue($this->effectDao()->claim($first, 1), 'the first delivery claims the row');
        self::assertFalse($this->effectDao()->claim($first, 2), 'a second delivery must not run the same effect');
        self::assertSame(StoreOrderEffect::STATUS_RUNNING, (int)Db::name('store_order_effect')->where('id', $first)->value('status'));
    }

    /**
     * A failed or interrupted delivery has to stay visible to the next cycle, while a
     * finished one, a fresh claim and a record that used up its attempts must not be
     * handed out again.
     */
    public function testRedeliverySkipsFinishedFreshAndExhaustedRecords(): void
    {
        $orderId = random_int(900000000, 999999999);
        [$pending, $unknown, $done, $runningFresh, $runningStale, $exhausted] = $this->seedEffects($orderId, [
            ['event_type' => StoreOrderEffectServices::EVENT_PAY_NOTICE, 'status' => StoreOrderEffect::STATUS_PENDING],
            ['event_type' => StoreOrderEffectServices::EVENT_PAY_INVOICE, 'status' => StoreOrderEffect::STATUS_UNKNOWN],
            ['event_type' => StoreOrderEffectServices::EVENT_PAY_SUCCESS, 'status' => StoreOrderEffect::STATUS_DONE],
            ['event_type' => StoreOrderEffectServices::EVENT_CLOSE_ATTEMPT_PREFIX . '1', 'status' => StoreOrderEffect::STATUS_RUNNING, 'update_time' => time()],
            ['event_type' => StoreOrderEffectServices::EVENT_CLOSE_ATTEMPT_PREFIX . '2', 'status' => StoreOrderEffect::STATUS_RUNNING, 'update_time' => time() - StoreOrderEffect::STALE_SECONDS - 1],
            ['event_type' => StoreOrderEffectServices::EVENT_CLOSE_ATTEMPT_PREFIX . '3', 'status' => StoreOrderEffect::STATUS_PENDING, 'attempts' => StoreOrderEffect::MAX_ATTEMPTS],
        ]);

        $pendingIds = $this->effectServices()->pendingIds(500);
        self::assertContains($pending, $pendingIds);
        self::assertContains($unknown, $pendingIds, 'an unknown outcome is retried');
        self::assertContains($runningStale, $pendingIds, 'a delivery interrupted mid-run is picked up again');
        self::assertNotContains($done, $pendingIds, 'a finished effect is never re-delivered');
        self::assertNotContains($runningFresh, $pendingIds, 'a delivery that is still running is not stolen');
        self::assertNotContains($exhausted, $pendingIds, 'an exhausted record waits for an operator');
    }

    /**
     * 五个通知类副作用执行完之后必须被记成 DONE。
     *
     * `StoreOrderEffectServices::execute()` 声明返回 `bool`，但 EVENT_PAY_NOTICE、
     * _ADMIN、_PUSH、_CUSTOM、_EVENT 这五个 case 是 `break` 出 switch 的，函数末尾没有
     * return。PHP 7.4 下这会抛 TypeError（"Return value must be of the type bool,
     * none returned"）——通知其实已经发出去了，异常发生在那之后，但调用方的
     * catch 会把这条记录写成 STATUS_UNKNOWN。
     *
     * 后果：每一笔支付的五条通知副作用都会堆进 `order:reconcile effects:list` 的人工
     * 队列，而重投会重复发通知。原有用例只断言"副作用记录被建出来"，没有真正执行过
     * 一条通知类副作用并断言它的终态，所以这条路径一直没被走到。
     *
     * @dataProvider synchronousNoticeEvents
     */
    public function testANoticeEffectIsRecordedAsDone(string $eventType): void
    {
        $fixtures = new FixtureFactory($this, 'effect-notice');
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder((int)$user['uid'], ['paid' => 1]);
        $orderId = (int)$order['id'];
        [$id] = $this->seedEffects($orderId, [['event_type' => $eventType]]);

        self::assertTrue(
            (new OrderEffectJob())->doJob($id),
            $eventType . ' 的投递应当成功'
        );

        $row = Db::name('store_order_effect')->where('id', $id)->find();
        self::assertSame(
            StoreOrderEffect::STATUS_DONE,
            (int)$row['status'],
            $eventType . ' 执行完应当是 DONE，而不是留给人工处理的 UNKNOWN：' . (string)$row['last_error']
        );
        self::assertSame('', (string)$row['last_error'], $eventType . ' 不应当留下错误');
    }

    /**
     * @return array<string, array{0:string}>
     */
    public function synchronousNoticeEvents(): array
    {
        return [
            'user notice' => [StoreOrderEffectServices::EVENT_PAY_NOTICE],
            'admin notice' => [StoreOrderEffectServices::EVENT_PAY_NOTICE_ADMIN],
            'push' => [StoreOrderEffectServices::EVENT_PAY_NOTICE_PUSH],
            'custom notice' => [StoreOrderEffectServices::EVENT_PAY_NOTICE_CUSTOM],
            'custom event' => [StoreOrderEffectServices::EVENT_PAY_NOTICE_EVENT],
        ];
    }

    /**
     * Running an effect that throws records the unknown outcome and counts the
     * attempt instead of reporting success.
     */
    public function testAFailedEffectIsRecordedAsUnknownWithItsAttemptCounted(): void
    {
        $orderId = random_int(900000000, 999999999);
        [$id] = $this->seedEffects($orderId, [['event_type' => 'regression_unknown_event']]);

        self::assertFalse((new OrderEffectJob())->doJob($id), 'an effect that cannot be executed is not reported as done');
        $row = Db::name('store_order_effect')->where('id', $id)->find();
        self::assertSame(StoreOrderEffect::STATUS_UNKNOWN, (int)$row['status']);
        self::assertSame(1, (int)$row['attempts']);
        self::assertNotSame('', (string)$row['last_error'], 'the failure is kept for the operator');

        // An unknown non-idempotent action is manual-only. The next automatic
        // cycle must leave it untouched until an operator explicitly resets it.
        self::assertTrue((new OrderEffectJob())->doJob($id), 'an automatic cycle skips an unknown non-idempotent action');
        self::assertSame(1, (int)Db::name('store_order_effect')->where('id', $id)->value('attempts'));

        Db::name('store_order_effect')->where('id', $id)->update(['status' => StoreOrderEffect::STATUS_PENDING]);
        self::assertFalse((new OrderEffectJob())->doJob($id), 'an operator reset may explicitly retry it');
        self::assertSame(2, (int)Db::name('store_order_effect')->where('id', $id)->value('attempts'));

        // A finished record is not executed a second time.
        Db::name('store_order_effect')->where('id', $id)->update(['status' => StoreOrderEffect::STATUS_DONE]);
        self::assertTrue((new OrderEffectJob())->doJob($id));
        self::assertSame(2, (int)Db::name('store_order_effect')->where('id', $id)->value('attempts'), 'a finished effect is left alone');
    }

    public function testGroupExternalEffectsAreManualAfterAnUnknownOutcome(): void
    {
        $orderId = random_int(900000000, 999999999);
        [$id] = $this->seedEffects($orderId, [[
            'event_type' => StoreOrderEffectServices::EVENT_GROUP_EFFECT_PREFIX . 'join',
            'payload' => json_encode(['kind' => 'unknown']),
            'status' => StoreOrderEffect::STATUS_UNKNOWN,
        ]]);

        self::assertNotContains($id, $this->effectServices()->pendingIds(500), 'a group notification with unknown result is not auto-replayed');
        Db::name('store_order_effect')->where('id', $id)->update(['status' => StoreOrderEffect::STATUS_PENDING]);
        self::assertContains($id, $this->effectServices()->pendingIds(500), 'an operator may explicitly put it back in the queue');
    }
}
