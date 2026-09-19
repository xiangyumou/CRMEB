<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\model\order\StoreOrderPaymentAttempt;
use app\services\order\StoreOrderServices;
use Tests\Regression\Support\BusinessSnapshot;
use Tests\Regression\Support\ConcurrencyBarrier;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use Tests\Regression\Support\StatefulGateway;
use Tests\Regression\Support\WorkerProcess;
use think\facade\Db;

/**
 * Payment-creation concurrency against the shared offline gateway.
 *
 * Every scenario below drives the real controller payment entry in a separate
 * process, with the gateway state kept in the shared test database so the
 * entry, the cancellation and the observer all agree on what the gateway saw.
 */
final class PaymentConcurrencyTest extends RegressionTestCase
{
    private StatefulGateway $gateway;

    protected function setUp(): void
    {
        parent::setUp();
        $this->gateway = StatefulGateway::fresh();
        // The main process settles/cancels through the same shared gateway the
        // workers use; workers rebind via CRMEB_TEST_GATEWAY=1.
        $gateway = $this->gateway;
        $this->bindClass(\crmeb\services\pay\Pay::class, static function () use ($gateway) {
            return $gateway;
        });
        ConcurrencyBarrier::reset();
        $this->registerCleanup(static function (): void {
            ConcurrencyBarrier::reset();
        });
    }

    /**
     * PAY-007: the payment entry read the order, then the cancellation completed,
     * then the gateway create finally landed. A collectible gateway payment must
     * never exist for a cancelled order — the entry has to re-check the order
     * under the order lock before it calls the gateway, and an unconfirmed query
     * must keep the cancel from releasing anything.
     */
    public function testNoCollectibleGatewayPaymentSurvivesACancelledOrder(): void
    {
        [$orderId, $outTradeNo] = $this->createPayableOrder();

        // Hold the create at the gateway boundary, before the gateway knows it.
        $barrier = 'pay-create-' . $outTradeNo;
        $this->gateway->holdCreateEntry($outTradeNo, $barrier);

        $worker = WorkerProcess::startHeld('pay', sprintf('pay-entry %d weixin', $orderId), ['CRMEB_TEST_GATEWAY' => '1']);
        $this->registerCleanup(static function () use ($worker): void {
            // If the test failed before releasing, do not leave a worker behind.
            @touch($worker['start']);
            @proc_close($worker['process']);
        });
        // Start the worker now; it blocks later, inside the held gateway create.
        touch($worker['start']);

        self::assertTrue(
            $this->waitUntil(fn () => BusinessSnapshot::attemptByOutTradeNo($outTradeNo) !== null),
            'the payment attempt is recorded before the gateway create lands'
        );
        self::assertSame(
            'not_exist',
            $this->gateway->gatewayState($outTradeNo),
            'the held create has not reached the gateway yet'
        );

        // The cancellation runs while the create is still held at the gateway.
        /** @var StoreOrderServices $orderServices */
        $orderServices = app()->make(StoreOrderServices::class);
        $cancelError = '';
        try {
            $cancelled = $orderServices->cancelUnpaidOrder($orderId, 'payment-concurrency test');
        } catch (\crmeb\exceptions\ApiException $e) {
            $cancelled = false;
            $cancelError = $e->getMessage();
        }

        // Whatever the cancellation concluded, nothing may be released while the
        // gateway question is open:
        $order = BusinessSnapshot::order($orderId);
        $gatewayOpen = $this->gateway->gatewayState($outTradeNo) === 'open';
        if ($cancelled) {
            self::assertSame(1, (int)$order['is_cancel'], 'a successful cancel persists its flag');
            self::assertFalse($gatewayOpen, 'a cancelled order must not keep a collectible gateway payment');
        } else {
            self::assertSame(0, (int)$order['is_cancel'], 'an aborted cancel leaves the order open');
            self::assertNotSame('', $cancelError, 'an aborted cancel explains itself: ' . $cancelError);
            self::assertSame(
                0,
                (int)Db::name('store_order_status')->where(['oid' => $orderId, 'change_type' => 'coupon_back'])->count(),
                'an aborted cancel releases no coupon'
            );
        }

        // Now let the create land and join the worker.
        ConcurrencyBarrier::release($barrier);
        $result = WorkerProcess::releaseHeld($worker, false);

        $order = BusinessSnapshot::order($orderId);
        $gatewayState = $this->gateway->gatewayState($outTradeNo);
        self::assertFalse(
            $gatewayState === 'open' && (int)$order['is_cancel'] === 1,
            sprintf('a cancelled order ended up with a collectible gateway payment (%s)', $gatewayState)
        );
        self::assertFalse(
            $result['ok'] && strpos((string)json_encode($result['value'] ?? ''), 'jsConfig') !== false && (int)$order['is_cancel'] === 1,
            'the payment entry returned payment parameters for a cancelled order'
        );
    }

