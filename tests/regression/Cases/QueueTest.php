<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\jobs\UnpaidOrderCancelJob;
use app\services\order\StoreOrderCartInfoServices;
use app\services\order\StoreOrderRefundServices;
use app\services\order\StoreOrderServices;
use Tests\Regression\Support\RegressionTestCase;

final class QueueTest extends RegressionTestCase
{
    /**
     * @dataProvider skippedOrderProvider
     */
    public function testCancellationSkipsOrdersThatMustNotBeRestored(array $state): void
    {
        $order = new CancellationOrderFixture($state);
        $orders = $this->orderServiceReturning($order);
        $refunds = $this->refundServiceMock();
        $refunds->expects(self::never())->method('transaction');
        $this->replace(StoreOrderServices::class, $orders);
        $this->replace(StoreOrderRefundServices::class, $refunds);

        self::assertTrue((new UnpaidOrderCancelJob())->doJob(17));
        self::assertFalse($order->saved);
    }

    public function testCancellationRestoresResourcesAndPersistsStateOnce(): void
    {
        $order = new CancellationOrderFixture([]);
        $orders = $this->orderServiceReturning($order);
        $cart = $this->getMockBuilder(StoreOrderCartInfoServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getOrderCartInfo'])
            ->getMock();
        $cart->expects(self::once())->method('getOrderCartInfo')->with(17)->willReturn([]);
        $refunds = $this->refundServiceMock();
        $refunds->expects(self::once())->method('transaction')->willReturnCallback(static function (callable $callback) {
            return $callback();
        });
        $refunds->expects(self::once())->method('integralAndCouponBack')->with($order, 'cancel');
        $refunds->expects(self::once())->method('regressionStock')->with($order);
        $this->replace(StoreOrderServices::class, $orders);
        $this->replace(StoreOrderCartInfoServices::class, $cart);
        $this->replace(StoreOrderRefundServices::class, $refunds);

        self::assertTrue((new UnpaidOrderCancelJob())->doJob(17));
        self::assertTrue($order->saved);
        self::assertSame(1, $order->is_cancel);
        self::assertSame('订单未支付已超过系统预设时间', $order->mark);
    }

    public function skippedOrderProvider(): array
    {
        return [
            'paid' => [['paid' => 1]],
            'deleted' => [['is_del' => 1]],
            'offline' => [['pay_type' => 'offline']],
            'already cancelled' => [['is_cancel' => 1]],
        ];
    }

    private function orderServiceReturning(CancellationOrderFixture $order): StoreOrderServices
    {
        $orders = $this->getMockBuilder(StoreOrderServices::class)
            ->disableOriginalConstructor()
            ->addMethods(['get'])
            ->getMock();
        $orders->expects(self::once())->method('get')->with(17)->willReturn($order);
        return $orders;
    }

    private function refundServiceMock(): StoreOrderRefundServices
    {
        return $this->getMockBuilder(StoreOrderRefundServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['transaction', 'integralAndCouponBack', 'regressionStock'])
            ->getMock();
    }
}

final class CancellationOrderFixture
{
    public $paid = 0;
    public $is_del = 0;
    public $pay_type = 'weixin';
    public $is_cancel = 0;
    public $mark = '';
    public $saved = false;

    public function __construct(array $state)
    {
        foreach ($state as $key => $value) {
            $this->{$key} = $value;
        }
    }

    public function save(): bool
    {
        $this->saved = true;
        return true;
    }
}
