<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\order\StoreOrderSuccessServices;
use app\services\pay\YuePayServices;
use app\services\user\UserMoneyServices;
use app\services\user\UserServices;
use Tests\Regression\Support\RegressionTestCase;

final class BalancePaymentTest extends RegressionTestCase
{
    public function testInsufficientBalanceDoesNotWriteLedgerOrPayOrder(): void
    {
        $users = $this->userService(['uid' => 3, 'now_money' => '19.89']);
        $users->expects(self::never())->method('bcDec');
        $money = $this->moneyService();
        $money->expects(self::never())->method('income');
        $orders = $this->orderSuccessService();
        $orders->expects(self::never())->method('paySuccess');
        $this->replace(UserServices::class, $users);
        $this->replace(UserMoneyServices::class, $money);
        $this->replace(StoreOrderSuccessServices::class, $orders);

        $result = (new YuePayServices())->yueOrderPay($this->order('19.90'), 3);

        self::assertSame('pay_deficiency', $result['status']);
        self::assertSame('余额不足19.9', $result['msg']);
    }

    public function testExactBalanceWritesLedgerAndPaysOrder(): void
    {
        $order = $this->order('19.90');
        $users = $this->userService(['uid' => 3, 'now_money' => '19.90']);
        $users->expects(self::once())->method('bcDec')->with(3, 'now_money', '19.90', 'uid')->willReturn(true);
        $money = $this->moneyService();
        $money->expects(self::once())
            ->method('income')
            ->with('pay_product', 3, '19.90', '0.00', 8)
            ->willReturn(true);
        $orders = $this->orderSuccessService();
        $orders->expects(self::once())->method('paySuccess')->with($order, 'yue')->willReturn(true);
        $this->replace(UserServices::class, $users);
        $this->replace(UserMoneyServices::class, $money);
        $this->replace(StoreOrderSuccessServices::class, $orders);

        self::assertSame(['status' => true], (new YuePayServices())->yueOrderPay($order, 3));
    }

    private function order(string $price): array
    {
        return ['id' => 8, 'order_id' => 'order-8', 'paid' => 0, 'pay_price' => $price];
    }

    private function userService(array $user): UserServices
    {
        $service = $this->getMockBuilder(UserServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getUserInfo'])
            ->addMethods(['bcDec'])
            ->getMock();
        $service->expects(self::once())->method('getUserInfo')->with(3)->willReturn($user);
        return $service;
    }

    private function moneyService(): UserMoneyServices
    {
        return $this->getMockBuilder(UserMoneyServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['income'])
            ->getMock();
    }

    private function orderSuccessService(): StoreOrderSuccessServices
    {
        return $this->getMockBuilder(StoreOrderSuccessServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['paySuccess'])
            ->getMock();
    }
}
