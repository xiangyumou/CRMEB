<?php
declare(strict_types=1);

header('Content-Type: application/json');
try {
    $settings = parse_ini_file('/var/www/crmeb/.env', true, INI_SCANNER_RAW);
    if (!is_array($settings)) {
        throw new RuntimeException('Missing settings');
    }
    $db = array_change_key_case($settings['DATABASE'] ?? [], CASE_LOWER);
    $redisConfig = array_change_key_case($settings['REDIS'] ?? [], CASE_LOWER);
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%s;dbname=%s', $db['hostname'], $db['hostport'], $db['database']),
        $db['username'],
        $db['password'],
        [PDO::ATTR_TIMEOUT => 2, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $pdo->query('SELECT 1');
    $redis = new Redis();
    if (!$redis->connect($redisConfig['redis_hostname'], (int) $redisConfig['port'], 2.0) ||
        ($redisConfig['redis_password'] !== '' && !$redis->auth($redisConfig['redis_password'])) ||
        !$redis->ping()) {
        throw new RuntimeException('Redis unavailable');
    }
    echo '{"ready":true}';
} catch (Throwable $error) {
    http_response_code(503);
    echo '{"ready":false}';
}
