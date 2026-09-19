<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\jobs\UnpaidOrderCancelJob;
use app\model\order\StoreOrderPaymentAttempt;
use app\services\order\StoreOrderPaymentAttemptServices;
use app\services\order\StoreOrderRefundServices;
use app\services\pay\PayTradeServices;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * Unpaid-order cancellation.
 *
 * The manual endpoint, the queue job and the timer loop all call
 * StoreOrderServices::cancelUnpaidOrder(), so cancellation is exercised through
 * the queue entry (the job) and through the service entry (the worker) and never
 * re-implemented per caller. The invariants asserted here are the ones the three
 * entries would otherwise disagree on:
 *
 * - an order that must not be restored is skipped without touching stock or coupons
 * - the gateway is settled before any resource is released, and an unknown or paid
 *   gateway result refuses the cancellation instead of freeing stock
 * - the coupon, every stock layer and the cancel flag commit or roll back together
 * - two concurrent cancellations release the resources exactly once
 *
 * Rows are real (the regression stack runs MySQL); only the gateway boundary and
 * the service layers cancelUnpaidOrder() resolves itself are doubles.
 */
final class QueueTest extends RegressionTestCase
{
    /**
     * @dataProvider skippedOrderProvider
     */
    public function testCancellationSkipsOrdersThatMustNotBeRestored(array $state): void
    {
        $order = $this->createOrder($state);
        $refunds = $this->refundDouble();
        $refunds->expects(self::never())->method('couponBack');
        $refunds->expects(self::never())->method('regressionStock');
        $this->replace(StoreOrderRefundServices::class, $refunds);
        $attempts = $this->attemptDouble();
        $attempts->expects(self::never())->method('openAttempts');
        $attempts->expects(self::never())->method('closeRemaining');
        $this->replace(StoreOrderPaymentAttemptServices::class, $attempts);

        self::assertTrue((new UnpaidOrderCancelJob())->doJob((int)$order['id']));
        self::assertSame(
            (int)($state['is_cancel'] ?? 0),
            $this->isCancelled((int)$order['id']),
            'the cancellation must leave the row in the state it was found in'
        );
    }

    public function skippedOrderProvider(): array
    {
        return [
            'paid' => [['paid' => 1]],
            'deleted' => [['is_del' => 1]],
            'historical offline payment' => [['pay_type' => 'offline']],
            'already cancelled' => [['is_cancel' => 1]],
        ];
    }

    public function testCancellationRestoresResourcesAndPersistsStateOnce(): void
    {
        $order = $this->createOrder();
        $orderId = (int)$order['id'];
        $refunds = $this->refundDouble();
        $refunds->expects(self::once())->method('couponBack')
            ->with(self::callback(static function ($locked) use ($orderId): bool {
                return (int)$locked['id'] === $orderId;
            }), 'cancel')
            ->willReturn(true);
        $refunds->expects(self::once())->method('regressionStock')->willReturn(true);
        $this->replace(StoreOrderRefundServices::class, $refunds);

        $attempts = $this->attemptDouble();
        $attempts->expects(self::once())->method('openAttempts')->with($orderId)->willReturn([]);
        $attempts->expects(self::once())->method('closeRemaining')->with($orderId);
        $this->replace(StoreOrderPaymentAttemptServices::class, $attempts);

        self::assertTrue((new UnpaidOrderCancelJob())->doJob($orderId));

        self::assertSame(1, $this->isCancelled($orderId));
        self::assertSame(
            '订单未支付已超过系统预设时间',
            (string)Db::name('store_order')->where('id', $orderId)->value('mark')
        );
    }

