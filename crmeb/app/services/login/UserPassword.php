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

/**
 * 前台用户口令的哈希与校验。
 *
 * 历史上前台用户的 `pwd` 存的是无盐 MD5（`md5($password)`），后台用的却是
 * bcrypt。无盐 MD5 对现代硬件基本等于明文：彩虹表直接命中，整库泄露即整库沦陷。
 *
 * 这里不做一次性的数据迁移——迁移需要明文，而我们没有。改成登录时就地升级：
 * 校验仍然接受历史的 MD5，一旦用正确口令登录成功，就用 bcrypt 重新写一遍。
 * 新注册、改密、重置一律直接写 bcrypt。随着用户陆续登录，MD5 会自然消失；
 * 没再登录过的账号保持原样，不影响使用。
 *
 * 判别方式看哈希本身的形状，不额外加列：bcrypt 是 `$2y$` 开头的 60 字符，
 * 历史 MD5 是 32 位十六进制，两者不会混淆。
 */
final class UserPassword
{
    /**
     * 生成新口令的哈希。
     */
    public static function hash(string $plain): string
    {
        return (string)password_hash($plain, PASSWORD_BCRYPT);
    }

    /**
     * 校验口令，同时兼容历史的无盐 MD5。
     */
    public static function verify(string $plain, string $stored): bool
    {
        if ($stored === '') return false;
        if (self::isLegacyMd5($stored)) {
            // hash_equals 而不是 ===：历史哈希的比较同样不该泄露时序。
            return hash_equals($stored, md5($plain));
        }
        return password_verify($plain, $stored);
    }

    /**
     * 这个哈希是否需要在登录成功后就地升级。
     */
    public static function needsUpgrade(string $stored): bool
    {
        if ($stored === '' || self::isLegacyMd5($stored)) return true;
        return password_needs_rehash($stored, PASSWORD_BCRYPT);
    }

    /**
     * 历史上的无盐 MD5：32 位十六进制。
     */
    public static function isLegacyMd5(string $stored): bool
    {
        return (bool)preg_match('/^[0-9a-f]{32}$/i', $stored);
    }
}
