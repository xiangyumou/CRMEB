<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;

use app\services\login\LoginThrottleGuard;
use app\services\login\UserPassword;
use crmeb\services\CacheService;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\HttpTestClient;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * `/api/login` 此前没有验证码、没有失败计数、也没有任何节流，任意顾客账号都可以
 * 被无限次试口令；同时前台用户的口令存的是无盐 MD5，而后台用的是 bcrypt。
 *
 * 这一组用例钉住两件事：
 *   1. 同一账号连续失败若干次之后会进入冷却，且判定发生在比对口令之前；
 *   2. 口令校验兼容历史的 MD5，并在一次成功登录之后就地升级成 bcrypt。
 *
 * 节流刻意只按账号维度：本站点跑在反向代理之后，应用看到的来源地址对所有访客是
 * 同一个，按来源限速会变成全站限速。
 */
final class StorefrontLoginSecurityTest extends RegressionTestCase
{
    const PASSWORD = 'correct-horse-9';

    /** @var HttpTestClient */
    private $http;
    /** @var FixtureFactory */
    private $fixtures;

    protected function setUp(): void
    {
        parent::setUp();
        $this->http = new HttpTestClient();
        $this->fixtures = new FixtureFactory($this, 'storefront-login');
    }

    /**
     * 历史账号：库里是无盐 MD5。用正确口令登录一次之后，库里应当变成 bcrypt，
     * 而且后续仍然能用同一个口令登录。
     */
    public function testALegacyMd5PasswordIsUpgradedToBcryptOnSuccessfulLogin(): void
    {
        $user = $this->newUser(md5(self::PASSWORD));
        self::assertTrue(UserPassword::isLegacyMd5($this->storedHash($user['uid'])), '夹具应当是历史 MD5');

        $first = $this->attempt($user['account'], self::PASSWORD);
        self::assertSame(200, $first['status'], '历史 MD5 口令必须仍然能登录：' . $first['msg']);

        $upgraded = $this->storedHash($user['uid']);
        self::assertFalse(UserPassword::isLegacyMd5($upgraded), '登录成功后应当已升级，不再是 MD5');
        self::assertStringStartsWith('$2y$', $upgraded, '升级后应当是 bcrypt');
        self::assertTrue(UserPassword::verify(self::PASSWORD, $upgraded), '升级后的哈希必须仍然匹配原口令');

        $second = $this->attempt($user['account'], self::PASSWORD);
        self::assertSame(200, $second['status'], '升级之后必须还能用同一个口令登录');
    }

    public function testAWrongPasswordIsStillRefusedForALegacyAccount(): void
    {
        $user = $this->newUser(md5(self::PASSWORD));
        $response = $this->attempt($user['account'], 'not-the-password');
        self::assertSame(400, $response['status']);
        self::assertTrue(
            UserPassword::isLegacyMd5($this->storedHash($user['uid'])),
            '登录失败不得改写库里的哈希'
        );
    }

    /**
     * 连续失败之后进入冷却，而且冷却的判定在比对口令之前——换一个候选口令，
     * 响应完全一样，所以这道闸不会泄露某个候选是否命中。
     */
    public function testRepeatedFailuresCoolTheAccountDownBeforeTheCredentialIsChecked(): void
    {
        $user = $this->newUser(UserPassword::hash(self::PASSWORD));

        for ($i = 0; $i < 5; $i++) {
            $refused = $this->attempt($user['account'], 'wrong-' . $i);
            self::assertSame(400, $refused['status']);
            self::assertSame('账号或密码错误', $refused['msg'], "第 {$i} 次应当是普通的口令错误");
        }

        $cooled = $this->attempt($user['account'], 'wrong-again');
        self::assertSame('登录失败次数过多，请稍后再试', $cooled['msg'], '连续失败之后应当进入冷却');

        // 正确口令此刻同样被挡下，证明判定在比对口令之前，而不是"错的才挡"。
        $correct = $this->attempt($user['account'], self::PASSWORD);
        self::assertSame('登录失败次数过多，请稍后再试', $correct['msg'], '冷却必须先于口令比对');
    }

    /**
     * 冷却只影响被攻击的那个账号，不会变成全站限速——这是只按账号维度计数的理由。
     */
    public function testTheCooldownDoesNotSpreadToOtherAccounts(): void
    {
        $victim = $this->newUser(UserPassword::hash(self::PASSWORD));
        $bystander = $this->newUser(UserPassword::hash(self::PASSWORD));

        for ($i = 0; $i < 6; $i++) {
            $this->attempt($victim['account'], 'wrong-' . $i);
        }
        self::assertSame('登录失败次数过多，请稍后再试', $this->attempt($victim['account'], 'wrong-final')['msg']);

        $other = $this->attempt($bystander['account'], self::PASSWORD);
        self::assertSame(200, $other['status'], '另一个账号不应当被连累：' . $other['msg']);
    }

