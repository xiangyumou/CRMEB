<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\order\StoreOrderServices;
use crmeb\exceptions\ApiException;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class OrderLifecycleTest extends RegressionTestCase
{
    public function testUnpaidOrderCanBeCancelledOnlyOnce(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser(['integral' => 20]);
        $order = $fixtures->createOrder($user['uid'], ['cart_id' => '', 'use_integral' => '0.00']);
        $orders = app()->make(StoreOrderServices::class);

        self::assertTrue($orders->cancelOrder($order['order_id'], $user['uid']));
        self::assertSame(1, (int)Db::name('store_order')->where('id', $order['id'])->value('is_cancel'));
        self::assertSame(1, (int)Db::name('store_order_status')->where([
            'oid' => $order['id'],
            'change_type' => 'integral_back',
        ])->count());
        $statusCount = (int)Db::name('store_order_status')->where('oid', $order['id'])->count();

        try {
            $orders->cancelOrder($order['order_id'], $user['uid']);
            self::fail('Repeated cancellation must fail');
        } catch (ApiException $exception) {
            self::assertSame('订单已取消，请勿重复操作！', $exception->getMessage());
        }
        self::assertSame($statusCount, (int)Db::name('store_order_status')->where('oid', $order['id'])->count());
        self::assertSame(20, (int)Db::name('user')->where('uid', $user['uid'])->value('integral'));
    }

    public function testPaidOrderCannotBeCancelled(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], ['paid' => 1, 'pay_time' => time()]);
        $before = Db::name('store_order')->where('id', $order['id'])->field('paid,is_cancel,status')->find();

        try {
            app()->make(StoreOrderServices::class)->cancelOrder($order['order_id'], $user['uid']);
            self::fail('Paid cancellation must fail');
        } catch (ApiException $exception) {
            self::assertSame('订单已经支付无法取消', $exception->getMessage());
        }

        self::assertSame($before, Db::name('store_order')->where('id', $order['id'])->field('paid,is_cancel,status')->find());
        self::assertSame(0, (int)Db::name('store_order_status')->where('oid', $order['id'])->count());
    }
}
