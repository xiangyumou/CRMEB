<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\order\StoreOrderSuccessServices;
use app\services\pay\PayServices;
use app\services\pay\PayNotifyServices;
use crmeb\services\CacheService;
use crmeb\services\pay\Pay;
use crmeb\services\pay\storage\WechatPay;
use crmeb\services\SystemConfigService;
use Tests\Regression\Support\RegressionTestCase;
use think\Container;
use think\facade\Db;

final class GatewayNotifyContractTest extends RegressionTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        RecordingPay::$instances = [];
        RecordingPay::$created = [];
    }

    /**
     * @dataProvider paymentAmountProvider
     */
    public function testGatewayAmountAndCurrencyMustMatchOrder(
        string $payType,
        string $paidAmount,
        string $currency,
        bool $expected
    ): void {
        $order = new class {
            public $paid = 0;
            public $pay_price = '19.90';
            public function toArray(): array
            {
                return ['id' => 71, 'paid' => 0, 'pay_price' => '19.90'];
            }
        };
        $orders = $this->getMockBuilder(StoreOrderSuccessServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['paySuccess'])
            ->addMethods(['getOne'])
            ->getMock();
        $orders->expects(self::once())->method('getOne')->with(['order_id' => 'gateway-order'])->willReturn($order);
        $payExpectation = $expected ? self::once() : self::never();
        $orders->expects($payExpectation)->method('paySuccess')->willReturn(true);
        $this->replace(StoreOrderSuccessServices::class, $orders);

        $result = (new PayNotifyServices())->wechatProduct('gateway-order', 'gateway-trade', $payType, [
            'paid_amount' => $paidAmount,
            'currency' => $currency,
        ]);

        self::assertSame($expected, $result);
    }

    public function paymentAmountProvider(): array
    {
        return [
            'wechat v2 exact amount' => ['weixin', '19.90', 'CNY', true],
            'wechat v3 one cent short' => ['weixin', '19.89', 'CNY', false],
            'wechat v3 one cent over' => ['weixin', '19.91', 'CNY', false],
            'malformed amount' => ['weixin', '19.900', 'CNY', false],
        ];
    }

    /**
     * Both WeChat gateways are retained code and `pay_wechat_type` is what chooses
     * between them. It used to be deleted with the non-WeChat payment methods, which
     * silently sent every environment to the v2 driver and left new installs with no
     * way to select v3. The version is read at request time, so this drives the real
     * PayServices and records the driver name the container was asked for.
     */
    public function testWechatPaymentVersionSelectsTheMatchingDriver(): void
    {
        $this->bindRecordingPay();

        self::assertSame('wechat_pay', $this->payOneOrder('0'), 'value 0 keeps the v2 gateway');
        self::assertSame('v3_wechat_pay', $this->payOneOrder('1'), 'value 1 selects the v3 gateway');
        self::assertSame(
            [['order-0'], ['order-1']],
            array_column(RecordingPay::$created, 'args'),
            'each payment reaches the driver it selected'
        );
    }

    /**
     * The setting is a shipped row, not an environment assumption: a fresh install
     * that lost it would fall back to v2 on every storefront.
     */
    public function testTheWechatVersionSettingShipsWithTheInstall(): void
    {
        $row = Db::name('system_config')->where('menu_name', 'pay_wechat_type')->find();
        self::assertNotEmpty($row, 'the install SQL must ship the pay_wechat_type setting');
        self::assertSame('0', (string)$row['value']);
        self::assertStringContainsString('v2', (string)$row['parameter']);
        self::assertStringContainsString('v3', (string)$row['parameter']);
    }

    public function testV2RefundQueryUsesTheRefundNumberAndParsesTheV2Shape(): void
    {
        $driver = new WechatPay('wechat_pay');
        $method = new \ReflectionMethod(WechatPay::class, 'normalizeRefundQuery');
        $method->setAccessible(true);
        $result = $method->invoke($driver, [
            'return_code' => 'SUCCESS',
            'result_code' => 'SUCCESS',
            'out_refund_no_0' => 'RF-100',
            'refund_status_0' => 'SUCCESS',
            'refund_fee_0' => '1000',
        ]);
        self::assertSame('success', $result['state']);
        self::assertSame('RF-100', $result['refund_no']);
        self::assertSame('10.00', $result['refund_price']);
    }

    private function setWechatPaymentVersion(string $value): void
    {
        $row = Db::name('system_config')->where('menu_name', 'pay_wechat_type')->find();
        self::assertNotEmpty($row, 'the install SQL must ship the pay_wechat_type setting');
        // sys_config() reads through a cache, so drop the entry with the update.
        $cacheKey = SystemConfigService::CACHE_SYSTEM . '_pay_wechat_type';
        CacheService::delete($cacheKey);
        Db::name('system_config')->where('id', $row['id'])->update(['value' => $value]);
        $this->registerCleanup(function () use ($row, $cacheKey) {
            CacheService::delete($cacheKey);
            Db::name('system_config')->where('id', $row['id'])->update(['value' => $row['value']]);
        });
    }

    /**
     * Drive one payment for a version setting and return the driver name the
     * container was asked for. A real request starts from an empty container, so
     * the manager resolved by the previous payment is dropped first.
     */
    private function payOneOrder(string $version): string
    {
        $this->setWechatPaymentVersion($version);
        Container::getInstance()->delete(Pay::class);
        self::assertSame('ok', (new PayServices())->pay('weixin', 'order-' . $version, '19.90', 'success', 'body'));
        return RecordingPay::$instances[array_key_last(RecordingPay::$instances)]->recordedDriverName();
    }

    /**
     * `app()->make(Pay::class, [$driver])` must hand the driver name to a fresh
     * manager. The container caches instances, so the recording binding has to drop
     * the resolved object and its closure on the way out, otherwise later tests in
     * this process would build a fake payment manager.
     */
    private function bindRecordingPay(): void
    {
        $this->bindClass(Pay::class, static function ($name = null) {
            return new RecordingPay($name);
        });
    }

}

/**
 * A payment manager that records the driver name it was built for and the payment
 * it was asked to create, so a driver-selection regression fails loudly instead of
 * reaching the live gateway.
 */
final class RecordingPay extends Pay
{
    /** @var array<int, self> */
    public static $instances = [];

    /** @var array<int, array{args: array}> */
    public static $created = [];

    public function __construct($name = null)
    {
        parent::__construct($name);
        self::$instances[] = $this;
    }

    public function recordedDriverName(): string
    {
        return (string)$this->name;
    }

    public function create(string $orderId, string $totalFee, string $attach, string $body, string $detail, array $options = [])
    {
        self::$created[] = ['args' => [$orderId], 'price' => $totalFee];
        return 'ok';
    }
}
