<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

use app\services\system\admin\SystemAdminServices;
use crmeb\services\CacheService;

/**
 * Mint an admin token the way the login endpoint does: the token carries
 * `md5(<stored password hash>)` and is registered in the admin-tagged cache
 * that AdminAuthTokenMiddleware checks, so the HTTP layer accepts it.
 */
final class AdminTokenFactory
{
    /** @var RegressionTestCase */
    private $test;

    public function __construct(RegressionTestCase $test)
    {
        $this->test = $test;
    }

    /** @param string $passwordHash the `pwd` column of `eb_system_admin` */
    public function create(int $adminId, string $passwordHash): string
    {
        $token = app()->make(SystemAdminServices::class)->createToken($adminId, 'admin', $passwordHash)['token'];
        $this->test->registerCleanup(static function () use ($token): void {
            CacheService::delete(md5($token));
        });
        return $token;
    }
}
