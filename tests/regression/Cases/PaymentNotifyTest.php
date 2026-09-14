<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\order\StoreOrderSuccessServices;
use app\services\pay\PayNotifyServices;
use app\services\user\UserRechargeServices;
use Tests\Regression\Support\RegressionTestCase;

final class PaymentNotifyTest extends RegressionTestCase
{
    public function testUnknownOrderIsAcknowledgedWithoutPaymentSideEffects(): void
    {
        $orders = $this->orderServiceMock();
        $orders->expects(self::once())->method('getOne')->with(['order_id' => 'missing'])->willReturn(null);
        $orders->expects(self::never())->method('paySuccess');
        $this->replace(StoreOrderSuccessServices::class, $orders);

        self::assertTrue((new PayNotifyServices())->wechatProduct('missing', 'trade-1'));
    }

    public function testRepeatedNotificationDoesNotRunPaymentTwice(): void
    {
        $paidOrder = new class {
            public $paid = 1;
            public function toArray(): array { return ['id' => 1, 'paid' => 1]; }
        };
        $orders = $this->orderServiceMock();
        $orders->expects(self::once())->method('getOne')->willReturn($paidOrder);
        $orders->expects(self::never())->method('paySuccess');
        $this->replace(StoreOrderSuccessServices::class, $orders);

        self::assertTrue((new PayNotifyServices())->wechatProduct('paid-order', 'trade-1'));
    }

    public function testProcessingFailureRequestsGatewayRetry(): void
    {
        $orders = $this->orderServiceMock();
        $orders->method('getOne')->willThrowException(new \RuntimeException('database unavailable'));
        $this->replace(StoreOrderSuccessServices::class, $orders);

        self::assertFalse((new PayNotifyServices())->wechatProduct('order-1', 'trade-1'));
    }

    public function testValidNotificationRunsPaymentExactlyOnce(): void
    {
        $order = new class {
            public $paid = 0;
            public function toArray(): array { return ['id' => 7, 'paid' => 0]; }
        };
        $orders = $this->orderServiceMock();
        $orders->method('getOne')->willReturn($order);
        $orders->expects(self::once())
            ->method('paySuccess')
            ->with(['id' => 7, 'paid' => 0], 'weixin', ['trade_no' => 'trade-7'])
            ->willReturn(true);
        $this->replace(StoreOrderSuccessServices::class, $orders);

        self::assertTrue((new PayNotifyServices())->wechatProduct('order-7', 'trade-7'));
    }

    public function testConcurrentNotificationIsAcknowledgedWhenOtherWorkerPaidOrder(): void
    {
        $unpaidOrder = new class {
            public $paid = 0;
            public function toArray(): array { return ['id' => 7, 'paid' => 0]; }
        };
        $paidOrder = new class { public $paid = 1; };
        $orders = $this->orderServiceMock();
        $orders->expects(self::exactly(2))
            ->method('getOne')
            ->with(['order_id' => 'order-7'])
            ->willReturnOnConsecutiveCalls($unpaidOrder, $paidOrder);
        $orders->expects(self::once())->method('paySuccess')->willReturn(false);
        $this->replace(StoreOrderSuccessServices::class, $orders);

        self::assertTrue((new PayNotifyServices())->wechatProduct('order-7', 'trade-7'));
    }

    public function testRepeatedRechargeNotificationDoesNotCreditBalanceAgain(): void
    {
        $recharges = $this->rechargeServiceMock();
        $recharges->expects(self::once())->method('be')->with(['order_id' => 'recharge-1', 'paid' => 1])->willReturn(true);
        $recharges->expects(self::never())->method('rechargeSuccess');
        $this->replace(UserRechargeServices::class, $recharges);

        self::assertTrue((new PayNotifyServices())->wechatUserRecharge('recharge-1', 'trade-1'));
    }

    public function testFirstRechargeNotificationCreditsThroughBusinessService(): void
    {
        $recharges = $this->rechargeServiceMock();
        $recharges->method('be')->willReturn(false);
        $recharges->expects(self::once())
            ->method('rechargeSuccess')
            ->with('recharge-2', ['trade_no' => 'trade-2', 'pay_type' => 'weixin'])
            ->willReturn(true);
        $this->replace(UserRechargeServices::class, $recharges);

        self::assertTrue((new PayNotifyServices())->wechatUserRecharge('recharge-2', 'trade-2'));
    }

    private function orderServiceMock(): StoreOrderSuccessServices
    {
        return $this->getMockBuilder(StoreOrderSuccessServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['paySuccess'])
            ->addMethods(['getOne'])
            ->getMock();
    }

    private function rechargeServiceMock(): UserRechargeServices
    {
        return $this->getMockBuilder(UserRechargeServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['rechargeSuccess'])
            ->addMethods(['be'])
            ->getMock();
    }
}
