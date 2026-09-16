<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;
use app\dao\order\StoreOrderDao;
use app\services\order\StoreOrderComputedServices;
use app\services\order\StoreOrderServices;
use crmeb\exceptions\ApiException;
use Tests\Regression\Support\RegressionTestCase;
final class OrderPricingTest extends RegressionTestCase
{
    public function testIntegralDeductionIsRejected(): void
    {
        $calculator = new StoreOrderComputedServices($this->createMock(StoreOrderDao::class));
        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('当前商城不支持该业务');
        $calculator->useIntegral(true, ['uid'=>1, 'integral'=>300], '10.00', ['integralRatio'=>'0.01']);
    }
    public function testOrdinaryPricingDoesNotReadOrConsumePoints(): void
    {
        $calculator = new StoreOrderComputedServices($this->createMock(StoreOrderDao::class));
        self::assertSame(['10.00',0,0,0], $calculator->useIntegral(false, [], '10.00', []));
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
    public function testExtractedPresentationAndStatisticsRetainPublicEntrypoints(): void
    {
        $dao = $this->createMock(StoreOrderDao::class);
        $dao->method('orderAddTimeList')->willReturn([]);
        $service = new StoreOrderServices($dao);
        self::assertSame([], $service->tidyOrderList([]));
        self::assertSame(['yAxis'=>[], 'legend'=>[], 'xAxis'=>[], 'serise'=>[], 'pre_cycle'=>[], 'cycle'=>[]], $service->orderCharts('thirtyday'));
    }
}
