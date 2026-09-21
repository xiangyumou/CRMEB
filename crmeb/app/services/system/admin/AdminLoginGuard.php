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

namespace app\services\system\admin;

use crmeb\services\CacheService;

/**
 * 后台登录失败节流。
 *
 * 之前登录失败只是回给前端一个 `login_captcha` 标记，由前端决定要不要弹人机验证，
 * 服务端对没带验证码的请求照常受理，所以 `/adminapi/login` 可以被无限次爆破。
 * 这个类把"要不要验证"和"还能不能继续试"放回服务端：
 *
 * - 账号维度的计数不可伪造，是主要依据；IP 维度只是补充，因为反向代理后的
 *   客户端地址可能来自可伪造的转发头。
 * - 缓存不可用时一律放行（失败开放）：宁可暂时失去节流，也不能因为 Redis 抖动
 *   把管理员挡在门外。
 */
final class AdminLoginGuard
{
    /** 滑动窗口长度（秒）。 */
    const WINDOW = 900;

    /** 窗口内失败多少次后，登录必须附带通过的人机验证。 */
    const CAPTCHA_AFTER = 1;

    /** 窗口内失败多少次后，连人机验证也不再受理。 */
    const LOCK_AFTER = 10;

    /** 单个键最多保留多少条失败时间戳，避免缓存值无限增长。 */
    const MAX_SAMPLES = 32;

    /**
     * 这次登录是否必须带上通过的人机验证。
     */
    public function captchaRequired(string $account, string $ip): bool
    {
        return $this->failures($account, $ip) >= self::CAPTCHA_AFTER;
    }

    /**
     * 距离解锁还有多少秒；0 表示未锁定。
     *
     * 硬锁只按来源 IP 计，不按账号：按账号锁意味着任何人都能用连续的错误口令
     * 把店主关在门外，对只有一个管理员的站点来说这个代价比爆破本身更大。
     * 账号维度只用来强制人机验证，本人随时可以自己通过。
     */
    public function lockedSeconds(string $account, string $ip): int
    {
        $key = $this->ipKey($ip);
        if ($key === '') return 0;
        $samples = $this->samples($key);
        if (count($samples) < self::LOCK_AFTER) return 0;
        // 锁定到第 LOCK_AFTER 次失败离开窗口为止：窗口内失败越多，解锁越晚。
        $oldest = $samples[count($samples) - self::LOCK_AFTER];
        return max(0, $oldest + self::WINDOW - time());
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
            CacheService::delete($key);
        }
    }

    /**
     * 窗口内失败次数，取账号与 IP 两个维度的较大值。
     */
    private function failures(string $account, string $ip): int
    {
        $count = 0;
        foreach ($this->keys($account, $ip) as $key) {
            $count = max($count, count($this->samples($key)));
        }
        return $count;
    }

    /**
     * @return string[]
     */
    private function keys(string $account, string $ip): array
    {
        $keys = [];
        $account = strtolower(trim($account));
        if ($account !== '') $keys[] = 'admin_login_fail_account_' . md5($account);
        $ipKey = $this->ipKey($ip);
        if ($ipKey !== '') $keys[] = $ipKey;
        return $keys;
    }

    private function ipKey(string $ip): string
    {
        $ip = trim($ip);
        return $ip === '' ? '' : 'admin_login_fail_ip_' . md5($ip);
    }

    /**
     * 读出仍在窗口内的失败时间戳，旧的直接丢弃。
     *
     * @return int[] 升序
     */
    private function samples(string $key): array
    {
        $stored = CacheService::get($key, []);
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