    /**
     * The gateway is settled before the coupon and the stock are released: a
     * cancellation that freed stock and then discovered a payment would have
     * refunded stock for an order that was actually paid for.
     */
    public function testGatewaySettlementRunsBeforeAnyResourceIsReleased(): void
    {
        $order = $this->createOrder();
        $orderId = (int)$order['id'];
        $events = [];

        $trade = $this->getMockBuilder(PayTradeServices::class)->onlyMethods(['settleAttempt'])->getMock();
        $trade->expects(self::once())->method('settleAttempt')->willReturnCallback(static function () use (&$events): string {
            $events[] = 'gateway';
            return PayTradeServices::STATE_CLOSED;
        });
        $this->replace(PayTradeServices::class, $trade);

        $attempts = $this->attemptDouble([['id' => 11, 'out_trade_no' => 'T-11', 'driver' => 'v3_wechat_pay', 'channel' => 0]]);
        $attempts->expects(self::once())->method('mark')->with(11, StoreOrderPaymentAttempt::STATUS_CLOSED, 'cancel:closed');
        $this->replace(StoreOrderPaymentAttemptServices::class, $attempts);

        $refunds = $this->refundDouble();
        $refunds->method('couponBack')->willReturnCallback(static function () use (&$events): bool {
            $events[] = 'coupon';
            return true;
        });
        $refunds->method('regressionStock')->willReturnCallback(static function () use (&$events): bool {
            $events[] = 'stock';
            return true;
        });
        $this->replace(StoreOrderRefundServices::class, $refunds);

        self::assertTrue((new UnpaidOrderCancelJob())->doJob($orderId));
        self::assertSame(['gateway', 'coupon', 'stock'], $events);
        self::assertSame(1, $this->isCancelled($orderId));
    }

    /**
     * A gateway answer we cannot interpret must not release anything: the stock and
     * the coupon stay with the order until a later attempt can prove the payment is
     * impossible.
     */
    public function testAnUnconfirmedGatewayStateKeepsTheResources(): void
    {
        $order = $this->createOrder();
        $orderId = (int)$order['id'];
        $this->replaceSettledGateway(['id' => 12, 'out_trade_no' => 'T-12', 'driver' => 'v3_wechat_pay'], PayTradeServices::STATE_UNKNOWN);

        $attempts = $this->attemptDouble([['id' => 12, 'out_trade_no' => 'T-12', 'driver' => 'v3_wechat_pay']]);
        $attempts->expects(self::never())->method('mark');
        $attempts->expects(self::never())->method('closeRemaining');
        $this->replace(StoreOrderPaymentAttemptServices::class, $attempts);

        $refunds = $this->refundDouble();
        $refunds->expects(self::never())->method('couponBack');
        $refunds->expects(self::never())->method('regressionStock');
        $this->replace(StoreOrderRefundServices::class, $refunds);

        self::assertFalse((new UnpaidOrderCancelJob())->doJob($orderId));
        self::assertSame(0, $this->isCancelled($orderId));
    }

    /**
     * A late callback that says the order was paid after all must keep it alive:
     * the cancellation stops and records what the gateway reported.
     */
    public function testAGatewayPaymentFoundDuringCancellationKeepsTheOrderAlive(): void
    {
        $order = $this->createOrder();
        $orderId = (int)$order['id'];
        $this->replaceSettledGateway([
            'id' => 13,
            'out_trade_no' => 'T-13',
            'driver' => 'v3_wechat_pay',
            'trade_no' => 'trade-13',
        ], PayTradeServices::STATE_PAID);

        $attempts = $this->attemptDouble([
            ['id' => 13, 'out_trade_no' => 'T-13', 'driver' => 'v3_wechat_pay', 'trade_no' => 'trade-13'],
        ]);
        $attempts->expects(self::once())->method('mark')
            ->with(13, StoreOrderPaymentAttempt::STATUS_PAID, 'cancel:paid', 'trade-13');
        $attempts->expects(self::never())->method('closeRemaining');
        $this->replace(StoreOrderPaymentAttemptServices::class, $attempts);

        $refunds = $this->refundDouble();
        $refunds->expects(self::never())->method('couponBack');
        $refunds->expects(self::never())->method('regressionStock');
        $this->replace(StoreOrderRefundServices::class, $refunds);

        self::assertFalse((new UnpaidOrderCancelJob())->doJob($orderId));
        self::assertSame(0, $this->isCancelled($orderId));
    }

