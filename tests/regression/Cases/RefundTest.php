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

    /**
     * The complement of the refusal above: a WeChat order passes the guard, so
     * the rejection can never be a blanket "refunds are disabled". The guard is
     * fed a model the way the dispatch code does, which is what a type change
     * here silently breaks.
     */
    public function testWechatOrdersPassTheRefundGuard(): void
    {
        $order = new class {
            public $pay_type = 'weixin';
            public function getAttr(string $name): string
            {
                return $name === 'pay_type' ? $this->pay_type : '';
            }
        };
        $this->refundService()->exposeGuard($order);
        self::assertTrue(true, 'the guard returns instead of raising');
    }

    /**
     * The guard is protected on purpose; a test double exposes it without
     * widening production API. It accepts an array or a model, because the
     * refund dispatch hands it a model while other callers pass a row.
     */
    private function refundService(): StoreOrderRefundServices
    {
        return new class($this->createMock(StoreOrderRefundDao::class), $this->createMock(StoreOrderServices::class)) extends StoreOrderRefundServices {
            public function exposeGuard($order): void
            {
                $this->assertWechatRefundable($order);
            }
        };
    }
}
