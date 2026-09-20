<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\order\StoreOrderSuccessServices;
use app\services\pay\PayNotifyServices;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class PaymentNotifyTest extends RegressionTestCase
{
    /**
     * Two callbacks for the same order. The first pays it; the second repeats
     * the SAME trade number and is acknowledged as an idempotent duplicate. The
     * payment effects (order status, capital flow) must run once, not once per
     * callback. A callback carrying a *different* trade number is a second real
     * payment and is covered by PaymentExceptionTest instead.
     */
    public function testTwoWechatCallbacksForTheSameOrderPayItExactlyOnce(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], ['paid' => 0, 'status' => 0]);
        $this->registerCleanup(function () use ($order, $user) {
            Db::name('store_order_status')->where('oid', $order['id'])->delete();
            Db::name('capital_flow')->where('order_id', $order['order_id'])->delete();
            Db::name('store_product_log')->where('uid', $user['uid'])->where('type', 'pay')->delete();
            Db::name('message_system')->where('uid', $user['uid'])->delete();
        });

        $notify = new PayNotifyServices();
        self::assertTrue($notify->wechatProduct($order['order_id'], 'trade-once-1'));
        self::assertTrue($notify->wechatProduct($order['order_id'], 'trade-once-1'), 'the repeated callback is acknowledged');

        $row = Db::name('store_order')->where('id', $order['id'])->field('paid,trade_no,pay_type')->find();
        self::assertSame(1, (int)$row['paid']);
        self::assertSame('trade-once-1', $row['trade_no'], 'a repeated callback must not overwrite the trade number');
        self::assertSame('weixin', (string)$row['pay_type']);
        self::assertSame(1, (int)Db::name('store_order_status')
            ->where('oid', $order['id'])->where('change_type', 'pay_success')->count(), 'one payment status row');
        self::assertSame(1, (int)Db::name('capital_flow')
            ->where('order_id', $order['order_id'])->count(), 'one capital-flow row');
    }

    /**
     * An unmatchable payment is persisted as an exception payment (with its
     * merchant identity from the callback) and only then acknowledged, so the
     * money is never lost. A callback that cannot be persisted asks for a retry.
     */
    public function testUnknownOrderIsAcknowledgedWithoutPaymentSideEffects(): void
    {
        $orders = $this->orderServiceMock();
        $orders->expects(self::exactly(2))->method('getOne')->with(['order_id' => 'missing'])->willReturn(null);
        $orders->expects(self::never())->method('paySuccess');
        $this->replace(StoreOrderSuccessServices::class, $orders);

        $tradeNo = 'trade-unknown-' . bin2hex(random_bytes(4));
        $this->registerCleanup(function () use ($tradeNo): void {
            Db::name('store_order_payment_exception')->where('trade_no', $tradeNo)->delete();
        });

        // A real WeChat callback always carries the merchant identity. With it,
        // the record commits and the notification is acknowledged.
        self::assertTrue((new PayNotifyServices())->wechatProduct('missing', $tradeNo, 'weixin', [
            'merchant_id' => 'M-notify',
            'paid_amount' => '1.00',
            'currency' => 'CNY',
        ]));
        $row = Db::name('store_order_payment_exception')->where('trade_no', $tradeNo)->find();
        self::assertIsArray($row, 'the unmatchable payment is persisted');
        self::assertSame('M-notify', (string)$row['mch_id']);

        // Without any identity the record cannot be keyed or refunded: the
        // gateway must retry instead of the callback being swallowed.
        self::assertFalse(
            (new PayNotifyServices())->wechatProduct('missing', 'trade-unkeyable-' . bin2hex(random_bytes(4))),
            'a callback that cannot be persisted asks the gateway to retry'
        );
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

    private function orderServiceMock(): StoreOrderSuccessServices
    {
        return $this->getMockBuilder(StoreOrderSuccessServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['paySuccess'])
            ->addMethods(['getOne'])
            ->getMock();
    }

}
