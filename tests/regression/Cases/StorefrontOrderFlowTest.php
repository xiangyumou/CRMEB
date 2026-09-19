<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\HttpTestClient;
use Tests\Regression\Support\RegressionTestCase;
use Tests\Regression\Support\TestTokenFactory;
use think\facade\Db;

/**
 * The full retained purchase path over real HTTP: cart, confirmation, price
 * calculation and order creation, plus the notification the queue is supposed to
 * receive afterwards. The retired-feature removal changed the signatures and
 * payloads underneath all four steps, and an empty table hid every one of the
 * resulting TypeErrors — this is the coverage that keeps them gone.
 */
final class StorefrontOrderFlowTest extends RegressionTestCase
{
    /** @var HttpTestClient */
    private $http;

    protected function setUp(): void
    {
        parent::setUp();
        $this->http = new HttpTestClient();
    }

    /**
     * A product that ships: freight is included (`freight=1`), so no shipping
     * template lookup is needed and the expected postage stays 0.
     */
    private function sellableProduct(FixtureFactory $fixtures, array $overrides = []): array
    {
        return $fixtures->createProduct(array_merge([
            'price' => '10.00',
            'vip_price' => '9.00',
            'stock' => 10,
            'is_show' => 1,
            'is_del' => 0,
            'freight' => 1,
            'temp_id' => 1,
            'custom_form' => '[]',
            'is_limit' => 0,
        ], $overrides));
    }

    private function shippingAddress(FixtureFactory $fixtures, int $uid): int
    {
        $id = (int)Db::name('user_address')->insertGetId([
            'uid' => $uid,
            'real_name' => '收货人',
            'phone' => '13900000002',
            'province' => '北京市',
            'city' => '北京市',
            'city_id' => 1,
            'district' => '朝阳区',
            'detail' => '测试路 1 号',
            'is_default' => 1,
            'is_del' => 0,
            'add_time' => time(),
        ]);
        $this->registerCleanup(function () use ($id) {
            Db::name('user_address')->where('id', $id)->delete();
        });
        return $id;
    }

    private function addToCart(string $token, int $productId, string $skuUnique): array
    {
        $response = $this->http->request('POST', '/api/cart/add', $token, [
            'productId' => $productId,
            'cartNum' => 1,
            'uniqueId' => $skuUnique,
            'new' => 0,
            'is_new' => 0,
        ]);
        self::assertSame(200, $response['http_status']);
        self::assertSame(200, $response['body']['status'], json_encode($response['body'], JSON_UNESCAPED_UNICODE));
        self::assertArrayHasKey('cartId', $response['body']['data']);
        return $response['body']['data'];
    }

    /**
     * `computedPayPostage()` kept forwarding an undefined `$payType` into the
     * calculator's `array $cartInfo` parameter, so both `order/computed` and
     * `order/create` returned 500 for every cart. The price calculation is the
     * first place a shopper meets it.
     */
    public function testPriceCalculationAndOrderCreationSucceedEndToEnd(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $this->sellableProduct($fixtures);
        $addressId = $this->shippingAddress($fixtures, $user['uid']);
        $token = (new TestTokenFactory($this))->create($user['uid']);

        $cart = $this->addToCart($token, $product['id'], $product['sku']['unique']);

        $confirm = $this->http->request('POST', '/api/order/confirm', $token, [
            'cartId' => (string)$cart['cartId'],
            'new' => 0,
            'addressId' => $addressId,
            'shipping_type' => 1,
        ]);
        self::assertSame(200, $confirm['http_status']);
        self::assertSame(200, $confirm['body']['status'], json_encode($confirm['body'], JSON_UNESCAPED_UNICODE));
        $orderKey = $confirm['body']['data']['orderKey'] ?? '';
        self::assertNotSame('', $orderKey, 'confirmation caches the cart and returns its key');
        self::assertSame('10.00', (string)($confirm['body']['data']['priceGroup']['totalPrice'] ?? ''));

        $payload = [
            'addressId' => $addressId,
            'couponId' => 0,
            'payType' => '',
            'useIntegral' => 0,
            'mark' => '',
            'combinationId' => 0,
            'pinkId' => 0,
            'shipping_type' => 1,
            'real_name' => '',
            'phone' => '',
            'new' => 0,
            'invoice_id' => 0,
            'advanceId' => 0,
            'custom_form' => [],
            'is_gift' => 0,
            'gift_mark' => '',
        ];

        $computed = $this->http->request('POST', '/api/order/computed/' . $orderKey, $token, $payload);
        self::assertSame(200, $computed['http_status']);
        self::assertSame(200, $computed['body']['status'], 'order/computed: ' . json_encode($computed['body'], JSON_UNESCAPED_UNICODE));
        self::assertSame('10.00', (string)($computed['body']['data']['result']['pay_price'] ?? ''));

        $create = $this->http->request('POST', '/api/order/create/' . $orderKey, $token, $payload);
        self::assertSame(200, $create['http_status']);
        self::assertSame(200, $create['body']['status'], 'order/create: ' . json_encode($create['body'], JSON_UNESCAPED_UNICODE));
        $orderId = (string)($create['body']['data']['result']['orderId'] ?? '');
        self::assertNotSame('', $orderId);

        $order = Db::name('store_order')->where('order_id', $orderId)->find();
        self::assertNotEmpty($order, 'the order row exists');
        $this->registerCleanup(function () use ($order) {
            Db::name('store_order_status')->where('oid', $order['id'])->delete();
            Db::name('store_order_cart_info')->where('oid', $order['id'])->delete();
            Db::name('store_order')->where('id', $order['id'])->delete();
        });
        self::assertSame($user['uid'], (int)$order['uid']);
        self::assertSame('10.00', (string)$order['pay_price']);
        self::assertSame(9, (int)Db::name('store_product')->where('id', $product['id'])->value('stock'), 'the stock is decremented');
        self::assertSame(9, (int)Db::name('store_product_attr_value')->where('id', $product['sku_id'])->value('stock'));
    }

