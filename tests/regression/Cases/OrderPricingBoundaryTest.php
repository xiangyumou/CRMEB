<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\order\StoreOrderDao;
use app\services\activity\coupon\StoreCouponUserServices;
use app\services\order\StoreOrderComputedServices;
use crmeb\exceptions\ApiException;
use Tests\Regression\Support\RegressionTestCase;

final class OrderPricingBoundaryTest extends RegressionTestCase
{
    public function testOrdinaryItemQuantityUsesTwoDecimalArithmetic(): void
    {
        $calculator = $this->calculator();
        $cart = [
            ['cart_num' => 3, 'truePrice' => '1.239'],
            ['cart_num' => 2, 'truePrice' => '4.105'],
        ];

        self::assertSame('11.92', $calculator->getOrderSumPrice($cart));
    }

    public function testFixedFreightIsChargedBelowFreeShippingThreshold(): void
    {
        $result = $this->calculator()->getOrderPriceGroup(
            '10.00',
            [$this->fixedFreightCart('9.99', 1, '2.50')],
            ['id' => 1, 'city_id' => 1],
            ['is_money_level' => 0]
        );

        self::assertSame('2.50', $result['storePostage']);
        self::assertFalse($result['isStoreFreePostage']);
        self::assertSame('9.99', $result['totalPrice']);
    }

    public function testFreeShippingThresholdIsInclusive(): void
    {
        $result = $this->calculator()->getOrderPriceGroup(
            '10.00',
            [$this->fixedFreightCart('5.00', 2, '2.50')],
            ['id' => 1, 'city_id' => 1],
            ['is_money_level' => 0]
        );

        self::assertSame(0, $result['storePostage']);
        self::assertTrue($result['isStoreFreePostage']);
        self::assertSame('10.00', $result['totalPrice']);
    }

    public function testCouponThresholdEqualToCartTotalIsAccepted(): void
    {
        $coupon = $this->couponService([
            'applicable_type' => 0,
            'use_min_price' => '10.00',
            'coupon_price' => '1.25',
        ]);
        $this->replace(StoreCouponUserServices::class, $coupon);

        [$payPrice, $couponPrice] = $this->calculator()->useCouponId(
            7,
            9,
            [['cart_num' => 2, 'truePrice' => '5.00']],
            '10.00',
            false
        );

        self::assertSame(8.75, $payPrice);
        self::assertSame('1.25', $couponPrice);
    }

    public function testCouponThresholdOneCentAboveCartTotalIsRejected(): void
    {
        $coupon = $this->couponService([
            'applicable_type' => 0,
            'use_min_price' => '10.01',
            'coupon_price' => '1.25',
        ]);
        $this->replace(StoreCouponUserServices::class, $coupon);

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('不满足优惠劵的使用条件');
        $this->calculator()->useCouponId(
            7,
            9,
            [['cart_num' => 2, 'truePrice' => '5.00']],
            '10.00',
            false
        );
    }

    private function calculator(): StoreOrderComputedServices
    {
        return new StoreOrderComputedServices($this->createMock(StoreOrderDao::class));
    }

    private function couponService(array $couponInfo): StoreCouponUserServices
    {
        $service = $this->getMockBuilder(StoreCouponUserServices::class)
            ->disableOriginalConstructor()
            ->addMethods(['getOne'])
            ->getMock();
        $service->expects(self::once())->method('getOne')->willReturn($couponInfo);
        return $service;
    }

    private function fixedFreightCart(string $price, int $quantity, string $postage): array
    {
        return [
            'cart_num' => $quantity,
            'sum_price' => $price,
            'truePrice' => $price,
            'costPrice' => '0.00',
            'vip_truePrice' => '0.00',
            'price_type' => '',
            'level' => '0.00',
            'member' => '0.00',
            'productInfo' => [
                'freight' => 2,
                'postage' => $postage,
                'is_virtual' => 0,
                'gift_price' => '0.00',
            ],
        ];
    }
}
