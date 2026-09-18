<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\order\StoreOrderComputedServices;
use app\services\product\product\StoreProductServices;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\HttpTestClient;
use Tests\Regression\Support\RegressionTestCase;
use Tests\Regression\Support\TestTokenFactory;
use think\facade\Db;

/**
 * The retired-feature removal deleted service methods, trimmed event payloads and
 * dropped parameters while their callers stayed behind. Every case here failed at
 * runtime before the fix: a TypeError from a lost argument, null passed where the
 * DAO declares `array`, a listener reading past the end of its payload, or a call
 * to a method that no longer exists. They cover retained storefront paths only.
 */
final class RetainedPathSmokeTest extends RegressionTestCase
{
    /**
     * `computedPayPostage()` forwarded an undefined `$payType` as the second
     * argument, which `OrderFreightCalculator::computedPayPostage()` declares as
     * `array $cartInfo` — every price calculation and order create raised a
     * TypeError before the fix.
     */
    public function testFreightCalculationAcceptsTheRetainedSignature(): void
    {
        $result = app()->make(StoreOrderComputedServices::class)->computedPayPostage(
            1,
            [[
                'cart_num' => 1,
                'sum_price' => '20.00',
                'truePrice' => '20.00',
                'costPrice' => '0.00',
                'vip_truePrice' => '0.00',
                'price_type' => '',
                'level' => '0.00',
                'member' => '0.00',
                'productInfo' => [
                    'freight' => 2,
                    'postage' => '5.00',
                    'is_virtual' => 0,
                    'gift_price' => '0.00',
                ],
            ]],
            ['id' => 1, 'city_id' => 1, 'province' => '北京市', 'city' => '北京市', 'district' => '朝阳区'],
            '20.00',
            [],
            ['shipping_type' => 1],
            ['is_money_level' => 0]
        );

        self::assertCount(5, $result, 'the calculator returns [payPrice, payPostage, discount, freePostage, isFreePostage]');
        self::assertSame('5.00', $result[1]);
    }

    /**
     * `getRecommendProductArr()` lost the only assignment to `$where`, so the DAO
     * received null where it declares `array $where`. The storefront home page and
     * the PC product pages call this on every request.
     */
    public function testRecommendProductsLoadWithoutAResidualWhereClause(): void
    {
        $products = app()->make(StoreProductServices::class)
            ->getRecommendProductArr(0, ['is_best', 'is_new', 'is_benefit', 'is_hot']);

        self::assertCount(4, $products);
        foreach ($products as $list) {
            self::assertIsArray($list);
        }
        self::assertIsArray(app()->make(StoreProductServices::class)->getRecommendProduct(0, 'is_best'));
    }

    /** The v1 storefront home page: it read a fifth return value that no longer exists. */
    public function testStorefrontHomePageResponds(): void
    {
        $response = (new HttpTestClient())->request('GET', '/api/index', null);
        self::assertSame(200, $response['http_status']);
        self::assertSame(200, $response['body']['status'], json_encode($response['body'], JSON_UNESCAPED_UNICODE));
    }

    /** The v2 storefront home page: the logged-in branch called a deleted member-level method. */
    public function testStorefrontHomePageRespondsForALoggedInUser(): void
    {
        $user = (new FixtureFactory($this, $this->getName()))->createUser();
        $token = (new TestTokenFactory($this))->create($user['uid']);

        $response = (new HttpTestClient())->request('GET', '/api/v2/index', $token);
        self::assertSame(200, $response['http_status']);
        self::assertSame(200, $response['body']['status'], json_encode($response['body'], JSON_UNESCAPED_UNICODE));
    }

    /** `userinfo` called a deleted `UserServices::userInfo()`; clients read it on startup. */
    public function testUserInfoEndpointResponds(): void
    {
        $user = (new FixtureFactory($this, $this->getName()))->createUser();
        $token = (new TestTokenFactory($this))->create($user['uid']);

        $response = (new HttpTestClient())->request('GET', '/api/userinfo', $token);
        self::assertSame(200, $response['http_status']);
        self::assertSame(200, $response['body']['status'], json_encode($response['body'], JSON_UNESCAPED_UNICODE));
        self::assertSame((int)$user['uid'], (int)($response['body']['data']['uid'] ?? 0));
    }