    /**
     * The coupon is spent by a conditional update inside the order transaction, and
     * the order is refused unless exactly one row changed. A coupon that is not the
     * caller's to spend has to fail before anything is written: no order row, no
     * stock movement, and the coupon keeps the state it already had.
     */
    public function testASpentCouponIsRefusedBeforeAnyOrderIsWritten(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $this->sellableProduct($fixtures);
        $addressId = $this->shippingAddress($fixtures, $user['uid']);
        $token = (new TestTokenFactory($this))->create($user['uid']);
        $spent = $fixtures->createUserCoupon($user['uid'], ['status' => 1, 'use_time' => time()]);

        $cart = $this->addToCart($token, $product['id'], $product['sku']['unique']);
        $confirm = $this->http->request('POST', '/api/order/confirm', $token, [
            'cartId' => (string)$cart['cartId'], 'new' => 0, 'addressId' => $addressId, 'shipping_type' => 1,
        ]);
        $orderKey = $confirm['body']['data']['orderKey'] ?? '';
        self::assertNotSame('', $orderKey, 'confirmation returns an order key');
        $ordersBefore = (int)Db::name('store_order')->where('uid', $user['uid'])->count();

        $create = $this->http->request('POST', '/api/order/create/' . $orderKey, $token, [
            'addressId' => $addressId,
            'couponId' => (int)$spent['id'],
            'payType' => '',
            'useIntegral' => 0,
            'mark' => '',
            'combinationId' => 0,
            'pinkId' => 0,
            'shipping_type' => 1,
            'real_name' => '',
            'phone' => '',
            'new' => 0,
            'invoice_id' => 0,
            'advanceId' => 0,
            'custom_form' => [],
            'is_gift' => 0,
            'gift_mark' => '',
        ]);
        self::assertNotSame(200, (int)($create['body']['status'] ?? 200), 'a spent coupon is refused: ' . json_encode($create['body'], JSON_UNESCAPED_UNICODE));
        self::assertSame(
            $ordersBefore,
            (int)Db::name('store_order')->where('uid', $user['uid'])->count(),
            'no order is written for the refused coupon'
        );
        self::assertSame(
            10,
            (int)Db::name('store_product')->where('id', $product['id'])->value('stock'),
            'the stock is untouched by the refused order'
        );
        self::assertSame(
            1,
            (int)Db::name('store_coupon_user')->where('id', $spent['id'])->value('status'),
            'the coupon stays spent, not returned'
        );
    }