    /**
     * PAY-007: the gateway accepted the create but the response was lost. The
     * attempt must be kept and marked as unknown — not treated as never having
     * happened — and a later cancellation settles it through the gateway.
     */
    public function testACreateResponseTimeoutKeepsTheAttemptAsUnknown(): void
    {
        [$orderId, $outTradeNo] = $this->createPayableOrder();
        $this->gateway->respondTimeout($outTradeNo);

        $result = WorkerProcess::run(['pay' => sprintf('pay-entry %d weixin', $orderId)], ['CRMEB_TEST_GATEWAY' => '1']);

        // The gateway accepted: the order exists there, open, collectible.
        self::assertSame('open', $this->gateway->gatewayState($outTradeNo), 'the gateway recorded the accepted create');
        self::assertSame(1, $this->gateway->requestCount('create', $outTradeNo));

        $attempt = BusinessSnapshot::attemptByOutTradeNo($outTradeNo);
        self::assertNotNull($attempt, 'the attempt is kept after the transport failure');
        self::assertSame(
            StoreOrderPaymentAttempt::STATUS_UNKNOWN,
            (int)$attempt['status'],
            'a lost response leaves the attempt unknown, not silently submitted or closed'
        );

        $order = BusinessSnapshot::order($orderId);
        self::assertSame(0, (int)$order['paid'], 'the order is not paid on its own');
        self::assertSame(0, (int)$order['is_cancel'], 'the order is not cancelled on its own');

        // A later cancellation must settle the still-open gateway order first.
        /** @var StoreOrderServices $orderServices */
        $orderServices = app()->make(StoreOrderServices::class);
        self::assertTrue($orderServices->cancelUnpaidOrder($orderId, 'after timeout'), 'the cancel settles the gateway and succeeds');
        self::assertSame('closed', $this->gateway->gatewayState($outTradeNo), 'the gateway order was closed, not abandoned');
        self::assertSame(1, $this->gateway->requestCount('close', $outTradeNo), 'the close went through the gateway once');
    }

    /**
     * PAY-007: the same payer tapping pay twice must not produce two attempts
     * or two merchant order numbers — the repeat either gets the dedupe refusal
     * or re-uses the same recorded attempt.
     */
    public function testRepeatedPayTapsKeepOneAttemptAndOneMerchantOrderNumber(): void
    {
        [$orderId, $outTradeNo] = $this->createPayableOrder();

        $first = WorkerProcess::run(['pay' => sprintf('pay-entry %d weixin', $orderId)], ['CRMEB_TEST_GATEWAY' => '1']);
        self::assertTrue($first['pay']['ok'], 'the first tap reaches the gateway: ' . $first['pay']['error']);

        $second = WorkerProcess::run(['pay' => sprintf('pay-entry %d weixin', $orderId)], ['CRMEB_TEST_GATEWAY' => '1']);
        self::assertSame(
            1,
            (int)Db::name('store_order_payment_attempt')->where('out_trade_no', $outTradeNo)->count(),
            'repeated taps keep one attempt row for one merchant order number'
        );
        self::assertSame(0, (int)BusinessSnapshot::order($orderId)['paid'], 'no tap completes the order on its own');
        self::assertSame(0, (int)BusinessSnapshot::order($orderId)['is_cancel'], 'no tap cancels the order on its own');
    }

