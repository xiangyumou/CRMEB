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

namespace crmeb\utils;

use think\facade\Env;

/**
 * JWT 的签名密钥。
 *
 * 原先四处都写成 `Env::get('app.app_key', 'default')`：`.env` 里没配 APP_KEY 时，
 * 令牌就用字符串 `default` 签名——那个值印在公开的上游源码里，等于任何人都能伪造
 * 任意用户和管理员的令牌。生产环境 2026-09-21 才发现并补上随机值，但兜底本身留着，
 * 下一个部署照样会踩。
 *
 * 这里不再提供兜底：读不到可用的 APP_KEY 就抛异常，让它在签发/校验令牌时响亮地
 * 失败，而不是静默降级成一个人人都知道的密钥。已知的弱值同样拒绝。
 */
final class SigningKey
{
    /** 历史上出现过的、公开可知的弱密钥。 */
    const KNOWN_WEAK = ['default', 'crmeb'];

    /** 低于这个长度不足以作为 HMAC 密钥。 */
    const MIN_LENGTH = 16;

    /**
     * @throws \RuntimeException 没有配置可用的 APP_KEY
     */
    public static function get(): string
    {
        $key = (string)Env::get('app.app_key', '');
        self::assertUsable($key);
        return $key;
    }

    /**
     * 密钥是否可用。`/readyz` 用它，好在流量进来之前就发现问题。
     */
    public static function isUsable(string $key): bool
    {
        if (strlen($key) < self::MIN_LENGTH) return false;
        foreach (self::KNOWN_WEAK as $weak) {
            if (strcasecmp($key, $weak) === 0) return false;
        }
        return true;
    }

    private static function assertUsable(string $key): void
    {
        if ($key === '') {
            throw new \RuntimeException(
                'APP_KEY is not configured: refusing to sign tokens with a fallback key.'
            );
        }
        if (!self::isUsable($key)) {
            throw new \RuntimeException(
                'APP_KEY is a known weak or too short value: refusing to sign tokens with it.'
            );
        }
    }
}
