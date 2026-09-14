<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\order\StoreOrderDao;
use app\services\order\StoreOrderComputedServices;
use app\services\user\UserBillServices;
use Tests\Regression\Support\RegressionTestCase;

final class OrderPricingTest extends RegressionTestCase
{
    public function testIntegralDeductionHonorsFrozenBalanceAndConfiguredCap(): void
    {
        $calculator = new StoreOrderComputedServices($this->createMock(StoreOrderDao::class));
        $this->replace(UserBillServices::class, $this->billServiceReturning(20));
        $this->replace('sysConfig', new class {
            public function get(string $name) { return $name === 'integral_max_num' ? 200 : ''; }
        });

        [$payPrice, $deduction, $used, $remaining] = $calculator->useIntegral(
            true,
            ['uid' => 1, 'integral' => 300],
            '10.00',
            ['integralRatio' => '0.01']
        );

        self::assertSame('8.00', $payPrice);
        self::assertSame(2.0, $deduction);
        self::assertSame('200', $used);
        self::assertSame(80, $remaining);
    }

    public function testDisabledIntegralDoesNotChangePriceOrConsumePoints(): void
    {
        $calculator = new StoreOrderComputedServices($this->createMock(StoreOrderDao::class));
        $this->replace(UserBillServices::class, $this->billServiceReturning(100));

        [$payPrice, $deduction, $used, $remaining] = $calculator->useIntegral(
            false,
            ['uid' => 1, 'integral' => 300],
            '10.00',
            ['integralRatio' => '0.01']
        );

        self::assertSame('10.00', $payPrice);
        self::assertSame(0, $deduction);
        self::assertSame(0, $used);
        self::assertSame('200', $remaining);
    }

    private function billServiceReturning(int $frozen): UserBillServices
    {
        $bills = $this->getMockBuilder(UserBillServices::class)
            ->disableOriginalConstructor()
            ->addMethods(['getBillSum'])
            ->getMock();
        $bills->expects(self::once())
            ->method('getBillSum')
            ->with(['uid' => 1, 'is_frozen' => 1])
            ->willReturn($frozen);
        return $bills;
    }
}
