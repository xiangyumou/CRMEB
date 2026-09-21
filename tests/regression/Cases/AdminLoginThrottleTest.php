<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;

use app\services\system\admin\AdminLoginGuard;
use crmeb\services\CacheService;
use Tests\Regression\Support\HttpTestClient;
use Tests\Regression\Support\RegressionTestCase;

/**
 * `/adminapi/login` 以前只是在响应里回一个 `login_captcha` 标记，验证码送不送由前端决定，
 * 服务端对不带验证码的请求照常受理，因此口令可以被无限次试。
 *
 * 下面的用例证明：真实 HTTP 上服务端自己会要求人机验证（失败一次之后，不带验证码
 * 的请求在比对口令之前就被挡下），且这道闸不会退化成把所有人挡在门外的全局锁——
 * 站点跑在反向代理之后，应用看到的来源地址对所有访客是同一个。
 */
final class AdminLoginThrottleTest extends RegressionTestCase
{
    const ACCOUNT = 'no-such-admin';

    /** @var HttpTestClient */
    private $http;

    protected function setUp(): void
    {
        parent::setUp();
        $this->http = new HttpTestClient();
        $this->forgetThrottleState();
        $this->registerCleanup(function (): void {
            $this->forgetThrottleState();
        });
    }

    public function testASecondAttemptWithoutCaptchaIsRefusedBeforeTheCredentialIsChecked(): void
    {
        $first = $this->attempt('wrong-password-1');
        self::assertSame(400, $first['status'], '第一次错误口令应当被拒绝');
        self::assertSame('账号或密码错误', $first['msg']);
        self::assertSame(1, $first['data']['login_captcha'] ?? null, '失败后应当要求前端出示人机验证');

        $second = $this->attempt('wrong-password-2');
        self::assertSame(400, $second['status']);
        self::assertSame('请先完成安全验证', $second['msg'], '第二次起必须先过人机验证，不能直接拿去比口令');
        self::assertSame(1, $second['data']['login_captcha'] ?? null);
    }

    public function testTheRefusalDoesNotDependOnTheCandidatePassword(): void
    {
        $this->attempt('wrong-password-1');
        // 换一个不同的候选口令，响应必须完全一样：这条闸在比对口令之前，
        // 所以它不会泄露某个候选是否命中。
        foreach (['another-candidate', 'yet-another-candidate'] as $candidate) {
            $refused = $this->attempt($candidate);
            self::assertSame('请先完成安全验证', $refused['msg']);
        }
    }

    public function testAFailedCaptchaIsNotAcceptedAsAVerifiedOne(): void
    {
        $this->attempt('wrong-password-1');
        $forged = $this->attempt('wrong-password-2', 'forged-captcha-token');
        self::assertSame('验证码错误', $forged['msg'], '伪造的验证码不能当成通过的验证');
    }

    public function testManyFailuresNeverRefuseALaterAttemptOutright(): void
    {
        // 生产跑在反向代理之后，应用看到的来源地址对所有访客是同一个。任何"失败
        // N 次后直接拒绝"的闸在这里都会变成全局锁，所以持续失败之后，后来的请求
        // 仍然必须能走到人机验证那一步，而不是被直接挡回。
        /** @var AdminLoginGuard $guard */
        $guard = app()->make(AdminLoginGuard::class);
        $shared = (string)gethostbyname((string)gethostname());
        for ($i = 0; $i < 30; $i++) {
            $guard->recordFailure('someone-else', $shared);
        }
        $response = $this->attempt('wrong-password-after-many-failures');
        self::assertSame('请先完成安全验证', $response['msg'], '只应当要求验证，不应当直接拒绝');
        self::assertSame(1, $response['data']['login_captcha'] ?? null);
        $guard->clear('someone-else', $shared);
    }

    public function testTheGuardCountsWithinASlidingWindow(): void
    {
        /** @var AdminLoginGuard $guard */
        $guard = app()->make(AdminLoginGuard::class);
        $ip = '198.51.100.7';
        self::assertFalse($guard->captchaRequired(self::ACCOUNT, $ip));

        $guard->recordFailure(self::ACCOUNT, $ip);
        self::assertTrue($guard->captchaRequired(self::ACCOUNT, $ip), '失败一次之后就要求人机验证');

        $guard->clear(self::ACCOUNT, $ip);
        self::assertFalse($guard->captchaRequired(self::ACCOUNT, $ip), '登录成功后应当清空');
    }

    public function testTheCaptchaRequirementFollowsTheAccountToo(): void
    {
        // 账号维度不可伪造：换一个来源地址仍然要过验证。
        /** @var AdminLoginGuard $guard */
        $guard = app()->make(AdminLoginGuard::class);
        $guard->recordFailure(self::ACCOUNT, '198.51.100.8');
        self::assertTrue($guard->captchaRequired(self::ACCOUNT, '203.0.113.9'));
        self::assertFalse($guard->captchaRequired('a-different-account', '203.0.113.9'));
        $guard->clear(self::ACCOUNT, '198.51.100.8');
        $guard->clear(self::ACCOUNT, '203.0.113.9');
    }

    /**
     * @return array{status:int,msg:string,data:array}
     */
    private function attempt(string $password, string $captchaVerification = ''): array
    {
        $body = ['account' => self::ACCOUNT, 'pwd' => $password, 'captchaType' => 'blockPuzzle'];
        if ($captchaVerification !== '') $body['captchaVerification'] = $captchaVerification;
        $response = $this->http->request('POST', '/adminapi/login', null, $body);
        $decoded = $response['body'];
        self::assertIsArray($decoded, 'login 接口应当返回 JSON');
        return [
            'status' => (int)($decoded['status'] ?? 0),
            'msg' => (string)($decoded['msg'] ?? ''),
            'data' => is_array($decoded['data'] ?? null) ? $decoded['data'] : [],
        ];
    }

    /**
     * 计数保存在被测进程的缓存里。账号键可以直接算出来；IP 键取决于被测栈看到的
     * 来源地址，测试进程不知道那个地址，所以按前缀清。
     */
    private function forgetThrottleState(): void
    {
        foreach ([self::ACCOUNT, 'someone-else', 'a-different-account'] as $account) {
            CacheService::delete('admin_login_fail_account_' . md5($account));
        }
        $handler = \think\facade\Cache::store('redis')->handler();
        $prefix = (string)config('cache.stores.redis.prefix');
        foreach ((array)$handler->keys($prefix . 'admin_login_fail_ip_*') as $key) {
            $handler->del($key);
        }
    }
}
