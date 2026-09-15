<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\order\StoreOrderDao;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class OrderPaymentStateTest extends RegressionTestCase
{
    public function testOnlyFirstPaymentTransitionCanUpdateOrder(): void
    {
        $fixture = new FixtureFactory($this, $this->getName());
        $user = $fixture->createUser();
        $id = $fixture->createOrder($user['uid'])['id'];
        $orders = new StoreOrderDao();

        self::assertSame(1, $orders->markPaid($id, ['paid' => 1, 'trade_no' => 'trade-first', 'pay_time' => 100]));
        self::assertSame(0, $orders->markPaid($id, ['paid' => 1, 'trade_no' => 'trade-second', 'pay_time' => 200]));

        $row = Db::name('store_order')->where('id', $id)->field('paid,trade_no,pay_time')->find();
        self::assertSame(1, (int) $row['paid']);
        self::assertSame('trade-first', $row['trade_no']);
        self::assertSame(100, (int) $row['pay_time']);
    }
}
