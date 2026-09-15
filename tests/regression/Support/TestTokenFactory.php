<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

use crmeb\services\CacheService;
use crmeb\utils\JwtAuth;

final class TestTokenFactory
{
    /** @var RegressionTestCase */
    private $test;

    public function __construct(RegressionTestCase $test)
    {
        $this->test = $test;
    }

    public function create(int $uid, array $claims = []): string
    {
        $token = app()->make(JwtAuth::class)->createToken($uid, 'api', $claims)['token'];
        $this->test->registerCleanup(static function () use ($token): void {
            CacheService::delete(md5($token));
        });
        return $token;
    }

    public function createExpired(int $uid): string
    {
        $now = time();
        return $this->create($uid, [
            'iat' => $now - 180,
            'nbf' => $now - 180,
            'exp' => $now - 90,
        ]);
    }
}