    /**
     * 成功登录会清掉该账号的失败计数，否则攒够次数之后本人也会被自己的历史挡住。
     */
    public function testASuccessfulLoginClearsTheFailureCount(): void
    {
        $user = $this->newUser(UserPassword::hash(self::PASSWORD));
        for ($i = 0; $i < 3; $i++) {
            $this->attempt($user['account'], 'wrong-' . $i);
        }
        self::assertSame(200, $this->attempt($user['account'], self::PASSWORD)['status']);

        $guard = new LoginThrottleGuard('user');
        self::assertSame(0, $guard->accountFailures((string)$user['account']), '成功登录后计数应当归零');
    }

    /**
     * 部署顺序安全：代码先上、列还没加宽时，升级必须放弃而不是把用户锁死。
     *
     * `eb_user.pwd` 历史上是 varchar(32)，bcrypt 是 60 字符。回归栈的 MySQL 跑在
     * 非严格模式下（compose 里 sql-mode 只给了 ONLY_FULL_GROUP_BY 和
     * NO_ENGINE_SUBSTITUTION，把 STRICT_TRANS_TABLES 挤掉了），所以超长值是静默
     * 截断而不是报错——被截断的哈希永远验不过，等于永久锁死这个账号。
     *
     * 这条用例把列临时改回 varchar(32)，断言：登录照常成功，且库里留下的哈希
     * 仍然能验过原口令。
     */
    public function testAnUpgradeIsAbandonedWhenTheColumnCannotHoldABcryptHash(): void
    {
        $user = $this->newUser(md5(self::PASSWORD));
        $this->setPasswordColumnLength(32);

        $response = $this->attempt($user['account'], self::PASSWORD);
        self::assertSame(200, $response['status'], '列装不下时登录仍然必须成功：' . $response['msg']);

        $stored = $this->storedHash($user['uid']);
        self::assertTrue(
            UserPassword::verify(self::PASSWORD, $stored),
            '列装不下时留在库里的哈希必须仍然能验过原口令，否则这个账号被永久锁死'
        );

        // 列加宽之后，下一次登录才真正完成升级。
        $this->setPasswordColumnLength(255);
        self::assertSame(200, $this->attempt($user['account'], self::PASSWORD)['status']);
        $upgraded = $this->storedHash($user['uid']);
        self::assertStringStartsWith('$2y$', $upgraded, '列够宽之后应当升级成 bcrypt');
        self::assertTrue(UserPassword::verify(self::PASSWORD, $upgraded));
    }

    private function setPasswordColumnLength(int $length): void
    {
        $prefix = (string)config('database.connections.mysql.prefix');
        Db::execute("ALTER TABLE `{$prefix}user` MODIFY COLUMN `pwd` varchar({$length}) NOT NULL DEFAULT ''");
        $this->registerCleanup(static function () use ($prefix): void {
            Db::execute("ALTER TABLE `{$prefix}user` MODIFY COLUMN `pwd` varchar(255) NOT NULL DEFAULT ''");
        });
    }

    /**
     * 冷却必须有确定的上界，不能变成"谁都能把某个顾客永久锁出去"。
     *
     * 判定只看最近 `LoginController::LOGIN_COOLDOWN` 秒。若改成看整个 15 分钟计数
     * 窗口，攻击者每隔一会儿制造几次失败就能把计数一直顶在阈值之上，那个账号就
     * 再也登不进来了。
     *
     * 这里直接把失败时间戳写成"计数窗口之内、冷却窗口之外"，免得真的等上一分钟。
     */
    public function testTheCooldownExpiresInsteadOfLockingTheAccountIndefinitely(): void
    {
        $user = $this->newUser(UserPassword::hash(self::PASSWORD));

        // 10 次失败，但都发生在 5 分钟前：仍在 15 分钟计数窗口内，早已离开冷却窗口。
        $stale = time() - 300;
        CacheService::set(
            'user_login_fail_account_' . md5(strtolower(trim((string)$user['account']))),
            array_fill(0, 10, $stale),
            LoginThrottleGuard::WINDOW
        );

        $response = $this->attempt($user['account'], self::PASSWORD);
        self::assertSame(200, $response['status'], '旧的失败不该继续挡着登录：' . $response['msg']);
    }

    private function newUser(string $storedHash): array
    {
        $user = $this->fixtures->createUser(['pwd' => $storedHash]);
        $this->forgetThrottle((string)$user['account']);
        $this->registerCleanup(function () use ($user): void {
            $this->forgetThrottle((string)$user['account']);
        });
        return $user;
    }

    private function storedHash(int $uid): string
    {
        return (string)Db::name('user')->where('uid', $uid)->value('pwd');
    }

    private function forgetThrottle(string $account): void
    {
        CacheService::delete('user_login_fail_account_' . md5(strtolower(trim($account))));
    }

    /**
     * @return array{status:int,msg:string}
     */
    private function attempt(string $account, string $password): array
    {
        $response = $this->http->request('POST', '/api/login', null, [
            'account' => $account,
            'password' => $password,
        ]);
        $body = $response['body'];
        return [
            'status' => (int)($body['status'] ?? 0),
            'msg' => (string)($body['msg'] ?? ''),
        ];
    }
}