    /**
     * A coupon returned by couponBack() is written in the same transaction as the
     * stock restore and the cancel flag. The real coupon reversal runs here and the
     * stock restore fails, so the coupon has to come back to "used".
     */
    public function testAFailedStockRestoreRollsBackTheCouponAndTheCancelState(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $coupon = $fixtures->createUserCoupon($user['uid'], ['status' => 1, 'use_time' => time()]);
        $order = $fixtures->createOrder($user['uid'], ['coupon_id' => $coupon['id'], 'coupon_price' => '5.00']);
        $orderId = (int)$order['id'];

        $refunds = $this->getMockBuilder(StoreOrderRefundServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['regressionStock'])
            ->getMock();
        $refunds->expects(self::once())->method('regressionStock')->willReturn(false);
        $this->replace(StoreOrderRefundServices::class, $refunds);
        $this->replace(StoreOrderPaymentAttemptServices::class, $this->attemptDouble());

        self::assertFalse((new UnpaidOrderCancelJob())->doJob($orderId));

        self::assertSame(0, $this->isCancelled($orderId), 'the cancel flag must not survive the rollback');
        self::assertSame(
            1,
            (int)Db::name('store_coupon_user')->where('id', $coupon['id'])->value('status'),
            'a rolled back cancellation must leave the coupon consumed'
        );
        self::assertSame(
            0,
            (int)Db::name('store_order_status')->where(['oid' => $orderId, 'change_type' => 'coupon_back'])->count(),
            'the coupon_back status row is part of the same rollback'
        );
    }

    /**
     * The mirror image: when the coupon cannot be returned, the stock restore and
     * the cancel flag must not be written either.
     */
    public function testAFailedCouponRestoreStopsBeforeTheStockIsRestored(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $fixtures->createProduct(['stock' => 10, 'sales' => 2], ['stock' => 10, 'sales' => 2]);
        $order = $fixtures->createOrder($user['uid']);
        $orderId = (int)$order['id'];

        $refunds = $this->refundDouble();
        $refunds->expects(self::once())->method('couponBack')->willReturn(false);
        $refunds->expects(self::never())->method('regressionStock');
        $this->replace(StoreOrderRefundServices::class, $refunds);
        $this->replace(StoreOrderPaymentAttemptServices::class, $this->attemptDouble());

        self::assertFalse((new UnpaidOrderCancelJob())->doJob($orderId));

        self::assertSame(0, $this->isCancelled($orderId));
        self::assertSame(['stock' => 10, 'sales' => 2], $fixtures->stockLayers($product)['product'], 'no layer may be touched');
    }

    /**
     * A presale order is deducted from the presale activity row, its type-6 SKU, the
     * ordinary product row and its type-0 SKU. Cancelling has to give all four back;
     * the presale id and SKU differ from the product's on purpose, so restoring
     * through the ordinary layer cannot pass by coincidence.
     */
    public function testCancellingAPresaleOrderRestoresEveryLedger(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $fixtures->createProduct(
            ['stock' => 10, 'sales' => 2],
            ['stock' => 10, 'sales' => 2, 'quota' => 5, 'quota_show' => 5, 'suk' => 'presale', 'unique' => 'PRODUCT1']
        );
        $advance = $fixtures->createAdvance($product['id'], [], ['suk' => 'presale', 'unique' => 'PRESALE1']);
        self::assertNotSame((string)$product['id'], (string)$advance['id']);

        $cartId = random_int(100000000, 999999999);
        $order = $fixtures->createOrder($user['uid'], ['cart_id' => $cartId, 'advance_id' => $advance['id']]);
        $fixtures->createOrderCart($order['id'], $user['uid'], [
            'cart_id' => $cartId,
            'product_id' => $product['id'],
            'cart_num' => 2,
            'cart_info' => [
                'cart_num' => 2,
                'productInfo' => [
                    'id' => $product['id'], 'store_name' => 'presale cancel', 'price' => '10.00', 'image' => '',
                    'attrInfo' => ['unique' => $advance['sku']['unique']],
                ],
            ],
        ]);
        $this->replace(StoreOrderPaymentAttemptServices::class, $this->attemptDouble());

        self::assertTrue((new UnpaidOrderCancelJob())->doJob((int)$order['id']));

        self::assertSame([
            'product' => ['stock' => 12, 'sales' => 0],
            'product_sku' => ['stock' => 12, 'sales' => 0],
            'advance' => ['stock' => 7, 'sales' => 1],
            'advance_sku' => ['stock' => 7, 'sales' => 1],
        ], $fixtures->stockLayers($product, $advance));
    }

