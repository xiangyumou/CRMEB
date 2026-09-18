<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\CoreStore;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\HttpTestClient;
use Tests\Regression\Support\RegressionTestCase;
use Tests\Regression\Support\TestTokenFactory;
use think\facade\Db;

/**
 * Admin order alerts and mobile order management used to read the retired
 * customer-service roster. They now read the order_notice_admin_uids setting,
 * which the migration fills from the service rows it renames away. The second
 * half is an access-control boundary, so it is exercised over HTTP.
 */
final class OrderNoticeRosterTest extends RegressionTestCase
{
    /** @var HttpTestClient */
    private $http;

    protected function setUp(): void
    {
        parent::setUp();
        $this->http = new HttpTestClient();
    }

    private function setRoster(array $uids): void
    {
        $row = Db::name('system_config')->where('menu_name', CoreStore::ORDER_ADMIN_CONFIG)->find();
        self::assertNotEmpty($row, 'the install SQL must seed ' . CoreStore::ORDER_ADMIN_CONFIG);
        // sys_config() reads through a cache, so drop the entry with the update.
        $cacheKey = \crmeb\services\SystemConfigService::CACHE_SYSTEM . '_' . CoreStore::ORDER_ADMIN_CONFIG;
        \crmeb\services\CacheService::delete($cacheKey);
        Db::name('system_config')->where('id', $row['id'])->update(['value' => json_encode(implode(',', $uids))]);
        $this->registerCleanup(function () use ($row, $cacheKey) {
            \crmeb\services\CacheService::delete($cacheKey);
            Db::name('system_config')->where('id', $row['id'])->update(['value' => $row['value']]);
        });
    }

    public function testRosterParsesDistinctPositiveUids(): void
    {
        $this->setRoster([7, 7, 0, -3, 12]);
        self::assertSame([7, 12], CoreStore::orderAdminUids());

        $this->setRoster([]);
        self::assertSame([], CoreStore::orderAdminUids());
    }

    public function testRecipientsComeFromTheRoster(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $listed = $fixtures->createUser(['nickname' => '订单通知管理员', 'phone' => '13700000001']);
        $other = $fixtures->createUser(['nickname' => '普通用户']);
        $this->setRoster([$listed['uid']]);

        $recipients = CoreStore::orderNoticeRecipients();
        $uids = array_column($recipients, 'uid');
        self::assertContains($listed['uid'], $uids);
        self::assertNotContains($other['uid'], $uids);
        $entry = $recipients[array_search($listed['uid'], $uids, true)];
        self::assertSame('订单通知管理员', $entry['nickname']);
        self::assertSame('13700000001', $entry['phone']);
    }

    /**
     * The roster is what decides who is told about a new order: driving the real
     * notification listener writes an in-site message for every listed
     * administrator and nobody else. (The SMS and WeChat legs of the same
     * listener fail offline and are swallowed by their senders.)
     */
    public function testNewOrderNoticeReachesExactlyTheRoster(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $listed = $fixtures->createUser(['nickname' => '订单通知管理员', 'phone' => '13700000001']);
        $stranger = $fixtures->createUser(['nickname' => '普通用户']);
        $this->setRoster([$listed['uid']]);
        $this->registerCleanup(function () use ($fixtures) {
            Db::name('message_system')->where('type', 2)->delete();
        });

        $order = $fixtures->createOrder($listed['uid'], ['paid' => 1, 'pay_time' => time()]);
        (new \app\listener\notice\NoticeListener())->handle([
            $order, 'admin_pay_success_code',
        ]);

        $notices = Db::name('message_system')->where('title', '您有新的订单待处理')->column('uid');
        self::assertContains((int)$listed['uid'], $notices, 'the listed administrator is notified');
        self::assertNotContains((int)$stranger['uid'], $notices, 'nobody outside the roster is notified');
    }

    public function testMobileOrderManagementFollowsTheRoster(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $operator = $fixtures->createUser();
        $stranger = $fixtures->createUser();
        $tokens = new TestTokenFactory($this);

        $this->setRoster([$operator['uid']]);
        $allowed = $this->http->request('GET', '/api/admin/manage/statistics', $tokens->create($operator['uid']));
        self::assertSame(200, $allowed['http_status']);
        self::assertNotSame(400, $allowed['body']['status'], 'a listed administrator must pass the gate: ' . json_encode($allowed['body'], JSON_UNESCAPED_UNICODE));

        $denied = $this->http->request('GET', '/api/admin/manage/statistics', $tokens->create($stranger['uid']));
        self::assertSame(200, $denied['http_status']);
        self::assertSame(400, $denied['body']['status']);
        self::assertSame('权限不足', $denied['body']['msg']);
    }

    public function testMobileOrderManagementIsClosedWhileTheRosterIsEmpty(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $this->setRoster([]);

        $response = $this->http->request('GET', '/api/admin/manage/statistics', (new TestTokenFactory($this))->create($user['uid']));
        self::assertSame(400, $response['body']['status']);
        self::assertSame('权限不足', $response['body']['msg']);
    }
}
