<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\order\StoreOrderSuccessServices;
use app\services\pay\PayNotifyServices;
use Tests\Regression\Support\RegressionTestCase;

final class GatewayNotifyContractTest extends RegressionTestCase
{
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

}
