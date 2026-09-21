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

use app\services\login\LoginThrottleGuard;

/**
 * 后台登录失败节流。
 *
 * 之前登录失败只是回给前端一个 `login_captcha` 标记，由前端决定要不要弹人机验证，
 * 服务端对没带验证码的请求照常受理，所以 `/adminapi/login` 可以被无限次爆破。
 * 这个类把"要不要验证"放回服务端。
 *
 * 计数机制在 `LoginThrottleGuard` 里，和前台登录共用；这里只固定 scope 并定义
 * "失败几次之后必须带人机验证"。
 *
 * 这里刻意没有"失败 N 次后直接拒绝"的硬锁，两个方向都行不通：本站点跑在反向代理
 * 之后，框架默认不信任转发头，应用看到的来源地址对所有访客是同一个，按来源锁会
 * 变成全局锁——任何人连续失败若干次就能把所有人挡在后台之外；按账号锁同样不行，
 * 站点只有一个管理员，谁都能用连续的错误口令把店主关在门外。人机验证没有这个
 * 副作用：它对自动化是实打实的成本，而本人随时可以自己通过。
 */
final class AdminLoginGuard extends LoginThrottleGuard
{
    /** 窗口内失败多少次后，登录必须附带通过的人机验证。 */
    const CAPTCHA_AFTER = 1;

    public function __construct()
    {
        parent::__construct('admin');
    }

    /**
     * 这次登录是否必须带上通过的人机验证。
     */
    public function captchaRequired(string $account, string $ip): bool
    {
        return $this->failures($account, $ip) >= self::CAPTCHA_AFTER;
    }
}
