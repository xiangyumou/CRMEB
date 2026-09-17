<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\CoreStore;
use app\services\order\StoreOrderServices;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * Orders paid before the retired features were removed still exist in production.
 * They must stay readable and exportable and keep their historical pay-type label.
 */
final class HistoricalOrderCompatTest extends RegressionTestCase
{
    /** @dataProvider historicalOrders */
    public function testHistoricalOrdersStayReadable(array $overrides, string $expectedLabel, int $expectedType = 0): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser(['now_money' => '120.00', 'integral' => 500]);
        $order = $fixtures->createOrder($user['uid'], array_merge([
            'paid' => 1,
            'pay_time' => time(),
            'status' => 3,
        ], $overrides));

        $orders = app()->make(StoreOrderServices::class);
        $row = Db::name('store_order')->where('id', $order['id'])->find();
        $row['order_id_key'] = (int)$order['id'];

        $detail = $orders->tidyOrder($row);
        self::assertSame($order['id'], $detail['id']);
        self::assertSame($expectedLabel, $detail['_status']['_payType']);

        $list = $orders->tidyOrderList([$row]);
        self::assertSame($expectedLabel, $list[0]['pay_type_name']);
        // The retired columns stay on historical rows but never map to a live activity type.
        self::assertArrayNotHasKey('offlinePayStatus', $detail);
        self::assertSame($expectedType, (int)($detail['type'] ?? 0));
    }

    public function historicalOrders(): array
    {
        return [
            'legacy balance order' => [['pay_type' => 'yue', 'use_integral' => 100, 'deduction_price' => '1.00'], '历史：余额支付'],
            'legacy offline order' => [['pay_type' => 'offline'], '历史：线下支付'],
            'legacy alipay order' => [['pay_type' => 'alipay'], '历史：支付宝支付'],
            'legacy seckill order' => [['pay_type' => 'weixin', 'seckill_id' => 9], '微信支付'],
            'legacy bargain order' => [['pay_type' => 'weixin', 'bargain_id' => 9], '微信支付'],
            'legacy combination order' => [['pay_type' => 'weixin', 'combination_id' => 3], '微信支付', 3],
            'legacy self pickup order' => [['pay_type' => 'weixin', 'shipping_type' => 2, 'verify_code' => '123456789012'], '微信支付'],
            'legacy spread order' => [['pay_type' => 'weixin', 'spread_uid' => 5, 'one_brokerage' => '2.00'], '微信支付'],
        ];
    }

    public function testHistoricalOrdersExportWithoutError(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $fixtures->createOrder($user['uid'], [
            'paid' => 1,
            'pay_time' => time(),
            'pay_type' => 'yue',
            'seckill_id' => 9,
            'spread_uid' => 5,
            'status' => 3,
        ]);

        $rows = app()->make(StoreOrderServices::class)->getExportList(['uid' => $user['uid']]);
        self::assertCount(1, $rows);
        self::assertNotEmpty($rows[0]['pink_name']);
    }

    public function testHistoricalPayTypeLabelsAreStable(): void
    {
        self::assertSame('微信支付', CoreStore::historicalPayTypeLabel('weixin'));
        self::assertSame('历史：余额支付', CoreStore::historicalPayTypeLabel('yue'));
        self::assertSame('历史：线下支付', CoreStore::historicalPayTypeLabel('offline'));
        self::assertSame('历史：支付宝支付', CoreStore::historicalPayTypeLabel('alipay'));
        self::assertSame('历史：通联支付', CoreStore::historicalPayTypeLabel('allinpay'));
        self::assertSame('其他支付', CoreStore::historicalPayTypeLabel('unknown'));
    }
}