    /**
     * PAY-008: the attempt's driver, merchant, app, channel, amount and payer
     * are immutable once recorded. An identical replay is idempotent; a changed
     * context (config switch, payer swap on the same number, different amount)
     * is refused for manual handling instead of being overwritten.
     */
    public function testPaymentAttemptContextIsImmutable(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], ['pay_type' => 'weixin']);
        $orderId = (int)$order['id'];

        /** @var \app\services\order\StoreOrderPaymentAttemptServices $services */
        $services = app()->make(\app\services\order\StoreOrderPaymentAttemptServices::class);
        $context = ['mch_id' => '1900000001', 'app_id' => 'wx-app-1', 'channel' => '2', 'pay_type' => 'weixin', 'total_fee' => '10.00', 'pay_uid' => $user['uid']];
        $first = $services->record($orderId, (string)$order['order_id'], 'wechat_pay', $context);

        $replay = $services->record($orderId, (string)$order['order_id'], 'wechat_pay', $context);
        self::assertSame((int)$first['id'], (int)$replay['id'], 'an identical replay reuses the recorded attempt');

        foreach ([
            'amount' => ['total_fee' => '12.00'],
            'payer' => ['pay_uid' => $user['uid'] + 1],
            'merchant' => ['mch_id' => '1900000002'],
            'app' => ['app_id' => 'wx-app-2'],
            'channel' => ['channel' => '1'],
            'driver' => null,
        ] as $label => $override) {
            try {
                if ($override === null) {
                    $services->record($orderId, (string)$order['order_id'], 'v3_wechat_pay', $context);
                } else {
                    $services->record($orderId, (string)$order['order_id'], 'wechat_pay', array_merge($context, $override));
                }
                self::fail(sprintf('a changed %s must not overwrite the recorded attempt', $label));
            } catch (\crmeb\exceptions\ApiException $e) {
                self::assertStringContainsString('人工核对', $e->getMessage(), 'a changed context asks for manual handling');
            }
        }

        $row = BusinessSnapshot::attemptByOutTradeNo((string)$order['order_id']);
        self::assertSame('10.00', (string)$row['total_fee'], 'the recorded amount is untouched');
        self::assertSame('1900000001', (string)$row['mch_id'], 'the recorded merchant is untouched');
    }

    /**
     * PAY-008: when the configured merchant identity no longer matches the
     * identity recorded on the attempt, cancellation stops for manual handling
     * instead of settling against the wrong merchant or releasing resources.
     */
    public function testConfigIdentityMismatchStopsCancellationForManualHandling(): void
    {
        [$orderId, $outTradeNo] = $this->createPayableOrder();
        /** @var \app\services\order\StoreOrderPaymentAttemptServices $services */
        $services = app()->make(\app\services\order\StoreOrderPaymentAttemptServices::class);
        $order = BusinessSnapshot::order($orderId);
        $services->record($orderId, $outTradeNo, 'wechat_pay', [
            'mch_id' => 'changed-away-mch', 'app_id' => 'changed-away-app',
            'channel' => '2', 'pay_type' => 'weixin', 'total_fee' => '10.00', 'pay_uid' => $order['uid'],
        ]);
        $stockBefore = (int)Db::name('store_product')->where('id', Db::name('store_order_cart_info')->where('oid', $orderId)->value('product_id'))->value('stock');

        try {
            app()->make(StoreOrderServices::class)->cancelUnpaidOrder($orderId, 'identity mismatch test');
            self::fail('a config identity mismatch must stop the cancellation');
        } catch (\crmeb\exceptions\ApiException $e) {
            self::assertStringContainsString('身份不匹配', $e->getMessage());
        }

        self::assertSame(0, (int)BusinessSnapshot::order($orderId)['is_cancel'], 'nothing was cancelled');
        self::assertSame($stockBefore, (int)Db::name('store_product')->where('id', Db::name('store_order_cart_info')->where('oid', $orderId)->value('product_id'))->value('stock'), 'no stock was released');
        self::assertSame(0, (int)Db::name('store_order_status')->where(['oid' => $orderId, 'change_type' => 'coupon_back'])->count(), 'no coupon was returned');
    }

    /**
     * @return array{0:int,1:string} order primary key and its merchant order number
     */
    private function createPayableOrder(): array
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $fixtures->createProduct([], ['stock' => 5]);
        $order = $fixtures->createOrder($user['uid'], [
            'pay_type' => 'weixin',
            'pay_uid' => $user['uid'],
            'total_price' => '10.00',
            'pay_price' => '10.00',
        ]);
        $fixtures->createOrderCart($order['id'], $user['uid'], [
            'product_id' => $product['id'],
            'cart_info' => ['product_id' => $product['id']],
        ]);

        return [$order['id'], (string)$order['order_id']];
    }

    private function waitUntil(callable $probe, float $timeoutSeconds = 10.0): bool
    {
        $deadline = microtime(true) + $timeoutSeconds;
        while (microtime(true) < $deadline) {
            if ($probe()) {
                return true;
            }
            usleep(50_000);
        }

        return false;
    }
}
