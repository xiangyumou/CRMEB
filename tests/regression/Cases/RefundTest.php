<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\order\StoreOrderRefundDao;
use app\services\activity\advance\StoreAdvanceServices;
use app\services\activity\combination\StoreCombinationServices;
use app\services\order\StoreOrderCartInfoServices;
use app\services\order\StoreOrderRefundServices;
use app\services\order\StoreOrderServices;
use app\services\product\product\StoreProductServices;
use crmeb\exceptions\AdminException;
use crmeb\services\pay\Pay;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class RefundTest extends RegressionTestCase
{
    /**
     * Refunds replay the original channel only. Orders paid with a retired
     * method have no channel left, so refunding must stop instead of guessing.
     * @dataProvider retiredPayTypes
     */
    public function testRetiredPayTypesAreRefusedInsteadOfRefunded(string $payType): void
    {
        $this->expectException(AdminException::class);
        $this->expectExceptionMessage('该订单为历史支付方式，无法原路退款，请线下处理后标记已退款');
        $this->refundService()->exposeGuard(['pay_type' => $payType]);
    }

    public function retiredPayTypes(): array
    {
        return [['yue'], ['offline'], ['alipay'], ['allinpay'], ['']];
    }

    /**
     * The complement of the refusal above: a WeChat order passes the guard, so
     * the rejection can never be a blanket "refunds are disabled". The guard is
     * fed a model the way the dispatch code does, which is what a type change
     * here silently breaks.
     */
    public function testWechatOrdersPassTheRefundGuard(): void
    {
        $order = new class {
            public $pay_type = 'weixin';
            public function getAttr(string $name): string
            {
                return $name === 'pay_type' ? $this->pay_type : '';
            }
        };
        $this->refundService()->exposeGuard($order);
        self::assertTrue(true, 'the guard returns instead of raising');
    }

    /**
     * A presale order is deducted in three ledgers: the presale activity row, the
     * type-6 presale SKU, and the ordinary product row plus its type-0 SKU. Restoring
     * it through the ordinary product method looks up the presale id in the product
     * table, changes nothing, and still reports success. The ids and SKUs are all
     * different on purpose, so an accidental swap cannot pass by coincidence.
     */
    public function testPresaleOrdersRestoreTheAdvanceAndProductStockLayers(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $product = $fixtures->createProduct(
            ['stock' => 10, 'sales' => 2],
            ['stock' => 10, 'sales' => 2, 'quota' => 5, 'quota_show' => 5, 'suk' => 'presale', 'unique' => 'PRODUCT1']
        );
        $advance = $fixtures->createAdvance($product['id'], [], ['suk' => 'presale', 'unique' => 'PRESALE1']);
        self::assertNotSame((string)$product['id'], (string)$advance['id']);

        $order = $this->presaleOrder($fixtures, $product, $advance, 2);

        self::assertTrue($this->refundService()->regressionStock($order), 'the restore reports success');
        self::assertSame([
            'product' => ['stock' => 12, 'sales' => 0],
            'product_sku' => ['stock' => 12, 'sales' => 0],
            'advance' => ['stock' => 7, 'sales' => 1],
            'advance_sku' => ['stock' => 7, 'sales' => 1],
        ], $fixtures->stockLayers($product, $advance));
    }

    /**
     * Which ledger an order was sold from is only recorded by `combination_id` or
     * `advance_id`; getting the branch order wrong silently moves another product's
     * stock. Each layer is asserted on its own arguments.
     *
     * @dataProvider stockLayerProvider
     */
    public function testStockIsRestoredThroughTheLayerTheOrderSold(int $combinationId, int $advanceId, string $soldFrom): void
    {
        $order = ['status' => 0, 'is_del' => 0, 'combination_id' => $combinationId, 'advance_id' => $advanceId, 'cart_id' => 55];
        $cart = $this->getMockBuilder(StoreOrderCartInfoServices::class)
            ->disableOriginalConstructor()
            ->addMethods(['getCartInfoList'])
            ->getMock();
        $cart->expects(self::once())->method('getCartInfoList')
            ->with(['cart_id' => 55], ['cart_info'])
            ->willReturn([[
                'cart_info' => ['cart_num' => 3, 'productInfo' => ['id' => 41, 'attrInfo' => ['unique' => 'SKU-A']]],
            ]]);

        $this->replace(StoreOrderCartInfoServices::class, $cart);
        $this->replace(StoreCombinationServices::class, $this->stockLayerMock(StoreCombinationServices::class, 'incCombinationStock', 'combination', $soldFrom, [3, 88, 'SKU-A']));
        $this->replace(StoreAdvanceServices::class, $this->stockLayerMock(StoreAdvanceServices::class, 'incAdvanceStock', 'advance', $soldFrom, [3, 77, 'SKU-A']));
        $this->replace(StoreProductServices::class, $this->stockLayerMock(StoreProductServices::class, 'incProductStock', 'product', $soldFrom, [3, 41, 'SKU-A']));

        self::assertTrue($this->refundService()->regressionStock($order));
    }

    public function stockLayerProvider(): array
    {
        return [
            'group buy restores the combination ledger' => [88, 0, 'combination'],
            'presale restores the presale ledger' => [0, 77, 'advance'],
            'ordinary product restores the product ledger' => [0, 0, 'product'],
        ];
    }

    /**
     * A stock restore that returns false used to be ignored: the refund carried on,
     * called the gateway and left the database short of stock. The failure has to
     * travel out of the transaction before anything irreversible happens.
     */
    public function testAStockRestoreFailureStopsTheRefundBeforeTheGateway(): void
    {
        $order = [
            'id' => 4242, 'uid' => 7, 'order_id' => 'ORDER-4242', 'status' => 0, 'is_del' => 0,
            'combination_id' => 0, 'advance_id' => 0, 'cart_id' => 1, 'virtual_type' => 0,
            'coupon_id' => 0, 'coupon_price' => '0.00', 'pid' => 0, 'pay_type' => 'weixin',
            'trade_no' => '', 'is_channel' => 0, 'pay_price' => '10.00',
        ];
        $service = new class($this->createMock(StoreOrderRefundDao::class), $this->createMock(StoreOrderServices::class)) extends StoreOrderRefundServices {
            public function regressionStock($order)
            {
                return false;
            }
        };
        $gatewayResolved = false;
        $this->bindClass(Pay::class, static function () use (&$gatewayResolved) {
            $gatewayResolved = true;
            return new class extends Pay {
                public function refund(string $orderNo, array $options)
                {
                    return true;
                }
            };
        });

        try {
            $service->payOrderRefund(0, $order, ['refund_price' => '10.00']);
            self::fail('a failed stock restore must abort the refund');
        } catch (AdminException $exception) {
            self::assertSame('库存回退失败', $exception->getMessage());
        }

        self::assertFalse($gatewayResolved, 'the refund must stop before the payment gateway');
        self::assertSame(0, (int)Db::name('store_order_status')->where(['oid' => 4242, 'change_type' => 'refund_price'])->count());
    }

    /**
     * The refund gateway call cannot be rolled back with the transaction that raised
     * it, so a retry — the same admin after a local failure, or a concurrent one —
     * has to replay the same gateway number and the same amount. A second attempt
     * that asked for more money would be a second refund request, not a retry.
     */
    public function testRefundNumberAndAmountStayFrozenAcrossRetries(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid']);
        $refund = $fixtures->createRefundOrder($user['uid'], $order['id'], [
            'refund_type' => 1, 'refund_price' => '10.00', 'out_refund_no' => '', 'refund_request' => '',
        ]);
        $service = $this->freezingRefundService();

        $first = $service->exposeFreeze((int)$refund['id'], ['refund_price' => '10.00', 'pay_price' => '10.00']);
        self::assertSame((string)$refund['order_id'], $first['out_refund_no'], 'the persisted after-sale number is the gateway number');
        self::assertSame(10.0, $first['refund_price']);

        $second = $service->exposeFreeze((int)$refund['id'], ['refund_price' => '99.00', 'pay_price' => '99.00']);
        self::assertSame($first['out_refund_no'], $second['out_refund_no'], 'the retry reuses the same gateway number');
        self::assertSame(10.0, $second['refund_price'], 'the retry cannot raise the frozen amount');

        $stored = Db::name('store_order_refund')->where('id', $refund['id'])->find();
        self::assertSame($first['out_refund_no'], (string)$stored['out_refund_no']);
        $frozen = json_decode((string)$stored['refund_request'], true);
        self::assertIsArray($frozen, 'the frozen request is persisted');
        self::assertSame(10.0, (float)$frozen['refund_price']);
    }

    /**
     * The freeze step is the only thing serializing two refund attempts for one
     * after-sale row. Two processes released together must still agree on one
     * number and one amount, otherwise a double submit refunds twice.
     */
    public function testConcurrentRefundsFreezeOneNumberAndAmount(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid']);
        $refund = $fixtures->createRefundOrder($user['uid'], $order['id'], [
            'refund_type' => 1, 'refund_price' => '10.00', 'out_refund_no' => '', 'refund_request' => '',
        ]);

        $results = $this->race('refund-freeze', (int)$refund['id'], ['10.00', '99.00']);

        self::assertSame(
            $results[0]['out_refund_no'],
            $results[1]['out_refund_no'],
            'both attempts freeze the same gateway number'
        );
        self::assertSame(
            $results[0]['refund_price'],
            $results[1]['refund_price'],
            'both attempts freeze the same amount'
        );

        $stored = Db::name('store_order_refund')->where('id', $refund['id'])->find();
        self::assertSame($results[0]['out_refund_no'], (string)$stored['out_refund_no']);
        self::assertSame(
            (float)$results[0]['refund_price'],
            (float)json_decode((string)$stored['refund_request'], true)['refund_price']
        );
    }

    /**
     * One presale order in the database: cart info carries the presale SKU while the
     * order carries the presale activity id, exactly as the checkout writes them.
     */
    private function presaleOrder(FixtureFactory $fixtures, array $product, array $advance, int $cartNum): array
    {
        $user = $fixtures->createUser();
        $cartId = random_int(100000000, 999999999);
        $order = $fixtures->createOrder($user['uid'], [
            'cart_id' => $cartId, 'combination_id' => 0, 'advance_id' => $advance['id'], 'is_del' => 0,
        ]);
        $fixtures->createOrderCart($order['id'], $user['uid'], [
            'cart_id' => $cartId,
            'cart_num' => $cartNum,
            'cart_info' => [
                'cart_num' => $cartNum,
                'productInfo' => [
                    'id' => $product['id'], 'store_name' => 'presale cart', 'price' => '10.00', 'image' => '',
                    'attrInfo' => ['unique' => $advance['sku']['unique']],
                ],
            ],
        ]);
        return $order;
    }

    /**
     * A service mock that only answers the ledger under test. The other two layers
     * are `never()`, so a wrong branch fails instead of quietly restoring something
     * else.
     */
    private function stockLayerMock(string $class, string $method, string $layer, string $soldFrom, array $arguments): object
    {
        $mock = $this->getMockBuilder($class)->disableOriginalConstructor()->onlyMethods([$method])->getMock();
        $invocation = $mock->expects($layer === $soldFrom ? self::once() : self::never())->method($method);
        if ($layer === $soldFrom) {
            $invocation->with(...$arguments)->willReturn(true);
        }
        return $mock;
    }

    /**
     * The guard is protected on purpose; a test double exposes it without
     * widening production API. It accepts an array or a model, because the
     * refund dispatch hands it a model while other callers pass a row.
     */
    private function refundService(): StoreOrderRefundServices
    {
        return new class($this->createMock(StoreOrderRefundDao::class), $this->createMock(StoreOrderServices::class)) extends StoreOrderRefundServices {
            public function exposeGuard($order): void
            {
                $this->assertWechatRefundable($order);
            }
        };
    }

    /**
     * The freeze step is protected so a test can drive it; passing the real DAO and
     * the real database is the point, since the stability comes from the row lock.
     */
    private function freezingRefundService(): StoreOrderRefundServices
    {
        return new class(app()->make(StoreOrderRefundDao::class), app()->make(StoreOrderServices::class)) extends StoreOrderRefundServices {
            public function exposeFreeze(int $id, array $refundData): array
            {
                return $this->freezeRefundRequest($id, $refundData);
            }
        };
    }

    /**
     * Run the same write in two processes released together, the way a double
     * submit or a retry after a local rollback arrives in production.
     *
     * @param array<int, string> $values
     * @return array<int, mixed>
     */
    private function race(string $action, int $id, array $values): array
    {
        $start = tempnam(sys_get_temp_dir(), 'crmeb-race-start-');
        unlink($start);
        $processes = [];
        $outputs = [];
        foreach ($values as $index => $value) {
            $output = tempnam(sys_get_temp_dir(), 'crmeb-race-');
            $outputs[$index] = $output;
            $command = sprintf(
                'php %s %s %d %s %s %s',
                escapeshellarg(dirname(__DIR__) . '/Support/race-worker.php'),
                escapeshellarg($action),
                $id,
                escapeshellarg((string)$value),
                escapeshellarg($start),
                escapeshellarg($output)
            );
            $processes[$index] = proc_open($command, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
        }

        touch($start);
        $results = [];
        foreach ($processes as $index => $process) {
            self::assertSame(0, proc_close($process), 'the ' . $action . ' worker exits cleanly');
            $raw = (string)file_get_contents($outputs[$index]);
            unlink($outputs[$index]);
            $decoded = json_decode($raw, true);
            self::assertIsArray($decoded, 'the ' . $action . ' worker reported a result: ' . $raw);
            self::assertSame('', (string)$decoded['error'], 'the ' . $action . ' worker must not fail');
            self::assertTrue($decoded['ok']);
            $results[] = $decoded['value'];
        }
        unlink($start);

        return $results;
    }
}