    /**
     * The order-create payload carries five values; the listener destructured
     * seven, so `$seckillId`/`$bargainId` were null when they reached `pushJob()`
     * and the whole handler raised a TypeError *after* the order row was written —
     * the unpaid-cancel job was never queued and unpaid orders stopped expiring.
     */
    public function testOrderCreateListenerHandlesTheShortenedPayload(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], ['paid' => 0, 'status' => 0]);

        (new \app\listener\order\OrderCreateAfterListener())->handle([
            $order,
            ['cartInfo' => [], 'priceData' => [], 'addressId' => 0, 'cartIds' => [], 'news' => true],
            $user['uid'],
            'smoke-key',
            0,
        ]);

        self::assertSame(1, Db::name('store_order_status')
            ->where('oid', $order['id'])
            ->where('change_type', 'cache_key_create_order')
            ->count(), 'the listener must finish, not abort half-way');
    }

    /**
     * `RegisterListener` destructured five values from a four-value payload, so
     * `$isNew` was always null and the new-user coupon stopped being issued. The
     * shifted positions also handed the listener the literal `1` as the uid.
     */
    public function testRegistrationPayloadGrantsTheNewUserCouponToTheNewUser(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $couponId = (int)Db::name('store_coupon_issue')->insertGetId([
            'title' => 'Retained-path newcomer',
            'coupon_price' => '5.00',
            'coupon_time' => 7,
            'is_permanent' => 1,
            'status' => 1,
        ]);
        $this->registerCleanup(function () use ($couponId, $user) {
            Db::name('store_coupon_issue_user')->where('uid', $user['uid'])->delete();
            Db::name('store_coupon_user')->where('uid', $user['uid'])->delete();
            Db::name('store_coupon_issue')->where('id', $couponId)->delete();
        });
        $this->replace('sysConfig', new class($couponId) {
            private $couponId;
            public function __construct($couponId) { $this->couponId = $couponId; }
            public function get($key) { return $key === 'reward_coupon' ? [['id' => $this->couponId]] : '100'; }
        });

        (new \app\listener\user\RegisterListener())->handle(['h5', 'Newcomer', $user['uid'], 1]);

        self::assertSame(1, Db::name('store_coupon_user')
            ->where('uid', $user['uid'])->where('cid', $couponId)->count());
        self::assertSame(0, Db::name('store_coupon_user')
            ->where('uid', 1)->where('cid', $couponId)->count(), 'the coupon must not land on uid 1');
    }

    /** `order/del` called a deleted `removeOrder()`; deleting a finished order is a retained action. */
    public function testUserCanDeleteAFinishedOrder(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], [
            'paid' => 1,
            'pay_time' => time(),
            'status' => 3,
            'refund_status' => 0,
        ]);
        $token = (new TestTokenFactory($this))->create($user['uid']);

        $response = (new HttpTestClient())->request('POST', '/api/order/del', $token, ['uni' => $order['order_id']]);
        self::assertSame(200, $response['http_status']);
        self::assertSame(200, $response['body']['status'], json_encode($response['body'], JSON_UNESCAPED_UNICODE));
        self::assertSame(1, (int)Db::name('store_order')->where('id', $order['id'])->value('is_del'));
    }

    /**
     * An order the user still has to act on stays visible: shipping is not a
     * deletable state (`_type` 1), matching the rule the service restored.
     */
    public function testUserCannotDeleteAShippedOrder(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder($user['uid'], [
            'paid' => 1,
            'pay_time' => time(),
            'status' => 2,
            'shipping_type' => 1,
            'refund_status' => 0,
        ]);
        $token = (new TestTokenFactory($this))->create($user['uid']);

        $response = (new HttpTestClient())->request('POST', '/api/order/del', $token, ['uni' => $order['order_id']]);
        self::assertSame(200, $response['http_status']);
        self::assertNotSame(200, $response['body']['status'], json_encode($response['body'], JSON_UNESCAPED_UNICODE));
        self::assertSame(0, (int)Db::name('store_order')->where('id', $order['id'])->value('is_del'));
    }

    /** Deleting someone else's order must stay impossible. */
    public function testAnotherUserCannotDeleteTheOrder(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $owner = $fixtures->createUser();
        $stranger = $fixtures->createUser();
        $order = $fixtures->createOrder($owner['uid'], [
            'paid' => 1,
            'pay_time' => time(),
            'status' => 3,
            'refund_status' => 0,
        ]);
        $token = (new TestTokenFactory($this))->create($stranger['uid']);

        $response = (new HttpTestClient())->request('POST', '/api/order/del', $token, ['uni' => $order['order_id']]);
        self::assertSame(200, $response['http_status']);
        self::assertNotSame(200, $response['body']['status'], json_encode($response['body'], JSON_UNESCAPED_UNICODE));
        self::assertSame(0, (int)Db::name('store_order')->where('id', $order['id'])->value('is_del'));
    }

    /**
     * The storefront read `sys_config('ali_pay_status') != '0'`, which is *true*
     * when the row is missing. Once the migration deleted the retired payment
     * rows, every client showed Alipay (and the balance and offline options) as
     * available. The endpoint must report them off instead of reading a row the
     * removed feature used to own.
     */
    public function testRetiredPaymentFlagsReportOffWithoutTheirConfigRows(): void
    {
        self::assertSame(0, (int)Db::name('system_config')->where('menu_name', 'ali_pay_status')->count(),
            'the retired config rows should not be present in a migrated or fresh install');

        $response = (new HttpTestClient())->request('GET', '/api/basic_config', null);
        self::assertSame(200, $response['http_status']);
        $data = $response['body']['data'] ?? [];
        self::assertFalse((bool)($data['ali_pay_status'] ?? true), 'Alipay must not be advertised');
        self::assertFalse((bool)($data['yue_pay_status'] ?? true), 'balance payment must not be advertised');
        self::assertFalse((bool)($data['offline_pay_status'] ?? true), 'offline payment must not be advertised');
        self::assertSame(0, (int)($data['store_self_mention'] ?? 1), 'self-pickup must not be advertised');
    }

    /**
     * `StoreOrder::searchActivityTypeAttr()` was deleted with the retired
     * activities while the 订单类型 statistic kept passing `activity_type` to the
     * DAO. The DAO drops unknown search keys, so every bucket of the chart asked
     * for its own name and received the whole-table total.
     */
    public function testOrderTypeStatisticSeparatesRetainedOrdersFromHistoricalOnes(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        // Each bucket sums `pay_price`, so the two orders get distinct amounts:
        // a bucket that ignores the filter reports the 13.00 total instead.
        $fixtures->createOrder($user['uid'], [
            'paid' => 1, 'pay_time' => time(), 'status' => 3, 'pay_price' => '10.00',
        ]);
        $fixtures->createOrder($user['uid'], [
            'paid' => 1, 'pay_time' => time(), 'status' => 3, 'pay_price' => '3.00', 'advance_id' => 4242,
        ]);

        // The admin date picker joins two `yyyy/MM/dd` values with a dash, which is
        // the only shape the time searcher splits into a range.
        $start = date('Y/m/d', time() - 86400 * 30);
        $end = date('Y/m/d', time() + 86400);

        $buckets = app()->make(\app\services\statistic\OrderStatisticServices::class)
            ->getType(['time' => $start . '-' . $end]);
        $byName = [];
        foreach ($buckets['list'] as $row) {
            $byName[$row['name']] = (float)$row['value'];
        }
        self::assertSame(10.0, $byName['普通订单'] ?? null, 'only the plain order belongs in its bucket: ' . json_encode($byName));
        self::assertSame(3.0, $byName['预售订单'] ?? null, 'only the presale order belongs in its bucket: ' . json_encode($byName));
    }
}
