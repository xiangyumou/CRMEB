<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;
use app\dao\order\StoreOrderDao;
use app\services\activity\coupon\StoreCouponUserServices;
use app\services\order\StoreOrderComputedServices;
use app\services\order\StoreOrderCreateServices;
use app\services\order\StoreOrderServices;
use crmeb\exceptions\ApiException;
use Tests\Regression\Support\RegressionTestCase;
final class OrderPricingTest extends RegressionTestCase
{
    /** Retired order parameters must be refused before any pricing work happens. */
    public function testRetiredOrderParametersAreRejectedByComputedOrder(): void
    {
        $calculator = new StoreOrderComputedServices($this->createMock(StoreOrderDao::class));
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('当前商城不支持该业务');
        $calculator->setParamData(['useIntegral' => true])->computedOrder(
            1,
            ['uid' => 1, 'integral' => 300],
            ['cartInfo' => [], 'priceGroup' => ['totalPrice' => '10.00', 'giftPrice' => 0], 'other' => []],
            0,
            'weixin'
        );
    }
    public function testMissingCouponDoesNotChangePrice(): void
    {
        $calculator = new StoreOrderComputedServices($this->createMock(StoreOrderDao::class));
        self::assertSame(['9.99', 0], $calculator->useCouponId(0, 1, [], '9.99', false));
    }
    public function testGrowthPublicMethodKeepsZeroAndNegativeRatios(): void
    {
        $service = new StoreOrderServices($this->createMock(StoreOrderDao::class));
        self::assertSame(0, $service->growth(0, 0));
        self::assertSame('500.00', $service->growth(5, 0));
        self::assertEquals(-50, $service->growth(5, 10));
    }
    public function testMultiItemCouponSplitReturnsCartRows(): void
    {
        $coupon = $this->getMockBuilder(StoreCouponUserServices::class)
            ->disableOriginalConstructor()
            ->addMethods(['getOne'])
            ->getMock();
        $coupon->expects(self::once())->method('getOne')->willReturn([
            'id' => 9,
            'applicable_type' => 0,
            'coupon_price' => '7.00',
        ]);
        $this->replace(StoreCouponUserServices::class, $coupon);

        $service = new StoreOrderCreateServices($this->createMock(StoreOrderDao::class));
        $result = $service->computeOrderProductTruePrice(
            [
                ['id' => 11, 'cart_num' => 2, 'truePrice' => '10.00', 'product_id' => 1],
                ['id' => 22, 'cart_num' => 1, 'truePrice' => '30.00', 'product_id' => 2],
            ],
            ['coupon_id' => 9, 'coupon_price' => '7.00'],
            0,
            1,
            []
        );

        $cartInfo = $result;
        self::assertCount(2, $cartInfo, 'computeOrderProductTruePrice returns the per-row cart list');
        self::assertSame([11, 22], array_column($cartInfo, 'id'));

        $couponSum = '0.00';
        foreach ($cartInfo as $cart) {
            self::assertArrayHasKey('coupon_price', $cart);
            self::assertArrayHasKey('sum_true_price', $cart);
            $couponSum = bcadd($couponSum, (string)$cart['coupon_price'], 2);
        }
        self::assertSame('7.00', $couponSum, 'the per-row coupon split adds up to the coupon amount');
        self::assertSame('17.20', $cartInfo[0]['sum_true_price']);
        self::assertSame('25.80', $cartInfo[1]['sum_true_price']);
    }
    public function testExtractedPresentationAndStatisticsRetainPublicEntrypoints(): void
    {
        $dao = $this->createMock(StoreOrderDao::class);
        $dao->method('orderAddTimeList')->willReturn([]);
        $service = new StoreOrderServices($dao);
        self::assertSame([], $service->tidyOrderList([]));
        self::assertSame(['yAxis'=>[], 'legend'=>[], 'xAxis'=>[], 'serise'=>[], 'pre_cycle'=>[], 'cycle'=>[]], $service->orderCharts('thirtyday'));
    }
}
