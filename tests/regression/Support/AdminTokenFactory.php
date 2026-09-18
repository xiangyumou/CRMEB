<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

use crmeb\services\CacheService;
use crmeb\utils\JwtAuth;

/**
 * Mint an admin token the same way the login endpoint does: the JWT carries the
 * hashed password, and the token is registered in the admin-tagged cache that
 * AdminAuthTokenMiddleware checks.
 */
final class AdminTokenFactory
{
    /** @var RegressionTestCase */
    private $test;

    public function __construct(RegressionTestCase $test)
    {
        $this->test = $test;
    }

    public function create(int $adminId, string $password): string
    {
        $token = app()->make(JwtAuth::class)->createToken($adminId, 'admin', ['pwd' => md5($password)])['token'];
        $this->test->registerCleanup(static function () use ($token): void {
            CacheService::delete(md5($token));
        });
        return $token;
    }
}
