<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\order\StoreOrderRefundDao;
use app\services\order\StoreOrderRefundServices;
use app\services\order\StoreOrderServices;
use app\services\user\UserMoneyServices;
use app\services\user\UserServices;
use Tests\Regression\Support\RegressionTestCase;

final class RefundTest extends RegressionTestCase
{
    public function testBalanceRefundCreditsUserAndWritesResultingBalance(): void
    {
        $users = $this->userService();
        $users->method('value')->willReturn('12.50');
        $users->expects(self::once())->method('bcInc')->with(9, 'now_money', '7.25', 'uid')->willReturn(true);
        $money = $this->moneyService();
        $money->expects(self::once())
            ->method('income')
            ->with('pay_product_refund', 9, '7.25', '19.75', 81)
            ->willReturn(true);
        $this->replace(UserServices::class, $users);
        $this->replace(UserMoneyServices::class, $money);

        self::assertTrue($this->refundService()->yueRefund(['id' => 81, 'uid' => 9], ['refund_price' => '7.25']));
    }

    public function testFailedBalanceCreditDoesNotWriteLedger(): void
    {
        $users = $this->userService();
        $users->method('value')->willReturn('12.50');
        $users->method('bcInc')->willReturn(false);
        $money = $this->moneyService();
        $money->expects(self::never())->method('income');
        $this->replace(UserServices::class, $users);
        $this->replace(UserMoneyServices::class, $money);

        self::assertFalse($this->refundService()->yueRefund(['id' => 81, 'uid' => 9], ['refund_price' => '7.25']));
    }

    private function refundService(): StoreOrderRefundServices
    {
        return new StoreOrderRefundServices(
            $this->createMock(StoreOrderRefundDao::class),
            $this->createMock(StoreOrderServices::class)
        );
    }

    private function userService(): UserServices
    {
        return $this->getMockBuilder(UserServices::class)
            ->disableOriginalConstructor()
            ->addMethods(['value', 'bcInc'])
            ->getMock();
    }

    private function moneyService(): UserMoneyServices
    {
        return $this->getMockBuilder(UserMoneyServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['income'])
            ->getMock();
    }
}
