<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\HttpTestClient;
use Tests\Regression\Support\RegressionTestCase;
use Tests\Regression\Support\TestTokenFactory;
use think\facade\Db;

final class OrderAuthorizationHttpTest extends RegressionTestCase
{
    /** @var HttpTestClient */
    private $http;

    /** @var array */
    private $order;

    /** @var array */
    private $refund;

    /** @var string */
    private $attackerToken;

    /** @var string */
    private $ownerToken;

    /** @var int */
    private $attackerUid;

    protected function setUp(): void
    {
        parent::setUp();
        $fixtures = new FixtureFactory($this, $this->getName());
        $owner = $fixtures->createUser();
        $attacker = $fixtures->createUser();
        $this->attackerUid = $attacker['uid'];
        $this->order = $fixtures->createOrder($owner['uid'], [
            'paid' => 1,
            'pay_time' => time(),
            'status' => 1,
            'real_name' => 'Regression Owner',
            'user_phone' => '13000000001',
            'user_address' => 'Regression Address',
        ]);
        $this->refund = $fixtures->createRefundOrder($owner['uid'], $this->order['id']);
        $tokens = new TestTokenFactory($this);
        $this->ownerToken = $tokens->create($owner['uid']);
        $this->attackerToken = $tokens->create($this->attackerUid);
        $this->http = new HttpTestClient();
    }

    /**
     * @dataProvider unauthorizedOrderEndpointProvider
     */
    public function testOtherUsersCannotReadOrMutateOrders(string $method, string $path, array $body): void
    {
        $path = str_replace('{order_id}', $this->order['order_id'], $path);
        $body = array_map(function ($value) {
            return $value === '{order_id}' ? $this->order['order_id'] : $value;
        }, $body);
        $beforeOrder = $this->orderState();
        $beforeStatusCount = $this->statusCount();

        $response = $this->http->request($method, $path, $this->attackerToken, $body);

        $this->assertNotFound($response);
        self::assertSame($beforeOrder, $this->orderState());
        self::assertSame($beforeStatusCount, $this->statusCount());
    }

    public function unauthorizedOrderEndpointProvider(): array
    {
        return [
            'detail' => ['GET', '/api/order/detail/{order_id}', []],
            'cancel' => ['POST', '/api/order/cancel', ['id' => '{order_id}']],
            'receipt' => ['POST', '/api/order/take', ['uni' => '{order_id}']],
        ];
    }

    public function testOtherUserCannotReadRefundDetails(): void
    {
        $before = $this->refundState();

        $response = $this->http->request(
            'GET',
            '/api/order/refund/detail/' . $this->refund['order_id'],
            $this->attackerToken
        );

        $this->assertNotFound($response);
        self::assertSame($before, $this->refundState());
        self::assertSame(0, $this->refundStatusCount());
    }

    public function testOtherUserCannotSubmitRefundShipment(): void
    {
        $before = $this->refundState();

        $response = $this->http->request('POST', '/api/order/refund/express', $this->attackerToken, [
            'id' => $this->refund['id'],
            'refund_express' => 'REGRESSION-LEAK',
            'refund_phone' => '13000000002',
            'refund_express_name' => 'Regression Express',
        ]);

        $this->assertNotFound($response);
        self::assertSame($before, $this->refundState());
        self::assertSame(0, $this->refundStatusCount());
    }

    public function testOwnerCanReadRefundDetails(): void
    {
        $response = $this->http->request(
            'GET',
            '/api/order/refund/detail/' . $this->refund['order_id'],
            $this->ownerToken
        );

        self::assertSame(200, $response['http_status']);
        self::assertSame(200, $response['body']['status']);
        self::assertSame($this->refund['order_id'], $response['body']['data']['order_id']);
        self::assertSame($this->order['order_id'], $response['body']['data']['store_order_sn']);
        self::assertSame('13000000001', $response['body']['data']['user_phone']);
    }

    public function testOwnerCanSubmitRefundShipmentOnce(): void
    {
        $response = $this->http->request('POST', '/api/order/refund/express', $this->ownerToken, [
            'id' => $this->refund['id'],
            'refund_express' => 'REGRESSION-OWNER-EXPRESS',
            'refund_phone' => '13000000004',
            'refund_express_name' => 'Regression Express',
        ]);

        self::assertSame(200, $response['http_status']);
        self::assertSame(200, $response['body']['status']);
        self::assertSame('提交成功', $response['body']['msg']);
        $state = $this->refundState();
        self::assertSame(5, (int)$state['refund_type']);
        self::assertSame('REGRESSION-OWNER-EXPRESS', $state['refund_express']);
        self::assertSame('13000000004', $state['refund_phone']);
        self::assertSame(1, $this->refundStatusCount());
    }

    public function testExpiredTokenIsRejectedByProductionMiddleware(): void
    {
        $token = (new TestTokenFactory($this))->createExpired($this->attackerUid);
        $before = $this->orderState();

        $response = $this->http->request('GET', '/api/order/detail/' . $this->order['order_id'], $token);

        self::assertSame(200, $response['http_status']);
        self::assertSame(401, $response['body']['status']);
        self::assertSame('登录已过期,请重新登录', $response['body']['msg']);
        self::assertSame($before, $this->orderState());
    }

    private function assertNotFound(array $response): void
    {
        self::assertSame(200, $response['http_status']);
        self::assertSame(400, $response['body']['status']);
        self::assertSame('订单不存在', $response['body']['msg']);
        $serialized = json_encode($response['body'], JSON_UNESCAPED_UNICODE);
        self::assertStringNotContainsString('Regression Owner', $serialized);
        self::assertStringNotContainsString('13000000001', $serialized);
        self::assertStringNotContainsString('Regression Address', $serialized);
        self::assertStringNotContainsString($this->refund['order_id'], $serialized);
    }

    private function orderState(): array
    {
        return Db::name('store_order')->where('id', $this->order['id'])
            ->field('paid,status,is_cancel,is_del,refund_status')->find();
    }

    private function refundState(): array
    {
        return Db::name('store_order_refund')->where('id', $this->refund['id'])
            ->field('uid,refund_type,refund_phone,refund_express,refund_express_name,is_cancel,is_del')->find();
    }

    private function statusCount(): int
    {
        return (int)Db::name('store_order_status')->where('oid', $this->order['id'])->count();
    }

    private function refundStatusCount(): int
    {
        return (int)Db::name('store_order_status')->where('oid', $this->refund['id'])
            ->where('change_type', 'refund_express')->count();
    }
}
