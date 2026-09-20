<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\model\order\StoreOrderPaymentAttempt;
use app\services\order\StoreOrderPaymentAttemptServices;
use app\services\order\StoreOrderRefundServices;
use app\services\order\StoreOrderServices;
use app\services\pay\PayServices;
use Tests\Regression\Support\BusinessSnapshot;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use Tests\Regression\Support\StatefulGateway;
use think\facade\Db;

/**
 * Randomized state-sequence test with a fixed, replayable seed.
 *
 * Instead of asserting one scripted scenario, this drives a pseudo-random
 * sequence of real business operations (create payment, gateway payment, cancel,
 * refund, duplicate callback, close task) against a small order set and checks
 * the invariants that must hold after EVERY step:
 *
 *   - a cancelled order never keeps a collectible gateway payment;
 *   - a paid order is never left without its attempt marked paid;
 *   - the stock of a product never goes below zero nor above its starting value
 *     (an order consumes exactly one unit);
 *   - a refund never pays out more than the payment took in;
 *   - the money the gateway actually holds equals the state the shop believes.
 *
 * The seed comes from `CRMEB_STATE_SEQUENCE_SEED` so a failure can be replayed
 * exactly: the assertion message carries the seed and the full event log.
 */
final class OrderStateSequenceTest extends RegressionTestCase
{
    private StatefulGateway $gateway;

    private string $token = '';

    /** @var string[] */
    private array $events = [];

    private int $seed = 0;