    /**
     * The listener used to destructure seven values from a five-value payload,
     * so it aborted with a TypeError *after* the order row was written and the
     * unpaid-order jobs were never queued. The delay is what later cancels an
     * abandoned order, so its absence is invisible until stock never comes back.
     */
    public function testOrderCreationQueuesTheUnpaidCancellation(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $this->sellableProduct($fixtures);
        $addressId = $this->shippingAddress($fixtures, $user['uid']);
        $token = (new TestTokenFactory($this))->create($user['uid']);

        $cart = $this->addToCart($token, $product['id'], $product['sku']['unique']);
        $confirm = $this->http->request('POST', '/api/order/confirm', $token, [
            'cartId' => (string)$cart['cartId'], 'new' => 0, 'addressId' => $addressId, 'shipping_type' => 1,
        ]);
        $orderKey = $confirm['body']['data']['orderKey'] ?? '';
        self::assertNotSame('', $orderKey);

        $queued = $this->withQueueEnabled(function () use ($token, $orderKey, $addressId) {
            $create = $this->http->request('POST', '/api/order/create/' . $orderKey, $token, [
                'addressId' => $addressId, 'couponId' => 0, 'payType' => '', 'useIntegral' => 0, 'mark' => '',
                'combinationId' => 0, 'pinkId' => 0, 'shipping_type' => 1, 'real_name' => '', 'phone' => '',
                'new' => 0, 'invoice_id' => 0, 'advanceId' => 0, 'custom_form' => [], 'is_gift' => 0, 'gift_mark' => '',
            ]);
            self::assertSame(200, $create['body']['status'], json_encode($create['body'], JSON_UNESCAPED_UNICODE));
            return (string)($create['body']['data']['result']['orderId'] ?? '');
        });

        self::assertNotSame('', $queued, 'the order was created with the queue enabled');
        $jobs = $this->delayedJobs();
        $cancelJobs = array_filter($jobs, static function (array $job) use ($queued) {
            $order = Db::name('store_order')->where('order_id', $queued)->find();
            return $job['job'] === 'app\\jobs\\UnpaidOrderCancelJob'
                && in_array((int)($order['id'] ?? 0), array_map('intval', (array)($job['data']['data'] ?? [])), true);
        });
        self::assertNotEmpty($cancelJobs, 'UnpaidOrderCancelJob must be queued for the new order: ' . json_encode($jobs, JSON_UNESCAPED_UNICODE));
        $reminder = array_filter($jobs, static function (array $job) {
            return $job['job'] === 'app\\jobs\\UnpaidOrderSend';
        });
        self::assertNotEmpty($reminder, 'the unpaid reminder is queued as well');

        $order = Db::name('store_order')->where('order_id', $queued)->find();
        $this->registerCleanup(function () use ($order) {
            Db::name('store_order_status')->where('oid', $order['id'])->delete();
            Db::name('store_order_cart_info')->where('oid', $order['id'])->delete();
            Db::name('store_order')->where('id', $order['id'])->delete();
        });
    }

    /**
     * Queue dispatch only happens when the setting is on; the default install
     * runs jobs inline. Returning the flag to its seeded value afterwards keeps
     * the rest of the suite deterministic.
     */
    private function withQueueEnabled(callable $callback)
    {
        $row = Db::name('system_config')->where('menu_name', 'queue_open')->find();
        self::assertNotEmpty($row, 'the install SQL seeds queue_open');
        $cacheKey = \crmeb\services\SystemConfigService::CACHE_SYSTEM . '_queue_open';
        \crmeb\services\CacheService::delete($cacheKey);
        Db::name('system_config')->where('id', $row['id'])->update(['value' => json_encode(1)]);
        $this->registerCleanup(function () use ($row, $cacheKey) {
            \crmeb\services\CacheService::delete($cacheKey);
            Db::name('system_config')->where('id', $row['id'])->update(['value' => $row['value']]);
        });
        try {
            return $callback();
        } finally {
            \crmeb\services\CacheService::delete($cacheKey);
            Db::name('system_config')->where('id', $row['id'])->update(['value' => $row['value']]);
        }
    }

    /** Everything waiting in the delay queue, decoded. */
    private function delayedJobs(): array
    {
        $env = parse_ini_file(CRMEB_TEST_ROOT . '/.env', true);
        $redis = new \Redis();
        $redis->connect($env['REDIS']['REDIS_HOSTNAME'] ?? '127.0.0.1', (int)($env['REDIS']['PORT'] ?? 6379));
        $redis->select((int)($env['REDIS']['SELECT'] ?? 0));
        try {
            $raw = $redis->zRange('queues:CRMEB' . ($env['QUEUE']['QUEUE_NAME'] ?? '') . ':delayed', 0, -1);
        } finally {
            $redis->close();
        }
        $jobs = [];
        foreach ($raw as $payload) {
            $decoded = json_decode((string)$payload, true);
            if (is_array($decoded)) $jobs[] = $decoded;
        }
        return $jobs;
    }

