<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\order\StoreOrderRefundDao;
use app\services\order\StoreOrderRefundServices;
use app\services\order\StoreOrderServices;
use crmeb\exceptions\AdminException;
use Tests\Regression\Support\RegressionTestCase;

final class RefundTest extends RegressionTestCase
{
    /**
     * Refunds replay the original channel only. Orders paid with a retired
     * method have no channel left, so refunding must stop instead of guessing.
     * @dataProvider retiredPayTypes
     */
    public function testRetiredPayTypesAreRefusedInsteadOfRefunded(string $payType): void
    {
        $this->expectException(AdminException::class);
        $this->expectExceptionMessage('该订单为历史支付方式，无法原路退款，请线下处理后标记已退款');
        $this->refundService()->exposeGuard(['pay_type' => $payType]);
    }

    public function retiredPayTypes(): array
    {
        return [['yue'], ['offline'], ['alipay'], ['allinpay'], ['']];
    }

    public function testWechatOrdersPassTheRefundGuard(): void
    {
        $this->refundService()->exposeGuard(['pay_type' => 'weixin']);
        self::assertTrue(true);
    }

    /** The guard is protected on purpose; a test double exposes it without widening production API. */
    private function refundService(): StoreOrderRefundServices
    {
        return new class($this->createMock(StoreOrderRefundDao::class), $this->createMock(StoreOrderServices::class)) extends StoreOrderRefundServices {
            public function exposeGuard(array $order): void
            {
                $this->assertWechatRefundable($order);
            }
        };
    }
}