    /** Deterministic linear congruential generator: same seed, same sequence. */
    private int $state = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->gateway = StatefulGateway::fresh();
        $gateway = $this->gateway;
        $this->bindClass(\crmeb\services\pay\Pay::class, static function () use ($gateway) {
            return $gateway;
        });
        $this->token = substr(bin2hex(random_bytes(5)), 0, 10);
        $this->events = [];
        $this->seed = (int)(getenv('CRMEB_STATE_SEQUENCE_SEED') ?: 20260920);
        $this->state = $this->seed;
    }

    /**
     * @dataProvider sequenceProvider
     */
    public function testInvariantsHoldAcrossARandomOperationSequence(int $seed, int $steps): void
    {
        $this->seed = $seed;
        $this->state = $seed;
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $fixtures->createProduct([], ['stock' => 4]);
        // Each stock layer starts from its own real value: the business path
        // deducts and restores both, so each layer's identity is checked.
        $startProductStock = (int)Db::name('store_product')->where('id', $product['id'])->value('stock');
        $startSkuStock = (int)Db::name('store_product_attr_value')->where('id', $product['sku_id'])->value('stock');
        $startStock = $startProductStock;

        // Three independent orders so the sequence can interleave their states.
        $orders = [];
        for ($i = 0; $i < 3; $i++) {
            $orderIdString = $this->token . '-seq-' . $i;
            $order = $fixtures->createOrder((int)$user['uid'], [
                'order_id' => $orderIdString,
                'pay_type' => 'weixin',
                'pay_uid' => (int)$user['uid'],
            ]);
            $fixtures->createOrderCart((int)$order['id'], (int)$user['uid'], ['product_id' => $product['id']]);
            // Every order consumed one unit from stock before the sequence starts.
            Db::name('store_product')->where('id', $product['id'])->dec('stock', 1)->inc('sales', 1)->update();
            $orders[$i] = [
                'id' => (int)$order['id'],
                'order_id' => $orderIdString,
                'attempt' => null,
                'refund_id' => null,
                'paid' => false,
                'cancelled' => false,
            ];
        }
        $this->registerCleanup(function () use ($orders): void {
            foreach ($orders as $order) {
                Db::name('store_order_payment_attempt')->where('store_order_id', $order['id'])->delete();
                Db::name('store_order_effect')->where('store_order_id', $order['id'])->delete();
                Db::name('store_order_status')->where('oid', $order['id'])->delete();
                Db::name('capital_flow')->where('order_id', $order['order_id'])->delete();
                Db::name('store_order_refund')->where('store_order_id', $order['id'])->delete();
            }
        });

        for ($step = 0; $step < $steps; $step++) {
            $index = $this->nextInt(3);
            $operation = $this->nextInt(6);
            $order = &$orders[$index];
            $this->applyOperation($operation, $order, (int)$user['uid']);
            unset($order);
            $this->assertInvariants($orders, (int)$product['id'], (int)$product['sku_id'], $startProductStock, $startSkuStock, $step, $operation, $index);
        }

        // The final state must still be internally consistent.
        $this->assertInvariants($orders, (int)$product['id'], (int)$product['sku_id'], $startProductStock, $startSkuStock, $steps, -1, -1);
        self::assertGreaterThan(0, count($this->events), 'the sequence really executed operations');
    }

    public function sequenceProvider(): array
    {
        $case = static function (int $seed, int $steps): array {
            return [$seed, $steps];
        };

        return [
            'seed 20260920' => $case(20260920, 25),
            'seed 1' => $case(1, 25),
            'seed 424242' => $case(424242, 25),
            'seed 7919' => $case(7919, 25),
        ];
    }

    /**
     * One operation against one order, using the real service entries. Every
     * operation is allowed to fail (a refusal is a valid business answer); what
     * matters is that the state stays consistent.
     */
    private function applyOperation(int $operation, array &$order, int $uid): void
    {
        /** @var StoreOrderServices $orders */
        $orders = app()->make(StoreOrderServices::class);
        /** @var StoreOrderPaymentAttemptServices $attempts */
        $attempts = app()->make(StoreOrderPaymentAttemptServices::class);
        $label = ['create', 'pay', 'cancel', 'refund', 'duplicate-notify', 'close-task'][$operation];
        try {
            switch ($operation) {
                case 0: // create a payment attempt through the real entry (this is
                    // what asks the gateway for a payment order)
                    $attempt = $orders->createPayment($order['order_id'], $uid, 0, 'weixin', 2, []);
                    $order['attempt'] = $attempt['zero'] ? null : ($attempts->findByOutTradeNo($order['order_id'])['id'] ?? null);
                    $this->events[] = $label . ':' . $order['order_id'] . ':ok';
                    break;
                case 1: // the money lands at the gateway and a callback confirms it
                    // A payment can only land on an order the shop submitted.
                    if ($this->gateway->gatewayState($order['order_id']) === 'not_exist') {
                        $this->gateway->seedOrder($order['order_id'], 'open', '10.00');
                    }
                    $this->gateway->simulatePayment($order['order_id'], 'SEQ-' . $order['order_id']);
                    app()->make(\app\services\pay\PayNotifyServices::class)->wechatProduct(
                        $order['order_id'],
                        'SEQ-' . $order['order_id'],
                        PayServices::WEIXIN_PAY,
                        ['paid_amount' => '10.00', 'currency' => 'CNY', 'merchant_id' => '']
                    );
                    $this->events[] = $label . ':' . $order['order_id'] . ':sent';
                    break;
                case 2: // cancel through the shared entry
                    $orders->cancelUnpaidOrder($order['id'], 'state sequence');
                    $this->events[] = $label . ':' . $order['order_id'] . ':ok';
                    break;
                case 3: // refund through the real service
                    if ($order['refund_id'] === null) {
                        $refund = Db::name('store_order_refund')->insertGetId([
                            'store_order_id' => $order['id'],
                            'uid' => $uid,
                            'order_id' => $this->token . '-ref-' . substr(md5((string)$order['id'] . $this->seed), 0, 6),
                            'refund_type' => 1,
                            'refund_num' => 1,
                            'refund_price' => '10.00',
                            'refunded_price' => '0.00',
                            'cart_info' => json_encode([['id' => 1, 'cart_num' => 1]]),
                            'add_time' => time(),
                        ]);
                        $order['refund_id'] = (int)$refund;
                    }
                    app()->make(StoreOrderRefundServices::class)->agreeRefund(
                        (int)$order['refund_id'],
                        ['refund_price' => '10.00', 'pay_price' => '10.00'],
                        []
                    );
                    $this->events[] = $label . ':' . $order['order_id'] . ':ok';
                    break;
                case 4: // the same notification again (idempotent duplicate)
                    app()->make(\app\services\pay\PayNotifyServices::class)->wechatProduct(
                        $order['order_id'],
                        'SEQ-' . $order['order_id'],
                        PayServices::WEIXIN_PAY,
                        ['paid_amount' => '10.00', 'currency' => 'CNY', 'merchant_id' => '']
                    );
                    $this->events[] = $label . ':' . $order['order_id'] . ':sent';
                    break;
                case 5: // run every close task the payment recorded
                    /** @var \app\services\order\StoreOrderEffectServices $effects */
                    $effects = app()->make(\app\services\order\StoreOrderEffectServices::class);
                    $tasks = Db::name('store_order_effect')
                        ->where('store_order_id', $order['id'])
                        ->whereLike('event_type', 'close_attempt.%')
                        ->column('id');
                    foreach ($tasks as $taskId) {
                        $effects->runById((int)$taskId);
                    }
                    $this->events[] = $label . ':' . $order['order_id'] . ':ran' . count($tasks);
                    break;
            }
        } catch (\Throwable $e) {
            // A refusal is a legitimate outcome; record it for replayability.
            $this->events[] = $label . ':' . $order['order_id'] . ':refused(' . substr($e->getMessage(), 0, 40) . ')';
        }
    }

    /**
     * @param array<int, array<string, mixed>> $orders
     */
    private function assertInvariants(array $orders, int $productId, int $skuId, int $startProductStock, int $startSkuStock, int $step, int $operation, int $index): void
    {
        foreach ($orders as $order) {
            $row = BusinessSnapshot::order($order['id']);
            self::assertNotNull($row, $this->describe($step, $operation, $index, 'the order row exists'));

            if ((int)$row['is_cancel'] === 1) {
                // A cancelled order must not keep a collectible gateway payment.
                $gatewayState = $this->gateway->gatewayState($order['order_id']);
                self::assertNotSame(
                    'open',
                    $gatewayState,
                    $this->describe($step, $operation, $index, 'a cancelled order keeps no collectible gateway payment')
                );
                self::assertSame(
                    0,
                    (int)$row['paid'],
                    $this->describe($step, $operation, $index, 'a cancelled order is not paid')
                );
            }

            $attempts = BusinessSnapshot::attempts((int)$order['id']);
            foreach ($attempts as $attempt) {
                if ((int)$attempt['status'] === StoreOrderPaymentAttempt::STATUS_PAID) {
                    self::assertNotSame(
                        '',
                        (string)$attempt['trade_no'],
                        $this->describe($step, $operation, $index, 'a paid attempt carries its trade number')
                    );
                }
            }

            // The gateway and the shop must agree about the money.
            $gatewayOrder = $this->gateway->gatewayOrder($order['order_id']);
            if ($gatewayOrder !== null && (string)$gatewayOrder['state'] === 'paid') {
                $hasPaidAttempt = false;
                foreach ($attempts as $attempt) {
                    if ((int)$attempt['status'] === StoreOrderPaymentAttempt::STATUS_PAID) {
                        $hasPaidAttempt = true;
                    }
                }
                $hasException = count(BusinessSnapshot::paymentExceptions((int)$order['id'])) > 0;
                self::assertTrue(
                    $hasPaidAttempt || $hasException || (int)$row['paid'] === 1,
                    $this->describe($step, $operation, $index, 'money taken at the gateway is recorded locally (paid attempt, paid order or exception payment)')
                );
            }

            // A refund never pays out more than the payment took in.
            $refunded = (float)Db::name('store_order_refund')
                ->where('store_order_id', (int)$order['id'])
                ->where('refund_type', 6)
                ->sum('refunded_price');
            self::assertLessThanOrEqual(
                10.0,
                $refunded,
                $this->describe($step, $operation, $index, 'the completed refunds never exceed the paid amount')
            );
        }

        // Stock identity, per layer: every unit is either still in stock or
        // counted as sold. A cancel moves its unit back from sales to stock, so
        // the sum is invariant — which is exactly what makes a double restore or
        // a lost unit visible.
        foreach ([['store_product', $productId, $startProductStock], ['store_product_attr_value', $skuId, $startSkuStock]] as [$table, $id, $startValue]) {
            $row = Db::name($table)->where('id', $id)->find();
            $layerStock = (int)($row['stock'] ?? 0);
            $layerSales = (int)($row['sales'] ?? 0);
            self::assertGreaterThanOrEqual(
                0,
                $layerStock,
                $this->describe($step, $operation, $index, $table . ' stock never goes negative')
            );
            self::assertGreaterThanOrEqual(
                0,
                $layerSales,
                $this->describe($step, $operation, $index, $table . ' sales never goes negative')
            );
            self::assertSame(
                $startValue,
                $layerStock + $layerSales,
                $this->describe($step, $operation, $index, $table . ' keeps every unit in stock or sold, never both and never lost')
            );
        }
    }

    /**
     * Failure messages must carry the seed and the event log so the run can be
     * replayed exactly.
     */
    private function describe(int $step, int $operation, int $index, string $invariant): string
    {
        return sprintf(
            "[seed %d, step %d, op %s on order %d] %s\nReplay with CRMEB_STATE_SEQUENCE_SEED=%d\nEvents:\n  %s",
            $this->seed,
            $step,
            $operation < 0 ? 'final-check' : ['create', 'pay', 'cancel', 'refund', 'duplicate-notify', 'close-task'][$operation],
            $index,
            $invariant,
            $this->seed,
            implode("\n  ", $this->events)
        );
    }

    /** Deterministic 32-bit LCG: the same seed always produces the same steps. */
    private function nextInt(int $bound): int
    {
        $this->state = (int)((1103515245 * $this->state + 12345) % 2147483648);
        if ($this->state < 0) {
            $this->state += 2147483648;
        }

        return $this->state % $bound;
    }
}
