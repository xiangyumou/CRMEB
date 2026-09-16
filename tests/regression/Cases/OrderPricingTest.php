<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;
use app\dao\order\StoreOrderDao;
use app\services\order\StoreOrderComputedServices;
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
}
