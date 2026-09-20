<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\order\StoreOrderDeliveryServices;
use app\services\order\StoreOrderEffectServices;
use app\services\order\StoreOrderSuccessServices;
use app\services\pay\PayServices;
use Tests\Regression\Support\BusinessSnapshot;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * Post-payment fulfillment atomicity.
 *
 * The local fulfillment — order status, gift coupons, capital flow, virtual
 * allocation, invoice state — commits with the payment state in one
 * transaction; the external actions (notice, push, print, invoice job) are
 * registered per target so one failing notice cannot replay the rest; and none
 * of it may happen twice when a callback or an effect is retried.
 */
final class FulfillmentAtomicityTest extends RegressionTestCase
{
    private string $token = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->token = substr(bin2hex(random_bytes(5)), 0, 10);
        $token = $this->token;
        $this->registerCleanup(static function () use ($token): void {
            $orders = Db::name('store_order')->whereLike('order_id', $token . '%')->column('id');
            if ($orders) {
                Db::name('store_order_effect')->whereIn('store_order_id', $orders)->delete();
                Db::name('capital_flow')->whereLike('order_id', $token . '%')->delete();
                Db::name('store_order_status')->whereIn('oid', $orders)->delete();
            }
            Db::name('store_product_virtual')->whereLike('order_id', $token . '%')->update(['order_id' => '', 'uid' => 0]);
        });
    }

    /**
     * FULFILL-001: the local fulfillment writes commit with the payment. A gift
     * coupon issue that fails rolls the whole payment back: no paid order, no
     * capital flow, no status row.
     */
    public function testAFailedGiftCouponIssueRollsTheWholePaymentBack(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], ['order_id' => $this->token . '-gift', 'pay_type' => 'weixin']);
        $orderId = (int)$order['id'];

        // The coupon service refuses; nothing else may commit.
        $coupons = $this->getMockBuilder(\app\services\product\product\StoreProductCouponServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['giveOrderProductCoupon'])
            ->getMock();
        $coupons->method('giveOrderProductCoupon')->willThrowException(new \RuntimeException('coupon issue failed'));
        $this->replace(\app\services\product\product\StoreProductCouponServices::class, $coupons);

        try {
            app()->make(StoreOrderSuccessServices::class)->paySuccess(BusinessSnapshot::order($orderId), PayServices::WEIXIN_PAY, ['trade_no' => 'T', 'out_trade_no' => $this->token . '-gift']);
            self::fail('a failed fulfillment must not report a successful payment');
        } catch (\Throwable $e) {
            self::assertStringContainsString('coupon issue failed', $e->getMessage());
        }

        self::assertSame(0, (int)BusinessSnapshot::order($orderId)['paid'], 'the payment is rolled back with the fulfillment');
        self::assertCount(0, BusinessSnapshot::capitalFlows($this->token . '-gift'), 'no capital flow survives the rollback');
        self::assertCount(0, BusinessSnapshot::orderStatusRows($orderId, 'pay_success'), 'no pay_success status row survives');
        self::assertCount(0, BusinessSnapshot::effects($orderId), 'no effect survives the rollback');
    }

    /**
     * FULFILL-001: a failed capital-flow write also rolls the payment back, so
     * "paid without the flow" cannot be committed.
     */
    public function testAFailedCapitalFlowRollsThePaymentBack(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], ['order_id' => $this->token . '-flow', 'pay_type' => 'weixin']);
        $orderId = (int)$order['id'];

        $flows = $this->getMockBuilder(\app\services\statistic\CapitalFlowServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['hasOrderFlow', 'setFlow'])
            ->getMock();
        $flows->method('hasOrderFlow')->willReturn(false);
        $flows->method('setFlow')->willThrowException(new \RuntimeException('flow write failed'));
        $this->replace(\app\services\statistic\CapitalFlowServices::class, $flows);

        try {
            app()->make(StoreOrderSuccessServices::class)->paySuccess(BusinessSnapshot::order($orderId), PayServices::WEIXIN_PAY, ['trade_no' => 'T', 'out_trade_no' => $this->token . '-flow']);
            self::fail('a failed flow write must not report a successful payment');
        } catch (\Throwable $e) {
            self::assertStringContainsString('flow write failed', $e->getMessage());
        }
        self::assertSame(0, (int)BusinessSnapshot::order($orderId)['paid']);
    }

    /**
     * FULFILL-001: a failed virtual allocation (no card in stock) rolls the
     * payment back instead of leaving a paid order with no card.
     */
    public function testAFailedVirtualAllocationRollsThePaymentBack(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], [
            'order_id' => $this->token . '-virtual',
            'pay_type' => 'weixin',
            'virtual_type' => 1,
        ]);
        $orderId = (int)$order['id'];
        // A cart row whose SKU has no card in stock.
        $fixtures->createOrderCart($orderId, $user['uid'], [
            'cart_info' => [
                'id' => 1,
                'product_id' => 1,
                'cart_num' => 1,
                'productInfo' => ['id' => 1, 'store_name' => 'virtual', 'price' => '10.00', 'image' => '', 'attrInfo' => ['unique' => $this->token . '-sku', 'disk_info' => '', 'suk' => $this->token . '-suk']],
            ],
        ]);

        try {
            app()->make(StoreOrderSuccessServices::class)->paySuccess(BusinessSnapshot::order($orderId), PayServices::WEIXIN_PAY, ['trade_no' => 'T', 'out_trade_no' => $this->token . '-virtual']);
            self::fail('a failed virtual allocation must not report a successful payment');
        } catch (\Throwable $e) {
            self::assertStringContainsString('库存不足', $e->getMessage());
        }
        self::assertSame(0, (int)BusinessSnapshot::order($orderId)['paid'], 'no paid order without its card');
        self::assertCount(0, BusinessSnapshot::orderStatusRows($orderId, 'pay_success'));
    }

    /**
     * FULFILL-001: the local fulfillment runs in the payment transaction, and a
     * second payment attempt (a duplicate callback) does not issue a second
     * coupon, a second flow or a second card.
     */
    public function testRepeatedPaymentDoesNotDuplicateLocalFulfillment(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $orderIdString = $this->token . '-once';
        $order = $fixtures->createOrder($user['uid'], ['order_id' => $orderIdString, 'pay_type' => 'weixin']);
        $orderId = (int)$order['id'];
        $fixtures->createOrderCart($orderId, $user['uid']);

        $success = app()->make(StoreOrderSuccessServices::class);
        self::assertTrue($success->paySuccess(BusinessSnapshot::order($orderId), PayServices::WEIXIN_PAY, ['trade_no' => 'T1', 'out_trade_no' => $orderIdString]));
        // The second attempt loses the atomic paid transition.
        self::assertFalse($success->paySuccess(BusinessSnapshot::order($orderId), PayServices::WEIXIN_PAY, ['trade_no' => 'T1', 'out_trade_no' => $orderIdString]));

        self::assertCount(1, BusinessSnapshot::orderStatusRows($orderId, 'pay_success'), 'one pay_success status row');
        self::assertCount(1, BusinessSnapshot::capitalFlows($orderIdString), 'one capital flow');
        // Five notification targets plus print and invoice are independent
        // effects; the second payment attempt adds no eighth record.
        self::assertCount(7, BusinessSnapshot::effects($orderId), 'one record per external target, not per payment attempt');
    }

    /**
     * FULFILL-001/PAY-006: the external actions are registered per target, so a
     * failing notice leaves the print and invoice records untouched, and each
     * runs on its own.
     */
    public function testExternalActionsAreRegisteredPerTarget(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $orderIdString = $this->token . '-targets';
        $order = $fixtures->createOrder($user['uid'], ['order_id' => $orderIdString, 'pay_type' => 'weixin']);
        $orderId = (int)$order['id'];
        $fixtures->createOrderCart($orderId, $user['uid']);

        self::assertTrue(app()->make(StoreOrderSuccessServices::class)->paySuccess(BusinessSnapshot::order($orderId), PayServices::WEIXIN_PAY, ['trade_no' => 'T', 'out_trade_no' => $orderIdString]));

        $events = array_column(BusinessSnapshot::effects($orderId), 'event_type');
        self::assertContains(StoreOrderEffectServices::EVENT_PAY_NOTICE, $events, 'the notice has its own record');
        self::assertContains(StoreOrderEffectServices::EVENT_PAY_NOTICE_ADMIN, $events, 'the admin notice has its own record');
        self::assertContains(StoreOrderEffectServices::EVENT_PAY_NOTICE_PUSH, $events, 'the push has its own record');
        self::assertContains(StoreOrderEffectServices::EVENT_PAY_NOTICE_CUSTOM, $events, 'the custom notice has its own record');
        self::assertContains(StoreOrderEffectServices::EVENT_PAY_NOTICE_EVENT, $events, 'the custom event has its own record');
        self::assertContains(StoreOrderEffectServices::EVENT_PAY_PRINT, $events, 'the print has its own record');
        self::assertContains(StoreOrderEffectServices::EVENT_PAY_INVOICE, $events, 'the invoice has its own record');
        self::assertNotContains(StoreOrderEffectServices::EVENT_PAY_SUCCESS, $events, 'the bundled legacy event is no longer written');

        // Failing the notice marks only the notice unknown; print and invoice
        // finish and are never replayed with it.
        $notice = Db::name('store_order_effect')->where('store_order_id', $orderId)->where('event_type', StoreOrderEffectServices::EVENT_PAY_NOTICE)->find();
        $effects = app()->make(StoreOrderEffectServices::class);
        self::assertTrue($effects->runById((int)$notice['id']), 'a notice with a live order runs');
        // The print record runs on its own. The test adapter completes the
        // local print operation and records that result independently.
        $printId = (int)Db::name('store_order_effect')->where('store_order_id', $orderId)->where('event_type', StoreOrderEffectServices::EVENT_PAY_PRINT)->value('id');
        $effects->runById($printId);
        $printRow = Db::name('store_order_effect')->where('id', $printId)->find();
        self::assertSame(
            \app\model\order\StoreOrderEffect::STATUS_DONE,
            (int)$printRow['status'],
            'the print outcome is kept on its own record'
        );
        $noticeRow = Db::name('store_order_effect')->where('id', (int)$notice['id'])->find();
        self::assertSame(
            \app\model\order\StoreOrderEffect::STATUS_UNKNOWN,
            (int)$noticeRow['status'],
            'the notice keeps its own unknown outcome'
        );

        // The invoice record runs on its own and finishes.
        $invoiceId = (int)Db::name('store_order_effect')->where('store_order_id', $orderId)->where('event_type', StoreOrderEffectServices::EVENT_PAY_INVOICE)->value('id');
        self::assertTrue(
            $effects->runById($invoiceId),
            'the invoice runs on its own: ' . (string)Db::name('store_order_effect')->where('id', $invoiceId)->value('last_error')
        );
        self::assertSame(
            \app\model\order\StoreOrderEffect::STATUS_DONE,
            (int)Db::name('store_order_effect')->where('id', $invoiceId)->value('status'),
            'the invoice finished on its own record'
        );
    }

    /**
     * VIRTUAL-001: two orders racing for the last card must not both get it; the
     * loser fails cleanly and the winner's card is claimed exactly once.
     */
    public function testTwoOrdersCannotClaimTheSameCard(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $userA = $fixtures->createUser();
        $userB = $fixtures->createUser();
        $unique = $this->token . '-card';

        // One card in stock.
        $cardId = (int)Db::name('store_product_virtual')->insertGetId([
            'product_id' => 1,
            'attr_unique' => $unique,
            'card_no' => 'CN-' . $this->token,
            'card_pwd' => 'PW-' . $this->token,
            'card_unique' => 'CU-' . $this->token,
            'order_id' => '',
            'uid' => 0,
        ]);
        $this->registerCleanup(static function () use ($cardId): void {
            Db::name('store_product_virtual')->where('id', $cardId)->delete();
        });

        $orders = [];
        foreach ([[$userA, 'a'], [$userB, 'b']] as [$user, $label]) {
            $orders[$label] = $fixtures->createOrder($user['uid'], [
                'order_id' => $this->token . '-claim-' . $label,
                'pay_type' => 'weixin',
                'virtual_type' => 1,
            ]);
            $fixtures->createOrderCart((int)$orders[$label]['id'], $user['uid'], [
                'cart_info' => [
                    'id' => 1,
                    'product_id' => 1,
                    'cart_num' => 1,
                    'productInfo' => ['id' => 1, 'store_name' => 'virtual', 'price' => '10.00', 'image' => '', 'attrInfo' => ['unique' => $unique, 'disk_info' => '', 'suk' => $this->token . '-suk']],
                ],
            ]);
        }

        /** @var StoreOrderDeliveryServices $delivery */
        $delivery = app()->make(StoreOrderDeliveryServices::class);
        $delivery->assignVirtualGoods(BusinessSnapshot::order((int)$orders['a']['id']));
        $winner = Db::name('store_product_virtual')->where('id', $cardId)->find();
        self::assertSame((string)$orders['a']['order_id'], (string)$winner['order_id'], 'the first order claimed the card');

        // The second order finds no card and fails without touching the first.
        try {
            $delivery->assignVirtualGoods(BusinessSnapshot::order((int)$orders['b']['id']));
            self::fail('the second order must not receive the already-claimed card');
        } catch (\Throwable $e) {
            self::assertStringContainsString('库存不足', $e->getMessage());
        }
        $after = Db::name('store_product_virtual')->where('id', $cardId)->find();
        self::assertSame((string)$orders['a']['order_id'], (string)$after['order_id'], 'the card still belongs to the first order');

        // Re-running the winner reuses the same card and does not allocate a second.
        $delivery->assignVirtualGoods(BusinessSnapshot::order((int)$orders['a']['id']));
        self::assertSame(1, (int)Db::name('store_product_virtual')->where('order_id', (string)$orders['a']['order_id'])->count(), 'the winner holds exactly one card');
    }
}
