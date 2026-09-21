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
 * 下面两组用例分别证明：真实 HTTP 上服务端自己会要求人机验证（失败一次之后，
 * 不带验证码的请求在比对口令之前就被挡下），以及持续失败的来源会被暂时锁定。
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

    public function testASustainedSourceIsLockedOutOverHttp(): void
    {
        // 失败计数只有在人机验证通过之后才累加，所以单靠 HTTP 打不满阈值。
        // 这里直接按被测栈会看到的来源地址播种，再打一次真实请求，验证那道闸确实在。
        /** @var AdminLoginGuard $guard */
        $guard = app()->make(AdminLoginGuard::class);
        $ip = (string)gethostbyname((string)gethostname());
        self::assertNotSame('', $ip, '拿不到本容器地址就无法播种');
        for ($i = 0; $i < AdminLoginGuard::LOCK_AFTER; $i++) {
            $guard->recordFailure(self::ACCOUNT, $ip);
        }
        $locked = $this->attempt('wrong-password-after-lock');
        self::assertStringContainsString('登录失败次数过多', $locked['msg'], '持续失败的来源应当被暂时锁定');
    }

    public function testTheGuardCountsWithinASlidingWindow(): void
    {
        /** @var AdminLoginGuard $guard */
        $guard = app()->make(AdminLoginGuard::class);
        $ip = '198.51.100.7';
        self::assertFalse($guard->captchaRequired(self::ACCOUNT, $ip));
        self::assertSame(0, $guard->lockedSeconds(self::ACCOUNT, $ip));

        $guard->recordFailure(self::ACCOUNT, $ip);
        self::assertTrue($guard->captchaRequired(self::ACCOUNT, $ip), '失败一次之后就要求人机验证');
        self::assertSame(0, $guard->lockedSeconds(self::ACCOUNT, $ip), '一次失败还不该锁定');

        for ($i = 1; $i < AdminLoginGuard::LOCK_AFTER; $i++) {
            $guard->recordFailure(self::ACCOUNT, $ip);
        }
        $locked = $guard->lockedSeconds(self::ACCOUNT, $ip);
        self::assertGreaterThan(0, $locked, '达到阈值的来源应当被锁定');
        self::assertLessThanOrEqual(AdminLoginGuard::WINDOW, $locked);

        $guard->clear(self::ACCOUNT, $ip);
        self::assertSame(0, $guard->lockedSeconds(self::ACCOUNT, $ip), '登录成功后应当清空');
        self::assertFalse($guard->captchaRequired(self::ACCOUNT, $ip));
    }

    public function testTheLockFollowsTheSourceAndNotTheAccount(): void
    {
        // 按账号硬锁意味着任何人都能用连续错误口令把店主关在门外，所以账号维度
        // 只强制人机验证，硬锁只看来源。
        /** @var AdminLoginGuard $guard */
        $guard = app()->make(AdminLoginGuard::class);
        for ($i = 0; $i < AdminLoginGuard::LOCK_AFTER + 2; $i++) {
            $guard->recordFailure(self::ACCOUNT, '198.51.100.8');
        }
        self::assertGreaterThan(0, $guard->lockedSeconds(self::ACCOUNT, '198.51.100.8'));
        self::assertSame(0, $guard->lockedSeconds(self::ACCOUNT, '203.0.113.9'), '店主从另一个地址仍然能登录');
        self::assertTrue($guard->captchaRequired(self::ACCOUNT, '203.0.113.9'), '但仍然要过人机验证');
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
        CacheService::delete('admin_login_fail_account_' . md5(self::ACCOUNT));
        $handler = \think\facade\Cache::store('redis')->handler();
        $prefix = (string)config('cache.stores.redis.prefix');
        foreach ((array)$handler->keys($prefix . 'admin_login_fail_ip_*') as $key) {
            $handler->del($key);
        }
    }
}
