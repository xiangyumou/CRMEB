<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\api\middleware\AuthTokenMiddleware;
use app\Request;
use app\services\user\UserAuthServices;
use crmeb\exceptions\AuthException;
use Tests\Regression\Support\RegressionTestCase;

final class AuthorizationTest extends RegressionTestCase
{
    /**
     * @dataProvider authorizationHeaderProvider
     */
    public function testBothAuthorizationHeadersPopulateAuthenticatedRequest(string $header): void
    {
        $auth = $this->authService();
        $user = new class { public $uid = 42; };
        $auth->expects(self::once())->method('parseToken')->with('token-42')->willReturn([
            'user' => $user,
            'tokenData' => ['uid' => 42],
        ]);
        $this->replace(UserAuthServices::class, $auth);
        $request = (new Request())->withHeader([$header => 'Bearer token-42']);

        $result = (new AuthTokenMiddleware())->handle($request, static function (Request $authenticated) use ($user) {
            self::assertTrue($authenticated->isLogin());
            self::assertSame(42, $authenticated->uid());
            self::assertSame($user, $authenticated->user());
            self::assertSame(['uid' => 42], $authenticated->tokenData());
            return 'next';
        });

        self::assertSame('next', $result);
    }

    public function testOptionalAuthenticationFailureContinuesAsAnonymous(): void
    {
        $auth = $this->authService();
        $auth->method('parseToken')->willThrowException(new AuthException('请登录', [], 401));
        $this->replace(UserAuthServices::class, $auth);
        $request = (new Request())->withHeader(['Authorization' => 'Bearer expired']);

        $result = (new AuthTokenMiddleware())->handle($request, static function (Request $anonymous) {
            self::assertFalse($anonymous->isLogin());
            self::assertSame(0, $anonymous->uid());
            return 'anonymous';
        }, false);

        self::assertSame('anonymous', $result);
    }

    public function authorizationHeaderProvider(): array
    {
        return [
            'standard' => ['Authorization'],
            'legacy compatibility' => ['Authori-zation'],
        ];
    }

    private function authService(): UserAuthServices
    {
        return $this->getMockBuilder(UserAuthServices::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['parseToken'])
            ->getMock();
    }
}
