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
 * 容器角色心跳。
 *
 * 键名固定为 crmeb:health:<role>，不经过缓存前缀，因此容器里的
 * docker/healthcheck.php 与 docker/ready.php 无需启动框架即可读取同一批键。
 * 心跳只写入角色自身存活与消费情况，不产生任何业务数据。
 */
class HealthHeartbeat
{
    /**
     * 键名前缀
     */
    public const PREFIX = 'crmeb:health:';

    /**
     * 键保留秒数，远大于写入间隔，避免容器重启瞬间读到空值
     */
    public const TTL = 900;

    /**
     * 解析键名
     * @param string $role
     * @return string
     */
    public static function key(string $role): string
    {
        return self::PREFIX . $role;
    }

    /**
     * 写入心跳，失败返回 false 而不抛异常：心跳只服务于健康检查，
     * 不允许因为 Redis 抖动打断定时任务、队列或长连接进程。
     * @param string $role
     * @param int|null $time
     * @return bool
     */
    public static function write(string $role, ?int $time = null): bool
    {
        try {
            $redis = self::connect();
            $redis->setex(self::key($role), self::TTL, (string)($time ?? time()));
            $redis->close();
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * 读取心跳时间戳，缺失或出错时返回 0
     * @param string $role
     * @return int
     */
    public static function read(string $role): int
    {
        try {
            $redis = self::connect();
            $value = $redis->get(self::key($role));
            $redis->close();
            return $value === false || $value === null ? 0 : (int)$value;
        } catch (\Throwable $e) {
            return 0;
        }
    }

    /**
     * 按 .env 里的 [REDIS] 段建立短连接
     * @return \Redis
     */
    protected static function connect(): \Redis
    {
        $host = (string)Env::get('redis.redis_hostname', '127.0.0.1');
        $port = (int)Env::get('redis.port', 6379);
        if ($host === '' || $port <= 0) {
            throw new \RuntimeException('redis host or port is not configured');
        }
        $redis = new \Redis();
        if (!$redis->connect($host, $port, 2.0)) {
            throw new \RuntimeException('redis connect failed');
        }
        $password = (string)Env::get('redis.redis_password', '');
        if ($password !== '') {
            $redis->auth($password);
        }
        $redis->select((int)Env::get('redis.select', 0));
        return $redis;
    }
}