    /**
     * The manual endpoint, the queue job and the timer loop all call
     * cancelUnpaidOrder(), so two of them can arrive for the same order at once.
     * Exactly one may release the stock and the coupon; the loser must observe the
     * committed cancellation. A restored-twice order shows up as stock 12 / sales 0
     * instead of 11 / 1.
     */
    public function testTwoConcurrentCancellationsReleaseTheResourcesOnce(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $fixtures->createProduct(['stock' => 10, 'sales' => 2], ['stock' => 10, 'sales' => 2]);
        $coupon = $fixtures->createUserCoupon($user['uid'], ['status' => 1, 'use_time' => time()]);
        $cartId = random_int(100000000, 999999999);
        $order = $fixtures->createOrder($user['uid'], [
            'cart_id' => $cartId,
            'coupon_id' => $coupon['id'],
            'coupon_price' => '5.00',
        ]);
        $fixtures->createOrderCart($order['id'], $user['uid'], [
            'cart_id' => $cartId,
            'product_id' => $product['id'],
            'cart_num' => 1,
            'cart_info' => [
                'cart_num' => 1,
                'productInfo' => [
                    'id' => $product['id'], 'store_name' => 'concurrent cancel', 'price' => '10.00', 'image' => '',
                    'attrInfo' => ['unique' => $product['sku']['unique']],
                ],
            ],
        ]);
        $orderId = (int)$order['id'];

        $results = $this->raceCancellations($orderId);
        sort($results);

        self::assertSame([false, true], $results, 'exactly one cancellation may win');
        self::assertSame(['stock' => 11, 'sales' => 1], $fixtures->stockLayers($product)['product']);
        self::assertSame(['stock' => 11, 'sales' => 1], $fixtures->stockLayers($product)['product_sku']);
        self::assertSame(
            0,
            (int)Db::name('store_coupon_user')->where('id', $coupon['id'])->value('status'),
            'the coupon is returned'
        );
        self::assertSame(
            1,
            (int)Db::name('store_order_status')->where(['oid' => $orderId, 'change_type' => 'coupon_back'])->count(),
            'the coupon is returned once'
        );
        self::assertSame(1, $this->isCancelled($orderId));
    }

    /**
     * Run one cancellation through the service entry and one through the queue entry
     * in separate processes, released together the way a manual cancel and the queue
     * worker race in production.
     *
     * @return bool[]
     */
    private function raceCancellations(int $orderId): array
    {
        $start = tempnam(sys_get_temp_dir(), 'crmeb-cancel-start-');
        unlink($start);
        $processes = [];
        $outputs = [];

        foreach (['direct', 'job'] as $mode) {
            $output = tempnam(sys_get_temp_dir(), 'crmeb-cancel-');
            $outputs[$mode] = $output;
            $command = sprintf(
                'php %s %s %d %s %s',
                escapeshellarg(dirname(__DIR__) . '/Support/cancel-worker.php'),
                $mode,
                $orderId,
                escapeshellarg($start),
                escapeshellarg($output)
            );
            $processes[$mode] = proc_open($command, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
        }

        touch($start);
        $results = [];
        foreach ($processes as $mode => $process) {
            self::assertSame(0, proc_close($process), 'the ' . $mode . ' cancellation process exits cleanly');
            $raw = (string)file_get_contents($outputs[$mode]);
            unlink($outputs[$mode]);
            $decoded = json_decode($raw, true);
            self::assertIsArray($decoded, 'the ' . $mode . ' worker reported a result: ' . $raw);
            self::assertSame('', (string)$decoded['error'], 'the ' . $mode . ' worker must not fail');
            $results[] = (bool)$decoded['ok'];
        }
        unlink($start);

        return $results;
    }

    private function createOrder(array $overrides = []): array
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        return $fixtures->createOrder($user['uid'], $overrides);
    }

    private function isCancelled(int $orderId): int
    {
        return (int)Db::name('store_order')->where('id', $orderId)->value('is_cancel');
    }

    private function replaceSettledGateway(array $attempt, string $state): void
    {
        $trade = $this->getMockBuilder(PayTradeServices::class)->onlyMethods(['settleAttempt'])->getMock();
        $trade->expects(self::once())->method('settleAttempt')->with($attempt)->willReturn($state);
        $this->replace(PayTradeServices::class, $trade);
    }

    /** @param array<int, array<string, mixed>> $open */
    private function attemptDouble(array $open = []): StoreOrderPaymentAttemptServices
    {
        $mock = $this->getMockBuilder(StoreOrderPaymentAttemptServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['openAttempts', 'mark', 'closeRemaining'])
            ->getMock();
        $mock->method('openAttempts')->willReturn($open);
        return $mock;
    }

    private function refundDouble(): StoreOrderRefundServices
    {
        return $this->getMockBuilder(StoreOrderRefundServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['couponBack', 'regressionStock'])
            ->getMock();
    }
}