    /**
     * `StorePinkServices::getPinkPoster` still called the deleted
     * `UserServices::checkUserPromoter()` and only caught `\Exception`, so a
     * `\Error` escaped as a bare 500 and the retained group-buy poster stopped
     * working. The attachment row is pre-seeded so the QR step — which would call
     * WeChat — is skipped and the poster is composed locally.
     */
    public function testGroupBuyPosterIsGeneratedWithoutWeChat(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $product = $this->sellableProduct($fixtures, ['image' => 'statics/poster/poster.jpg']);
        $token = (new TestTokenFactory($this))->create($user['uid']);

        $combinationId = (int)Db::name('store_combination')->insertGetId([
            'product_id' => $product['id'],
            'image' => 'statics/poster/poster.jpg',
            'images' => '[]',
            'title' => '拼团商品',
            'people' => 2,
            'price' => '8.00',
            'stock' => 10,
            'start_time' => time() - 3600,
            'stop_time' => time() + 86400,
            'is_show' => 1,
            'is_del' => 0,
        ]);
        $pinkId = (int)Db::name('store_pink')->insertGetId([
            'uid' => $user['uid'],
            'nickname' => '团长',
            'cid' => $combinationId,
            'pid' => $product['id'],
            'people' => 2,
            'price' => '8.00',
            'k_id' => 0,
            'status' => 1,
            'add_time' => (string)time(),
            'stop_time' => (string)(time() + 3600),
        ]);
        $attachmentName = $pinkId . '_' . $user['uid'] . '_0_pink_share_wap.jpg';
        $attachmentId = (int)Db::name('system_attachment')->insertGetId([
            'name' => $attachmentName,
            'att_dir' => 'statics/poster/poster.jpg',
            'satt_dir' => 'statics/poster/poster.jpg',
            'att_size' => '0',
            'att_type' => 'image/jpeg',
            'image_type' => 1,
            'module_type' => 2,
            'time' => time(),
            'pid' => 2,
            'type' => 0,
        ]);
        $this->registerCleanup(function () use ($combinationId, $pinkId, $attachmentId) {
            Db::name('store_pink')->where('id', $pinkId)->delete();
            Db::name('store_combination')->where('id', $combinationId)->delete();
            Db::name('system_attachment')->where('att_id', $attachmentId)->delete();
        });

        $response = $this->http->request('POST', '/api/combination/poster', $token, [
            'id' => $pinkId,
            'from' => 'wechat',
        ]);
        self::assertSame(200, $response['http_status'], 'the poster endpoint must not 500');
        self::assertSame(200, $response['body']['status'], json_encode($response['body'], JSON_UNESCAPED_UNICODE));
        self::assertNotSame('', (string)($response['body']['data']['url'] ?? ''), 'an image path is returned');
    }

    /**
     * The same payload mismatch reached shoppers through the real sign-up form:
     * `RegisterListener` read five values from a four-value payload, so `$isNew`
     * was null and nobody who registered themselves received the newcomer coupon.
     * Driving the HTTP route — not the listener — is what makes this the flow the
     * customer actually takes.
     */
    public function testSelfRegistrationIsIssuedTheNewcomerCoupon(): void
    {
        $couponId = (int)Db::name('store_coupon_issue')->insertGetId([
            'title' => '新人注册券',
            'coupon_price' => '5.00',
            'coupon_time' => 7,
            'is_permanent' => 1,
            'status' => 1,
        ]);
        $account = '139' . str_pad((string)random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
        $cacheKey = \crmeb\services\SystemConfigService::CACHE_SYSTEM . '_reward_coupon';
        $rewardRow = Db::name('system_config')->where('menu_name', 'reward_coupon')->find();
        self::assertNotEmpty($rewardRow, 'the install SQL seeds reward_coupon');
        \crmeb\services\CacheService::delete($cacheKey);
        Db::name('system_config')->where('id', $rewardRow['id'])->update(['value' => json_encode([['id' => $couponId]])]);
        \crmeb\services\CacheService::set('code_' . $account, '123456', 300);

        $this->registerCleanup(function () use ($couponId, $account, $rewardRow, $cacheKey) {
            \crmeb\services\CacheService::delete($cacheKey);
            \crmeb\services\CacheService::delete('code_' . $account);
            Db::name('system_config')->where('id', $rewardRow['id'])->update(['value' => $rewardRow['value']]);
            Db::name('store_coupon_issue')->where('id', $couponId)->delete();
            $uid = (int)Db::name('user')->where('account', $account)->value('uid');
            if ($uid) {
                Db::name('store_coupon_user')->where('uid', $uid)->delete();
                Db::name('store_coupon_issue_user')->where('uid', $uid)->delete();
                Db::name('user_bill')->where('uid', $uid)->delete();
                Db::name('user')->where('uid', $uid)->delete();
            }
        });

        $response = $this->http->request('POST', '/api/register', null, [
            'account' => $account,
            'captcha' => '123456',
            'password' => 'regression-password',
        ]);
        self::assertSame(200, $response['http_status']);
        self::assertSame(200, $response['body']['status'], json_encode($response['body'], JSON_UNESCAPED_UNICODE));

        $uid = (int)Db::name('user')->where('account', $account)->value('uid');
        self::assertGreaterThan(1, $uid, 'the account is created with its own uid');
        self::assertSame(1, (int)Db::name('store_coupon_user')
            ->where('uid', $uid)->where('cid', $couponId)->count(), 'the newcomer coupon lands on the new account');
        self::assertSame(0, (int)Db::name('store_coupon_user')
            ->where('uid', 1)->where('cid', $couponId)->count(), 'and never on uid 1');
    }
}
