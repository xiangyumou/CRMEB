<?php
// +----------------------------------------------------------------------
// | CRMEB [ CRMEB赋能开发者，助力企业发展 ]
// +----------------------------------------------------------------------
// | Copyright (c) 2016~2026 https://www.crmeb.com All rights reserved.
// +----------------------------------------------------------------------
// | Licensed CRMEB并不是自由软件，未经许可不能去掉CRMEB相关版权
// +----------------------------------------------------------------------
// | Author: CRMEB Team <admin@crmeb.com>
// +----------------------------------------------------------------------

namespace app\services\login;

use crmeb\services\CacheService;

/**
 * 登录失败的滑动窗口计数，后台与前台共用一套机制，按 scope 分开存放。
 *
 * 账号维度的计数不可伪造，是主要依据；IP 维度只是补充，因为本站点跑在反向代理
 * 之后、框架默认不信任转发头，应用看到的来源地址对所有访客是同一个。
 *
 * 缓存不可用时一律放行（失败开放）：宁可暂时失去节流，也不能因为 Redis 抖动把人
 * 挡在门外。注意 `CacheService::get()` 与 `delete()` 自己不吞异常（只有 `set`、
 * `remember`、`has` 包了 try/catch），所以兜底必须写在这里——否则缓存一挂，
 * 登录接口直接 500，正好是"失败开放"要避免的那个结果。
 */
class LoginThrottleGuard
{
    /** 滑动窗口长度（秒）。 */
    const WINDOW = 900;

    /** 单个键最多保留多少条失败时间戳，避免缓存值无限增长。 */
    const MAX_SAMPLES = 32;

    /** @var string 计数命名空间，隔开后台与前台。 */
    protected $scope;

    public function __construct(string $scope = 'admin')
    {
        $this->scope = $scope;
    }

    /**
     * 窗口内失败次数，取账号与 IP 两个维度的较大值。
     */
    public function failures(string $account, string $ip): int
    {
        $count = 0;
        foreach ($this->keys($account, $ip) as $key) {
            $count = max($count, count($this->samples($key)));
        }
        return $count;
    }

    /**
     * 只按账号维度计数。前台用它：来源地址在代理后面是共享的，按来源节流会变成
     * 全站限速，而账号维度既不可伪造、影响面也只限于这一个账号。
     */
    public function accountFailures(string $account): int
    {
        $key = $this->accountKey($account);
        return $key === '' ? 0 : count($this->samples($key));
    }

    /**
     * 最近 $seconds 秒内该账号的失败次数。
     *
     * 前台的冷却判定用这个而不是整个窗口：按整个 15 分钟窗口算，任何人都能靠持续
     * 制造失败把某个顾客账号**无限期**锁在门外（每次失败都会把计数顶回阈值之上）。
     * 只看最近几十秒，冷却就有确定的上界——攻击者最多把爆破速率压到"每 $seconds
     * 秒 N 次"，这正是我们想要的效果，而顾客最多等这么久。
     */
    public function accountFailuresWithin(string $account, int $seconds): int
    {
        $key = $this->accountKey($account);
        if ($key === '') return 0;
        $since = time() - max(1, $seconds);
        $recent = 0;
        foreach ($this->samples($key) as $timestamp) {
            if ($timestamp > $since) $recent++;
        }
        return $recent;
    }

    /**
     * 记一次失败。账号和 IP 两个维度分开累计。
     */
    public function recordFailure(string $account, string $ip): void
    {
        foreach ($this->keys($account, $ip) as $key) {
            $samples = $this->samples($key);
            $samples[] = time();
            if (count($samples) > self::MAX_SAMPLES) {
                $samples = array_slice($samples, -self::MAX_SAMPLES);
            }
            CacheService::set($key, $samples, self::WINDOW);
        }
    }

    /**
     * 登录成功后清空该账号与该 IP 的失败记录。
     */
    public function clear(string $account, string $ip): void
    {
        foreach ($this->keys($account, $ip) as $key) {
            try {
                CacheService::delete($key);
            } catch (\Throwable $e) {
                // 缓存不可用时清不掉计数是可接受的：窗口本身会过期。
            }
        }
    }

    /**
     * @return string[]
     */
    protected function keys(string $account, string $ip): array
    {
        $keys = [];
        $accountKey = $this->accountKey($account);
        if ($accountKey !== '') $keys[] = $accountKey;
        $ipKey = $this->ipKey($ip);
        if ($ipKey !== '') $keys[] = $ipKey;
        return $keys;
    }

    protected function accountKey(string $account): string
    {
        $account = strtolower(trim($account));
        return $account === '' ? '' : $this->scope . '_login_fail_account_' . md5($account);
    }

    protected function ipKey(string $ip): string
    {
        $ip = trim($ip);
        return $ip === '' ? '' : $this->scope . '_login_fail_ip_' . md5($ip);
    }

    /**
     * 读出仍在窗口内的失败时间戳，旧的直接丢弃。
     *
     * 缓存后端不可用时返回空数组，也就是"没有失败记录"——节流暂时失效，但登录
     * 接口不会因此抛异常。
     *
     * @return int[] 升序
     */
    protected function samples(string $key): array
    {
        try {
            $stored = CacheService::get($key, []);
        } catch (\Throwable $e) {
            return [];
        }
        if (!is_array($stored)) return [];
        $since = time() - self::WINDOW;
        $samples = [];
        foreach ($stored as $timestamp) {
            if (is_numeric($timestamp) && (int)$timestamp > $since) $samples[] = (int)$timestamp;
        }
        sort($samples);
        return $samples;
    }
}
