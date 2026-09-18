<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\diy\DiyCompatibilityServices;
use app\services\system\SystemClearServices;
use crmeb\exceptions\AdminException;
use Tests\Regression\Support\AdminTokenFactory;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\HttpTestClient;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * "Clear data" and "replace site url" listed tables of retired features. After
 * the migration those tables are gone, so the first statement failed and the
 * transaction rolled back — the whole maintenance page could do nothing — or,
 * worse, a partial run left the database half cleared. The lists now hold only
 * tables that exist, missing ones are skipped, and every retained media column
 * is still rewritten.
 */
final class SystemClearServicesTest extends RegressionTestCase
{
    /** @var HttpTestClient */
    private $http;

    /** @var array{id: int, account: string, pwd: string} pwd is the stored hash */
    private $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->http = new HttpTestClient();
        $row = Db::name('system_admin')->order('id')->find();
        self::assertNotEmpty($row, 'the install SQL must seed an administrator');
        $this->admin = ['id' => (int)$row['id'], 'account' => (string)$row['account'], 'pwd' => (string)$row['pwd']];
    }

    private function adminToken(): string
    {
        return (new AdminTokenFactory($this))->create($this->admin['id'], $this->admin['pwd']);
    }

    /** The maintenance endpoints the admin page calls must answer 200, not 500. */
    public function testMaintenanceEndpointsSucceedOverHttp(): void
    {
        $token = $this->adminToken();

        // `system` used to clear `system_notice_admin`, a table the migration
        // renames away: the statement failed and the endpoint returned an error.
        $cleared = $this->http->request('GET', '/adminapi/system/clear/system', $token, [], $this->adminHeaders($token));
        self::assertSame(200, $cleared['http_status']);
        self::assertSame(200, $cleared['body']['status'], json_encode($cleared['body'], JSON_UNESCAPED_UNICODE));

        // Replacing the site url with itself rewrites the retained media columns
        // to the same values: the path runs end to end without touching data.
        $siteUrl = $this->useTestSiteUrl();
        $replaced = $this->http->request('POST', '/adminapi/system/replace_site_url', $token, ['url' => $siteUrl], $this->adminHeaders($token));
        self::assertSame(200, $replaced['http_status']);
        self::assertSame(200, $replaced['body']['status'], json_encode($replaced['body'], JSON_UNESCAPED_UNICODE));
    }

    /**
     * The personal-centre menu list is served to the client as navigation. A
     * saved row pointing at a page the storefront no longer ships would open a
     * blank screen, so it is filtered out on the way out.
     */
    public function testPersonalMenuSkipsPagesThatNoLongerExist(): void
    {
        $groupId = (int)Db::name('system_group')->where('config_name', 'routine_my_menus')->value('id');
        self::assertGreaterThan(0, $groupId, 'the install SQL must seed the personal menu group');
        $row = Db::name('system_group_data')->where('gid', $groupId)->order('id')->find();
        self::assertNotEmpty($row);

        $removed = 'pages/users/user_money/index';
        self::assertContains($removed, DiyCompatibilityServices::removedPages());
        $value = json_decode((string)$row['value'], true);
        $value['url']['value'] = '/' . $removed;
        $cacheKey = 'data_routine_my_menus';
        \crmeb\services\CacheService::delete($cacheKey);
        Db::name('system_group_data')->where('id', $row['id'])->update(['value' => json_encode($value)]);
        $this->registerCleanup(function () use ($row, $cacheKey) {
            \crmeb\services\CacheService::delete($cacheKey);
            Db::name('system_group_data')->where('id', $row['id'])->update(['value' => $row['value']]);
        });

        $token = $this->adminToken();
        $response = $this->http->request('GET', '/api/menu/user', $token, [], $this->adminHeaders($token));
        self::assertSame(200, $response['http_status']);
        $urls = array_column($response['body']['data']['routine_my_menus'] ?? [], 'url');
        self::assertNotContains('/' . $removed, $urls, 'a removed page must not be handed to the client');
    }

    /** adminapi reads `Authori-zation` (cookie.token_name), not `Authorization`. */
    private function adminHeaders(string $token): array
    {
        return ['Authori-zation' => 'Bearer ' . $token];
    }

    /** A syntactically valid site url for the domain-replacement endpoints. */
    private function useTestSiteUrl(): string
    {
        $url = 'https://' . bin2hex(random_bytes(4)) . '.example.test';
        $row = Db::name('system_config')->where('menu_name', 'site_url')->find();
        self::assertNotEmpty($row, 'the install SQL must seed site_url');
        $cacheKey = \crmeb\services\SystemConfigService::CACHE_SYSTEM . '_site_url';
        \crmeb\services\CacheService::delete($cacheKey);
        Db::name('system_config')->where('id', $row['id'])->update(['value' => json_encode($url)]);
        $this->registerCleanup(function () use ($row, $cacheKey) {
            \crmeb\services\CacheService::delete($cacheKey);
            Db::name('system_config')->where('id', $row['id'])->update(['value' => $row['value']]);
        });
        return $url;
    }

    public function testDomainReplacementRewritesRetainedMediaColumns(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $product = $fixtures->createProduct();

        $column = $this->firstImageColumn();
        self::assertNotNull($column, 'store_product must hold an image column');
        $before = Db::name('store_product')->where('id', $product['id'])->value($column);
        $old = 'https://' . bin2hex(random_bytes(4)) . '.example.test';
        $new = 'https://' . bin2hex(random_bytes(4)) . '.example.test';
        Db::name('store_product')->where('id', $product['id'])->update([$column => $old . '/uploads/a.png']);
        $this->registerCleanup(function () use ($product, $column, $before) {
            Db::name('store_product')->where('id', $product['id'])->update([$column => $before]);
        });

        $services = app()->make(SystemClearServices::class);
        $services->replaceSiteUrl($new, $old);

        self::assertSame(
            $new . '/uploads/a.png',
            Db::name('store_product')->where('id', $product['id'])->value($column),
            'the retained product image must be rewritten to the new domain'
        );
    }

    /**
     * The list used to name `store_seckill`, `user_extract` and friends. The
     * migration renames them away, so clearing must not depend on them existing.
     */
    public function testClearDataSkipsTablesThatNoLongerExist(): void
    {
        $services = app()->make(SystemClearServices::class);
        $report = $services->clearData(['store_seckill', 'agent_level', 'store_cart'], true);

        self::assertContains('store_seckill', $report['missing']);
        self::assertContains('agent_level', $report['missing']);
        self::assertContains('store_cart', $report['cleared']);
        self::assertSame([], $report['failed']);
    }

    public function testClearDataRejectsAnUnsafeTableName(): void
    {
        $services = app()->make(SystemClearServices::class);
        $this->expectException(AdminException::class);
        $services->clearData(['user`; DROP TABLE eb_user; --'], true);
    }

    /** Clearing the order data must actually empty the retained order tables. */
    public function testOrderDataClearsTheRetainedOrderTables(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $uid = $fixtures->createUser()['uid'];
        $order = $fixtures->createOrder($uid);
        $this->registerCleanup(function () use ($order) {
            Db::name('store_order')->where('id', $order['id'])->delete();
        });

        $services = app()->make(SystemClearServices::class);
        $services->clearData(['store_order', 'store_order_status'], true);

        self::assertSame(0, (int)Db::name('store_order')->where('id', $order['id'])->count());
    }

    /** The column the fixture product stores its image in. */
    private function firstImageColumn(): ?string
    {
        foreach (Db::query('SHOW COLUMNS FROM eb_store_product') as $column) {
            if ($column['Field'] === 'image') return 'image';
        }
        return null;
    }
}