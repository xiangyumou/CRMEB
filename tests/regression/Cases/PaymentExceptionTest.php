<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\model\order\StoreOrderPaymentException;
use app\services\order\StoreOrderPaymentAttemptServices;
use app\services\order\StoreOrderPaymentExceptionServices;
use app\services\order\StoreOrderSuccessServices;
use app\services\pay\PayNotifyServices;
use Tests\Regression\Support\BusinessSnapshot;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use Tests\Regression\Support\StatefulGateway;
use think\facade\Db;

/**
 * Exception payments: money the gateway took but the order cannot accept.
 *
 * Every anomaly path persists an exception record (the alarm) keyed uniquely by
 * merchant + trade number, acknowledges the notification only after the record
 * committed, never re-deducts stock or re-runs fulfillment, and refunds only by
 * explicit human command through the stable refund number.
 */
final class PaymentExceptionTest extends RegressionTestCase
{
    private StatefulGateway $gateway;

    /** Unique per test: merchant order numbers and trade numbers must not collide across runs. */
    private string $token = '';

    /** @var int[] */
    private array $orderIds = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->gateway = StatefulGateway::fresh();
        $gateway = $this->gateway;
        $this->bindClass(\crmeb\services\pay\Pay::class, static function () use ($gateway) {
            return $gateway;
        });
        $token = substr(bin2hex(random_bytes(5)), 0, 10);
        $this->token = $token;
        $this->registerCleanup(function () use ($token): void {
            Db::name('store_order_payment_attempt')->whereLike('out_trade_no', $token . '%')->delete();
            Db::name('store_order_payment_exception')->whereLike('out_trade_no', $token . '%')->delete();
            Db::name('store_order_payment_exception')->whereLike('trade_no', $token . '%')->delete();
            if ($this->orderIds) {
                Db::name('store_order_effect')->whereIn('store_order_id', $this->orderIds)->delete();
            }
        });
    }

    /** A unique merchant order number for this test run. */
    private function trade(string $label): string
    {
        return $this->token . '-' . $label;
    }

    /** Remember an order so its effect rows are cleaned up with the test. */
    private function track(int $orderId): int
    {
        $this->orderIds[] = $orderId;

        return $orderId;
    }

    /**
     * Two payers both paid. The first payment completes the order; the second
     * real payment (a different trade number) is kept as an exception, the
     * notification is acknowledged, and no stock or fulfillment runs twice.
     */
    public function testASecondRealPaymentBecomesAPersistedException(): void
    {
        $this->setMerchantConfig('M1');
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $fixtures->createProduct([], ['stock' => 5]);
        // In production the attempt's merchant order number IS the order's
        // order_id; the fixture is aligned so the payment effects key on it.
        $order = $fixtures->createOrder($user['uid'], ['pay_type' => 'weixin', 'order_id' => $this->trade('order-a')]);
        $fixtures->createOrderCart($order['id'], $user['uid'], ['product_id' => $product['id']]);
        $orderId = $this->track((int)$order['id']);

        /** @var StoreOrderPaymentAttemptServices $attempts */
        $attempts = app()->make(StoreOrderPaymentAttemptServices::class);
        $context = ['mch_id' => 'M1', 'app_id' => 'wx1', 'channel' => '2', 'pay_type' => 'weixin', 'total_fee' => '10.00', 'pay_uid' => $user['uid']];
        $attempts->record($orderId, $this->trade('order-a'), 'wechat_pay', $context);
        $attempts->record($orderId, $this->trade('order-b'), 'wechat_pay', $context);
        $this->gateway->seedOrder($this->trade('order-a'), 'paid');
        $this->gateway->simulatePayment($this->trade('order-a'), $this->trade('trade-a'));

        self::assertTrue($this->notify($this->trade('order-a'), $this->trade('trade-a')), 'the first payment notification completes the order');
        self::assertSame(1, (int)BusinessSnapshot::order($orderId)['paid']);
        $stockBefore = (int)Db::name('store_product')->where('id', $product['id'])->value('stock');

        // The second real payment lands on the still-open attempt B.
        $this->gateway->simulatePayment($this->trade('order-b'), $this->trade('trade-b'));
        $payload = ['paid_amount' => '10.00', 'currency' => 'CNY', 'merchant_id' => 'M1'];
        self::assertTrue($this->notify($this->trade('order-b'), $this->trade('trade-b'), $payload), 'the second payment is acknowledged once its exception record committed');

        $exceptions = BusinessSnapshot::paymentExceptions($orderId);
        self::assertCount(1, $exceptions, 'exactly one exception record for the second payment');
        self::assertSame(StoreOrderPaymentException::REASON_DUPLICATE, (string)$exceptions[0]['reason']);
        self::assertSame($this->trade('trade-b'), (string)$exceptions[0]['trade_no']);
        self::assertSame($this->trade('order-b'), (string)$exceptions[0]['out_trade_no']);
        self::assertSame('10.00', (string)$exceptions[0]['paid_amount']);
        self::assertGreaterThan(0, (int)$exceptions[0]['alarm_time'], 'the record carries its alarm stamp');
        self::assertSame($stockBefore, (int)Db::name('store_product')->where('id', $product['id'])->value('stock'), 'the exception payment neither deducts nor restores stock');
        self::assertCount(
            1,
            BusinessSnapshot::orderStatusRows($orderId, 'pay_success'),
            'no second pay_success status row'
        );
        self::assertCount(1, BusinessSnapshot::capitalFlows($this->trade('order-a')), 'the first payment wrote its flow exactly once');
        self::assertCount(0, BusinessSnapshot::capitalFlows($this->trade('order-b')), 'the exception payment writes no capital flow');

        // A repeat of the same notification dedupes by trade number.
        self::assertTrue($this->notify($this->trade('order-b'), $this->trade('trade-b'), $payload), 'the duplicate notification is acknowledged');
        self::assertCount(1, BusinessSnapshot::paymentExceptions($orderId), 'the duplicate does not create a second record');

        // A genuinely different trade number is a third real payment: its own record.
        self::assertTrue($this->notify($this->trade('order-b'), $this->trade('trade-c'), $payload), 'the third payment is acknowledged');
        self::assertCount(2, BusinessSnapshot::paymentExceptions($orderId), 'the second real payment has its own record');
    }

    /**
     * A payment that lands on an already cancelled order is persisted, then
     * acknowledged; the released stock stays released.
     */
    public function testAPaymentForACancelledOrderBecomesAPersistedException(): void
    {
        $this->setMerchantConfig('M1');
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $fixtures->createProduct([], ['stock' => 5]);
        $order = $fixtures->createOrder($user['uid'], ['pay_type' => 'weixin']);
        $fixtures->createOrderCart($order['id'], $user['uid'], ['product_id' => $product['id']]);
        $orderId = $this->track((int)$order['id']);

        /** @var StoreOrderPaymentAttemptServices $attempts */
        $attempts = app()->make(StoreOrderPaymentAttemptServices::class);
        $attempts->record($orderId, $this->trade('cancel'), 'wechat_pay', ['mch_id' => 'M1', 'app_id' => 'wx1', 'channel' => '2', 'pay_type' => 'weixin', 'total_fee' => '10.00', 'pay_uid' => $user['uid']]);
        $this->gateway->seedOrder($this->trade('cancel'), 'open', '10.00');

        /** @var \app\services\order\StoreOrderServices $orderServices */
        $orderServices = app()->make(\app\services\order\StoreOrderServices::class);
        self::assertTrue($orderServices->cancelUnpaidOrder($orderId, 'exception test'), 'the cancel closes the gateway order and succeeds');
        $stockAfterCancel = (int)Db::name('store_product')->where('id', $product['id'])->value('stock');

        // The money lands anyway (closed at the gateway, paid in reality).
        $this->gateway->simulatePayment($this->trade('cancel'), $this->trade('trade-late'));
        self::assertTrue(
            $this->notify($this->trade('cancel'), $this->trade('trade-late'), ['paid_amount' => '10.00', 'currency' => 'CNY', 'merchant_id' => 'M1']),
            'the late payment is acknowledged once its exception record committed'
        );

        $exceptions = BusinessSnapshot::paymentExceptions($orderId);
        self::assertCount(1, $exceptions);
        self::assertSame(StoreOrderPaymentException::REASON_CANCELLED, (string)$exceptions[0]['reason']);
        self::assertSame($stockAfterCancel, (int)Db::name('store_product')->where('id', $product['id'])->value('stock'), 'the late payment does not touch the released stock');
        self::assertSame(0, (int)BusinessSnapshot::order($orderId)['paid'], 'the cancelled order stays cancelled');
    }

    /**
     * A notification nobody can match is persisted (unmatched) and acknowledged.
     */
    public function testAnUnmatchablePaymentIsPersistedAndAcknowledged(): void
    {
        self::assertTrue(
            $this->notify('NO-SUCH-TRADE', $this->trade('trade-ghost'), ['paid_amount' => '3.00', 'currency' => 'CNY', 'merchant_id' => 'M9']),
            'the unmatchable notification is acknowledged after persistence'
        );
        $row = Db::name('store_order_payment_exception')->where('trade_no', $this->trade('trade-ghost'))->find();
        self::assertIsArray($row, 'the unmatchable payment is persisted');
        self::assertSame(StoreOrderPaymentException::REASON_UNMATCHED, (string)$row['reason']);
        self::assertSame(0, (int)$row['store_order_id'], 'no order could be matched');
    }

    /**
     * When the exception record cannot commit, the notification asks the
     * gateway to retry instead of swallowing the money.
     */
    public function testAnExceptionPersistenceFailureAsksTheGatewayToRetry(): void
    {
        $failing = $this->getMockBuilder(StoreOrderPaymentExceptionServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['record'])
            ->getMock();
        $failing->method('record')->willThrowException(new \RuntimeException('db write failed'));
        $this->replace(StoreOrderPaymentExceptionServices::class, $failing);

        self::assertFalse(
            $this->notify('NO-SUCH-TRADE', $this->trade('trade-retry'), ['paid_amount' => '3.00', 'currency' => 'CNY', 'merchant_id' => 'M9']),
            'a failed persistence returns failure so the gateway retries'
        );
        self::assertNull(
            Db::name('store_order_payment_exception')->where('trade_no', $this->trade('trade-retry'))->find(),
            'a failed persistence writes no record'
        );
    }

    /**
     * The manual refund uses the stable refund number: repeated execution and a
     * retry after a simulated local failure hit the gateway exactly once.
     */
    public function testManualRefundReusesOneRefundNumberAcrossRetries(): void
    {
        $id = $this->recordException($this->trade('refund'), $this->trade('trade-refund'), '9.99');

        /** @var StoreOrderPaymentExceptionServices $services */
        $services = app()->make(StoreOrderPaymentExceptionServices::class);

        // Wrong confirmation is refused before anything happens.
        try {
            $services->refund($id, 'WRONG-TRADE', 'operator-a');
            self::fail('a wrong confirmed trade number must refuse the refund');
        } catch (\Throwable $e) {
            self::assertStringContainsString('确认交易号与记录不符', $e->getMessage());
        }
        self::assertSame(0, $this->gateway->requestCount('refund', $this->trade('refund')));

        $first = $services->refund($id, $this->trade('trade-refund'), 'operator-a');
        self::assertSame(StoreOrderPaymentException::STATUS_REFUNDED, $first['status']);
        $refundNo = $first['refund_no'];
        self::assertSame(1, $this->gateway->refundRowCount($this->trade('refund')), 'the gateway holds one refund row');
        self::assertSame(
            $refundNo,
            (string)($this->gateway->refundRequests('refund', $refundNo)[0]['refund_no'] ?? ''),
            'the gateway request carried the stable refund number'
        );

        // Simulate "the gateway succeeded but the local update failed": the row
        // is back to pending, the retry must not pay out twice.
        Db::name('store_order_payment_exception')->where('id', $id)->update(['status' => StoreOrderPaymentException::STATUS_PENDING]);
        $retry = $services->refund($id, $this->trade('trade-refund'), 'operator-b');
        self::assertSame(StoreOrderPaymentException::STATUS_REFUNDED, $retry['status']);
        self::assertSame($refundNo, $retry['refund_no'], 'the retry reuses the same refund number');
        self::assertSame(1, $this->gateway->refundRowCount($this->trade('refund')), 'the gateway refunded once across both executions');

        $row = Db::name('store_order_payment_exception')->where('id', $id)->find();
        self::assertSame('operator-b', (string)$row['operator'], 'the last operator is recorded');
        self::assertSame(StoreOrderPaymentException::STATUS_REFUNDED, (int)$row['status']);
    }

    /**
     * A refund the gateway cannot confirm keeps the record in the unknown
     * state with the frozen number, never flips it to refunded.
     */
    public function testAnUnconfirmableRefundStaysUnknownWithTheFrozenNumber(): void
    {
        $id = $this->recordException($this->trade('unknown'), $this->trade('trade-unknown'), '5.00');
        // Every refund attempt for this order fails at the transport: the
        // gateway can never confirm an outcome.
        $this->gateway->failRefundForTrade($this->trade('unknown'));

        /** @var StoreOrderPaymentExceptionServices $services */
        $services = app()->make(StoreOrderPaymentExceptionServices::class);
        $result = $services->refund($id, $this->trade('trade-unknown'), 'operator-c');
        self::assertSame(StoreOrderPaymentException::STATUS_REFUND_UNKNOWN, $result['status']);
        $row = Db::name('store_order_payment_exception')->where('id', $id)->find();
        self::assertStringStartsWith('PE' . $id, (string)$row['refund_no'], 'the frozen number is persisted');
        self::assertNotSame('', (string)$row['refund_no'], 'the frozen number is persisted');
        $request = json_decode((string)$row['refund_request'], true);
        self::assertFalse((bool)($request['gateway_accepted'] ?? true), 'the recorded gateway answer is kept');
        self::assertNotSame('', (string)($request['error'] ?? ''), 'the transport error text is recorded');
    }

    /**
     * The reconcile command lists the pending exceptions and drives a refund.
     */
    public function testTheReconcileCommandListsPendingExceptionsAndRefunds(): void
    {
        $id = $this->recordException($this->trade('cli'), $this->trade('trade-cli'), '7.77');

        $cli = escapeshellarg(dirname(__DIR__) . '/Support/reconcile-cli.php');
        $listing = shell_exec('php ' . $cli . ' payments:list 2>&1');
        self::assertIsString($listing);
        self::assertStringContainsString($this->trade('trade-cli'), (string)$listing, 'the pending exception is listed');
        self::assertStringContainsString('unmatched_payment', (string)$listing);

        $refund = shell_exec('php ' . $cli . ' payments:refund ' . $id . ' --confirm-trade-no ' . escapeshellarg($this->trade('trade-cli')) . ' --operator cli-operator 2>&1');
        self::assertIsString($refund);
        self::assertStringContainsString('退款完成', (string)$refund, 'the CLI refund completes');
        $row = Db::name('store_order_payment_exception')->where('id', $id)->find();
        self::assertSame(StoreOrderPaymentException::STATUS_REFUNDED, (int)$row['status']);
        self::assertSame('cli-operator', (string)$row['operator']);
    }

    /**
     * Close tasks recorded by paySuccess really close the other attempts at the
     * gateway; a close that discovers money records an exception instead.
     */
    public function testCloseTasksReallyCloseOtherAttemptsAtTheGateway(): void
    {
        $this->setMerchantConfig('M1');
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], ['pay_type' => 'weixin']);
        $orderId = $this->track((int)$order['id']);

        /** @var StoreOrderPaymentAttemptServices $attempts */
        $attempts = app()->make(StoreOrderPaymentAttemptServices::class);
        $context = ['mch_id' => 'M1', 'app_id' => 'wx1', 'channel' => '2', 'pay_type' => 'weixin', 'total_fee' => '10.00', 'pay_uid' => $user['uid']];
        $attempts->record($orderId, $this->trade('close-a'), 'wechat_pay', $context);
        $attempts->record($orderId, $this->trade('close-b'), 'wechat_pay', $context);

        // First attempt paid, second still open at the gateway.
        $this->gateway->seedOrder($this->trade('close-a'), 'paid');
        $this->gateway->simulatePayment($this->trade('close-a'), $this->trade('trade-a'));
        $this->gateway->seedOrder($this->trade('close-b'), 'open');

        /** @var StoreOrderSuccessServices $success */
        $success = app()->make(StoreOrderSuccessServices::class);
        self::assertTrue($success->paySuccess(BusinessSnapshot::order($orderId), 'weixin', ['trade_no' => $this->trade('trade-a'), 'out_trade_no' => $this->trade('close-a')]));

        $task = Db::name('store_order_effect')
            ->where('store_order_id', $orderId)
            ->whereLike('event_type', 'close_attempt.%')
            ->find();
        self::assertIsArray($task, 'paySuccess recorded a per-attempt close task inside its transaction');

        /** @var \app\services\order\StoreOrderEffectServices $effects */
        $effects = app()->make(\app\services\order\StoreOrderEffectServices::class);
        self::assertTrue($effects->runById((int)$task['id']), 'the close task runs');
        self::assertSame('closed', $this->gateway->gatewayState($this->trade('close-b')), 'the gateway order was really closed');
        $attemptB = BusinessSnapshot::attemptByOutTradeNo($this->trade('close-b'));
        self::assertSame(2, (int)$attemptB['status'], 'the attempt is marked closed only after the gateway confirmed');
    }

    /**
     * A close task that finds the money on a second attempt records an
     * exception payment instead of closing the attempt.
     */
    public function testACloseTaskThatDiscoversMoneyRecordsAnException(): void
    {
        $this->setMerchantConfig('M1');
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], ['pay_type' => 'weixin']);
        $orderId = $this->track((int)$order['id']);

        /** @var StoreOrderPaymentAttemptServices $attempts */
        $attempts = app()->make(StoreOrderPaymentAttemptServices::class);
        $context = ['mch_id' => 'M1', 'app_id' => 'wx1', 'channel' => '2', 'pay_type' => 'weixin', 'total_fee' => '10.00', 'pay_uid' => $user['uid']];
        $attempts->record($orderId, $this->trade('disc-a'), 'wechat_pay', $context);
        $attempts->record($orderId, $this->trade('disc-b'), 'wechat_pay', $context);
        $this->gateway->seedOrder($this->trade('disc-a'), 'paid');
        $this->gateway->simulatePayment($this->trade('disc-a'), $this->trade('trade-a'));
        $this->gateway->seedOrder($this->trade('disc-b'), 'paid');
        $this->gateway->simulatePayment($this->trade('disc-b'), $this->trade('trade-b'));

        /** @var StoreOrderSuccessServices $success */
        $success = app()->make(StoreOrderSuccessServices::class);
        self::assertTrue($success->paySuccess(BusinessSnapshot::order($orderId), 'weixin', ['trade_no' => $this->trade('trade-a'), 'out_trade_no' => $this->trade('disc-a')]));

        $task = Db::name('store_order_effect')
            ->where('store_order_id', $orderId)
            ->whereLike('event_type', 'close_attempt.%')
            ->find();
        self::assertIsArray($task);

        /** @var \app\services\order\StoreOrderEffectServices $effects */
        $effects = app()->make(\app\services\order\StoreOrderEffectServices::class);
        self::assertTrue($effects->runById((int)$task['id']), 'the close task completes after recording the exception');
        $attemptB = BusinessSnapshot::attemptByOutTradeNo($this->trade('disc-b'));
        self::assertSame(1, (int)$attemptB['status'], 'the attempt is marked paid with the discovered trade number');
        self::assertSame($this->trade('trade-b'), (string)$attemptB['trade_no']);
        $exceptions = BusinessSnapshot::paymentExceptions($orderId);
        self::assertCount(1, $exceptions);
        self::assertSame(StoreOrderPaymentException::REASON_DUPLICATE, (string)$exceptions[0]['reason']);
        self::assertSame($this->trade('trade-b'), (string)$exceptions[0]['trade_no']);
    }

    /**
     * Notify helper: drive the real notification entry with a normalized payload.
     */
    private function notify(string $outTradeNo, string $tradeNo, array $payload = []): bool
    {
        /** @var PayNotifyServices $notify */
        $notify = app()->make(PayNotifyServices::class);

        return $notify->wechatProduct($outTradeNo, $tradeNo, 'weixin', $payload);
    }

    /**
     * Point the current configuration at the merchant the tests record, the way
     * NotifyListener's identity check compares against it. Restored on cleanup.
     */
    private function setMerchantConfig(string $mchId, string $appId = 'wx1'): void
    {
        $original = [];
        foreach (['pay_weixin_mchid' => $mchId, 'pay_sub_merchant_id' => '', 'wechat_appid' => $appId] as $key => $value) {
            $row = Db::name('system_config')->where('menu_name', $key)->find();
            if (!$row) {
                continue;
            }
            $original[$key] = $row;
            // system_config values are JSON-encoded (getConfigValue decodes them).
            Db::name('system_config')->where('id', $row['id'])->update(['value' => json_encode($value)]);
            \crmeb\services\CacheService::delete(\crmeb\services\SystemConfigService::CACHE_SYSTEM . '_' . $key);
        }
        $this->registerCleanup(static function () use ($original): void {
            foreach ($original as $key => $row) {
                Db::name('system_config')->where('id', $row['id'])->update(['value' => $row['value']]);
                \crmeb\services\CacheService::delete(\crmeb\services\SystemConfigService::CACHE_SYSTEM . '_' . $key);
            }
        });
    }

    /**
     * Seed one exception record through the real service.
     */
    private function recordException(string $outTradeNo, string $tradeNo, string $amount): int
    {
        // The gateway really took this money: seed the paid gateway order the
        // record refers to, so the refund path is coherent.
        $this->gateway->seedOrder($outTradeNo, 'paid', $amount);
        $this->gateway->simulatePayment($outTradeNo, $tradeNo);

        /** @var StoreOrderPaymentExceptionServices $services */
        $services = app()->make(StoreOrderPaymentExceptionServices::class);

        return $services->record([
            'store_order_id' => 0,
            'payment_attempt_id' => 0,
            'mch_id' => 'M1',
            'trade_no' => $tradeNo,
            'out_trade_no' => $outTradeNo,
            'reason' => StoreOrderPaymentException::REASON_UNMATCHED,
            'paid_amount' => $amount,
            'currency' => 'CNY',
            'payment_context' => ['driver' => 'wechat_pay', 'channel' => 2, 'out_trade_no' => $outTradeNo],
        ]);
    }
}
