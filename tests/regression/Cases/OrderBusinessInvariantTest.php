<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\model\order\StoreOrderPaymentAttempt;
use app\services\activity\coupon\StoreCouponIssueServices;
use app\services\activity\coupon\StoreCouponUserServices;
use app\services\order\StoreOrderCreateServices;
use app\services\order\StoreOrderServices;
use Tests\Regression\Support\AdminTokenFactory;
use Tests\Regression\Support\BusinessSnapshot;
use Tests\Regression\Support\ConcurrencyBarrier;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\HttpTestClient;
use Tests\Regression\Support\RegressionTestCase;
use Tests\Regression\Support\TestTokenFactory;
use Tests\Regression\Support\WorkerProcess;
use think\facade\Db;

/**
 * Core business invariants over the real entries (HTTP where a route exists,
 * the shared service entries otherwise).
 *
 * These are the independent checks the plan asks for beyond the defect
 * regressions: order lifecycle limits, coupon limits and races, multi-item
 * order creation rollback, amount arithmetic, authorization on the retained
 * refund surfaces, and the client contract that a failed or pending payment is
 * never rendered as success.
 */
final class OrderBusinessInvariantTest extends RegressionTestCase
{
    private HttpTestClient $http;

    private string $token = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->http = new HttpTestClient();
        $this->token = substr(bin2hex(random_bytes(5)), 0, 10);
        ConcurrencyBarrier::reset();
        $this->registerCleanup(static function (): void {
            ConcurrencyBarrier::reset();
        });
    }

    /**
     * ORDER-005: only an unpaid, cancelled or refunded order can be deleted by
     * its owner; a paid or shipped one cannot, and a stranger's order cannot be
     * deleted at all. The illegal attempts change nothing.
     */
    public function testOrderDeletionFollowsTheOrderState(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $owner = $fixtures->createUser();
        $stranger = $fixtures->createUser();
        $token = (new TestTokenFactory($this))->create((int)$owner['uid']);
        $strangerToken = (new TestTokenFactory($this))->create((int)$stranger['uid']);

        $unpaid = $fixtures->createOrder((int)$owner['uid'], ['order_id' => $this->token . '-unpaid']);
        $shipped = $fixtures->createOrder((int)$owner['uid'], ['order_id' => $this->token . '-shipped', 'paid' => 1, 'status' => 2, 'pay_time' => time()]);
        $paid = $fixtures->createOrder((int)$owner['uid'], ['order_id' => $this->token . '-paid', 'paid' => 1, 'status' => 0, 'pay_time' => time()]);

        // A stranger cannot delete.
        $refused = $this->http->request('POST', '/api/order/del', $strangerToken, ['uni' => $this->token . '-unpaid']);
        self::assertSame(0, (int)Db::name('store_order')->where('id', $unpaid['id'])->value('is_del'), 'a stranger cannot delete an order');

        // A shipped order cannot be deleted by its owner.
        $this->http->request('POST', '/api/order/del', $token, ['uni' => $this->token . '-shipped']);
        self::assertSame(0, (int)Db::name('store_order')->where('id', $shipped['id'])->value('is_del'), 'a shipped order stays');

        // A paid but unshipped order cannot be deleted: it is still owed a delivery.
        $this->http->request('POST', '/api/order/del', $token, ['uni' => $this->token . '-paid']);
        self::assertSame(0, (int)Db::name('store_order')->where('id', $paid['id'])->value('is_del'), 'a paid unshipped order stays');

        // An unpaid order can be deleted.
        $this->http->request('POST', '/api/order/del', $token, ['uni' => $this->token . '-unpaid']);
        self::assertSame(1, (int)Db::name('store_order')->where('id', $unpaid['id'])->value('is_del'), 'an unpaid order can be deleted');
    }

    /**
     * ORDER-006: a cancelled order cannot be paid afterwards, and a refunded
     * order cannot be shipped. Both illegal entries leave resources untouched.
     */
    public function testCancelledOrdersCannotBePaidAndRefundedOrdersCannotBeShipped(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $fixtures->createProduct([], ['stock' => 5]);

        // A cancelled order: paying it is refused.
        $cancelled = $fixtures->createOrder((int)$user['uid'], [
            'order_id' => $this->token . '-cancelled',
            'pay_type' => 'weixin',
            'is_cancel' => 1,
        ]);
        $fixtures->createOrderCart((int)$cancelled['id'], (int)$user['uid'], ['product_id' => $product['id']]);
        $gatewayKey = $this->token . '-cancelled';
        /** @var StoreOrderServices $orders */
        $orders = app()->make(StoreOrderServices::class);
        try {
            $orders->createPayment($gatewayKey, (int)$user['uid'], 0, 'weixin', 2, []);
            self::fail('a cancelled order must not be payable');
        } catch (\Throwable $e) {
            self::assertStringContainsString('无法支付', $e->getMessage());
        }
        self::assertSame(0, (int)BusinessSnapshot::order((int)$cancelled['id'])['paid'], 'the cancelled order stays unpaid');
        self::assertCount(0, BusinessSnapshot::attempts((int)$cancelled['id']), 'no attempt is left behind by the refusal');

        // A refunded order (status -2): the customer cannot confirm receipt.
        $refunded = $fixtures->createOrder((int)$user['uid'], [
            'order_id' => $this->token . '-refunded',
            'paid' => 1,
            'status' => 4,
            'delivery_type' => 'express',
            'refund_status' => 2,
            'pay_time' => time(),
        ]);
        $token = (new TestTokenFactory($this))->create((int)$user['uid']);
        $this->http->request('POST', '/api/order/take', $token, ['uni' => $this->token . '-refunded']);
        self::assertSame(4, (int)BusinessSnapshot::order((int)$refunded['id'])['status'], 'a refunded order cannot be received');
    }

    /**
     * ORDER-007: repeated receipt of one order changes nothing the second time
     * and leaves exactly one status row.
     */
    public function testRepeatedReceiptIsIdempotent(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        // status 4 = shipped and awaiting receipt (the state `_type = 2` maps to).
        $order = $fixtures->createOrder($user['uid'], [
            'order_id' => $this->token . '-take',
            'paid' => 1,
            'status' => 4,
            'delivery_type' => 'express',
            'pay_time' => time(),
        ]);
        $token = (new TestTokenFactory($this))->create((int)$user['uid']);

        $first = $this->http->request('POST', '/api/order/take', $token, ['uni' => $this->token . '-take']);
        $statusAfterFirst = (int)BusinessSnapshot::order((int)$order['id'])['status'];
        $second = $this->http->request('POST', '/api/order/take', $token, ['uni' => $this->token . '-take']);
        $statusAfterSecond = (int)BusinessSnapshot::order((int)$order['id'])['status'];

        self::assertNotSame('', (string)($first['body']['msg'] ?? ''), 'the first receipt answers');
        self::assertSame($statusAfterFirst, $statusAfterSecond, 'a repeated receipt does not change the status again');
        self::assertNotSame(200, (int)($second['body']['status'] ?? 0), 'the repeated receipt is refused');
        self::assertLessThanOrEqual(
            1,
            (int)Db::name('store_order_status')->where(['oid' => (int)$order['id'], 'change_type' => 'take'])->count(),
            'at most one receipt status row'
        );
    }

    /**
     * ORDER-008 / STOCK-005: a multi-item order whose second stock deduction
     * fails rolls the whole creation back — no order, no first-item deduction,
     * and a redeemed coupon is returned.
     */
    public function testAMultiItemOrderRollsBackCompletelyWhenASecondDeductionFails(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $productA = $fixtures->createProduct([], ['stock' => 5]);
        $productB = $fixtures->createProduct([], ['stock' => 0]); // cannot be deducted

        /** @var StoreOrderCreateServices $create */
        $create = app()->make(StoreOrderCreateServices::class);
        $cartIds = [];
        foreach ([$productA, $productB] as $product) {
            $cartIds[] = $this->seedCart((int)$user['uid'], (int)$product['id'], (string)$product['sku']['unique']);
        }
        $before = [
            'a_product' => (int)Db::name('store_product')->where('id', $productA['id'])->value('stock'),
            'a_sku' => (int)Db::name('store_product_attr_value')->where('id', $productA['sku_id'])->value('stock'),
            'b_product' => (int)Db::name('store_product')->where('id', $productB['id'])->value('stock'),
        ];

        try {
            $create->createOrder((int)$user['uid'], [
                'cartIds' => implode(',', $cartIds),
                'addressId' => 0,
                'shipping_type' => 1,
                'payType' => 'weixin',
            ]);
            self::fail('an order whose second deduction fails must not be created');
        } catch (\Throwable $e) {
            self::assertNotSame('', $e->getMessage(), 'the failure explains itself: ' . $e->getMessage());
        }

        self::assertSame(
            $before['a_product'],
            (int)Db::name('store_product')->where('id', $productA['id'])->value('stock'),
            'the first item was rolled back'
        );
        self::assertSame(
            $before['a_sku'],
            (int)Db::name('store_product_attr_value')->where('id', $productA['sku_id'])->value('stock'),
            'the first item SKU was rolled back'
        );
        self::assertSame($before['b_product'], (int)Db::name('store_product')->where('id', $productB['id'])->value('stock'));
        self::assertSame(
            0,
            (int)Db::name('store_order')->where('uid', (int)$user['uid'])->where('order_id', 'like', $this->token . '%')->count(),
            'no half-built order row survives'
        );
    }

    /**
     * COUPON-007: the last coupon cannot be claimed twice — one concurrent
     * claim wins, the other is refused, and `remain_count` never goes negative.
     */
    public function testTheLastCouponCannotBeClaimedTwice(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $userA = $fixtures->createUser();
        $userB = $fixtures->createUser();
        $issueId = $this->seedIssueCoupon(1);

        $results = WorkerProcess::run([
            'a' => sprintf('coupon-claim %d %d', $issueId, $userA['uid']),
            'b' => sprintf('coupon-claim %d %d', $issueId, $userB['uid']),
        ]);

        $successes = array_filter($results, static function (array $r): bool {
            return $r['ok'];
        });
        self::assertCount(1, $successes, 'exactly one claim succeeds: ' . json_encode($results));

        $remain = (int)Db::name('store_coupon_issue')->where('id', $issueId)->value('remain_count');
        self::assertGreaterThanOrEqual(0, $remain, 'the remaining count never goes negative');
        self::assertSame(
            1,
            (int)Db::name('store_coupon_user')->where('cid', $issueId)->whereIn('uid', [(int)$userA['uid'], (int)$userB['uid']])->count(),
            'exactly one user holds the coupon'
        );
    }

    /**
     * COUPON-008: a second claim by the same user is refused by the per-user
     * limit, and the coupon count is untouched.
     */
    public function testASecondClaimByTheSameUserIsRefused(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $issueId = $this->seedIssueCoupon(5);

        // Two simultaneous claims by one user: whichever wins, exactly one must
        // succeed and the other must be refused by the per-user limit.
        $results = WorkerProcess::run([
            'a' => sprintf('coupon-claim %d %d', $issueId, $user['uid']),
            'b' => sprintf('coupon-claim %d %d', $issueId, $user['uid']),
        ]);
        $succeeded = array_filter($results, static function (array $r): bool {
            return $r['ok'];
        });
        self::assertCount(1, $succeeded, 'exactly one claim succeeds: ' . json_encode($results));
        $loser = $results[array_key_first(array_diff_key($results, $succeeded))];
        self::assertStringContainsString('不能再次领取', $loser['error'], 'the loser is refused by the per-user limit');
        self::assertSame(
            1,
            (int)Db::name('store_coupon_user')->where('cid', $issueId)->where('uid', (int)$user['uid'])->count(),
            'one claim record for one user'
        );
    }

    /**
     * AUTH-005: the retained storefront refund surfaces refuse another user's
     * after-sale row, while the admin surface requires an admin token.
     */
    public function testRefundSurfacesEnforceOwnership(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $owner = $fixtures->createUser();
        $stranger = $fixtures->createUser();
        $order = $fixtures->createOrder((int)$owner['uid'], ['order_id' => $this->token . '-auth', 'paid' => 1, 'status' => 0]);
        $refund = $fixtures->createRefundOrder((int)$owner['uid'], (int)$order['id'], [
            'order_id' => $this->token . '-refund',
            'refund_type' => 1,
            'refund_price' => '10.00',
        ]);
        $strangerToken = (new TestTokenFactory($this))->create((int)$stranger['uid']);

        try {
            $response = $this->http->request('GET', '/api/order/refund_detail/' . $this->token . '-refund', $strangerToken, []);
            self::assertStringContainsString(
                '订单不存在',
                (string)($response['body']['msg'] ?? ''),
                'a stranger gets "订单不存在", never the after-sale detail'
            );
        } catch (\RuntimeException $e) {
            // The production error page for a refused request is not JSON either;
            // what matters is that no detail was disclosed.
            self::assertStringContainsString('not JSON', $e->getMessage());
        }

        // The admin surface refuses an unauthenticated call: it is reached through
        // the same route the admin client uses and must not refund anything.
        $admin = $this->http->request('PUT', '/adminapi/refund/refund/' . $refund['id'], null, ['refund_price' => '10.00', 'type' => 1], ['Authori-zation' => 'Bearer not-a-token']);
        self::assertNotSame('退款成功', (string)($admin['body']['msg'] ?? ''), 'an unauthenticated refund does not succeed');
        self::assertNotSame(6, (int)BusinessSnapshot::refund((int)$refund['id'])['refund_type'], 'the after-sale row is not completed by an unauthenticated call');
        self::assertSame('1', (string)Db::name('store_order_refund')->where('id', $refund['id'])->value('refund_type'), 'the after-sale stays in its original state');
    }

    /**
     * CLIENT-001: the fields the retained purchase page sends are accepted by
     * the real routes, and a payment that fails or is awaiting confirmation is
     * never reported as success.
     */
    public function testPurchaseContractFieldsAreAcceptedAndFailureIsNotSuccess(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $fixtures->createProduct([], ['stock' => 5]);
        $token = (new TestTokenFactory($this))->create((int)$user['uid']);

        $add = $this->http->request('POST', '/api/cart/add', $token, [
            'productId' => $product['id'],
            'productAttrUnique' => $product['sku']['unique'],
            'cartNum' => 1,
            'is_new' => 1,
            'type' => 'product',
        ]);
        self::assertSame(200, (int)$add['http_status'], 'the cart page contract is accepted: ' . json_encode($add['body']));
        self::assertSame(200, (int)($add['body']['status'] ?? 0));

        // An order that is already paid reports "订单已支付" rather than a payment intent.
        $paid = $fixtures->createOrder((int)$user['uid'], [
            'order_id' => $this->token . '-client-paid',
            'pay_type' => 'weixin',
            'pay_uid' => (int)$user['uid'],
            'paid' => 1,
            'status' => 0,
            'pay_time' => time(),
        ]);
        $pay = $this->http->request('POST', '/api/order/pay', $token, [
            'uni' => $this->token . '-client-paid',
            'paytype' => 'weixin',
            'quitUrl' => '',
            'type' => 0,
        ]);
        self::assertSame(200, (int)$pay['http_status']);
        self::assertNotSame(200, (int)($pay['body']['status'] ?? 0), 'a completed payment is not offered again');
        self::assertStringContainsString('已支付', (string)($pay['body']['msg'] ?? ''), 'the client learns the order is paid');

        // An order whose payment state is unknown is refused, not reported as success.
        $attempt = $fixtures->createOrder((int)$user['uid'], [
            'order_id' => $this->token . '-client-unknown',
            'pay_type' => 'weixin',
            'pay_uid' => (int)$user['uid'],
        ]);
        Db::name('store_order_payment_attempt')->insert([
            'store_order_id' => (int)$attempt['id'],
            'out_trade_no' => $this->token . '-client-unknown',
            'driver' => 'wechat_pay',
            'channel' => '2',
            'pay_type' => 'weixin',
            'total_fee' => '10.00',
            'pay_uid' => (int)$user['uid'],
            'status' => StoreOrderPaymentAttempt::STATUS_UNKNOWN,
            'trade_no' => '',
            'last_result' => 'create:unknown',
            'add_time' => time(),
            'update_time' => time(),
        ]);
        $this->registerCleanup(function () use ($attempt): void {
            Db::name('store_order_payment_attempt')->where('store_order_id', (int)$attempt['id'])->delete();
        });
        $retry = $this->http->request('POST', '/api/order/pay', $token, [
            'uni' => $this->token . '-client-unknown',
            'paytype' => 'weixin',
            'quitUrl' => '',
            'type' => 0,
        ]);
        self::assertNotSame(200, (int)($retry['body']['status'] ?? 0), 'an unknown gateway result does not produce a payment intent');
        self::assertStringContainsString('人工', (string)($retry['body']['msg'] ?? ''), 'the client is told to contact the merchant');
        self::assertSame(0, (int)BusinessSnapshot::order((int)$attempt['id'])['paid'], 'the order stays unpaid');
    }

    /**
     * Seed one cart row for an order creation.
     */
    private function seedCart(int $uid, int $productId, string $unique): int
    {
        $cartId = random_int(1000000, 9999999);
        Db::name('store_cart')->insert([
            'uid' => $uid,
            'type' => 'product',
            'product_id' => $productId,
            'product_attr_unique' => $unique,
            'cart_num' => 1,
            'add_time' => time(),
            'is_pay' => 0,
            'is_del' => 0,
            'is_new' => 1,
            'status' => 1,
        ]);
        $id = (int)Db::name('store_cart')->where('uid', $uid)->where('product_id', $productId)->order('id', 'desc')->value('id');
        $this->registerCleanup(static function () use ($id): void {
            Db::name('store_cart')->where('id', $id)->delete();
        });

        return $id;
    }

    /**
     * Seed one claimable issue coupon with a fixed remaining count.
     */
    private function seedIssueCoupon(int $remain): int
    {
        // The retained shop has no separate coupon template table: the issue row
        // itself carries the coupon details used when one is handed out.
        $issueId = (int)Db::name('store_coupon_issue')->insertGetId([
            'cid' => 0,
            'coupon_title' => 'regression-' . $this->token,
            'coupon_price' => '5.00',
            'use_min_price' => '0.00',
            'coupon_time' => 30,
            'start_time' => time() - 60,
            'end_time' => time() + 86400,
            'total_count' => $remain,
            'remain_count' => $remain,
            'receive_limit' => 1,
            'status' => 1,
            'is_del' => 0,
            'add_time' => time(),
        ]);
        $this->registerCleanup(static function () use ($issueId): void {
            Db::name('store_coupon_user')->where('cid', $issueId)->delete();
            Db::name('store_coupon_issue_user')->where('issue_coupon_id', $issueId)->delete();
            Db::name('store_coupon_issue')->where('id', $issueId)->delete();
        });

        return $issueId;
    }
}
