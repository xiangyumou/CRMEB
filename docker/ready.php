<?php
/**
 * Container readiness endpoint, served to `GET /readyz`.
 *
 * `up --wait` and the container healthchecks treat a 200 here as "this release
 * is actually usable", so the check has to be deeper than a database ping:
 *
 *   1. the application was installed (public/install.lock);
 *   2. MySQL and Redis answer;
 *   3. the retained business tables exist;
 *   4. the order reliability schema this release requires is present, which is
 *      the migration signal an older database is missing;
 *   5. the settings table is populated, so an empty database cannot pass.
 *
 * Any failure returns 503 with a generic body; the reason is written to stderr
 * so it lands in the container logs instead of on the public endpoint.
 */
declare(strict_types=1);

header('Content-Type: application/json');
header('Cache-Control: no-store');

/** Tables every retained feature reads from. */
const READY_REQUIRED_TABLES = [
    'system_config',
    'system_admin',
    'user',
    'store_product',
    'store_order',
    'store_order_status',
    'store_cart',
    'store_coupon_issue',
    'store_coupon_user',
    'store_order_refund',
    'store_order_payment_attempt',
    'store_order_effect',
];

/** Columns added by the order reliability migration on tables that already exist. */
const READY_REQUIRED_COLUMNS = [
    'store_order_refund' => ['out_refund_no', 'refund_request'],
];

/**
 * Prove the schema the retained features need is really there.
 */
function readyCheckSchema(PDO $pdo, string $prefix): void
{
    $tables = [];
    foreach ($pdo->query('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $tables[strtolower((string)$row['name'])] = true;
    }
    $missing = [];
    foreach (READY_REQUIRED_TABLES as $table) {
        if (!isset($tables[strtolower($prefix . $table)])) {
            $missing[] = $prefix . $table;
        }
    }
    if ($missing) {
        throw new RuntimeException('missing tables: ' . implode(', ', $missing));
    }

    $columns = [];
    foreach ($pdo->query('SELECT TABLE_NAME AS name, COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()')->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $columns[strtolower((string)$row['name'] . '.' . (string)$row['column_name'])] = true;
    }
    $missing = [];
    foreach (READY_REQUIRED_COLUMNS as $table => $names) {
        foreach ($names as $name) {
            if (!isset($columns[strtolower($prefix . $table . '.' . $name)])) {
                $missing[] = $prefix . $table . '.' . $name;
            }
        }
    }
    if ($missing) {
        throw new RuntimeException('missing columns: ' . implode(', ', $missing));
    }

    $total = (int)$pdo->query('SELECT COUNT(*) FROM `' . $prefix . 'system_config`')->fetchColumn();
    if ($total < 1) {
        throw new RuntimeException('the settings table is empty');
    }
}

try {
    $settings = parse_ini_file('/var/www/crmeb/.env', true, INI_SCANNER_RAW);
    if (!is_array($settings)) {
        throw new RuntimeException('missing settings');
    }
    $db = array_change_key_case($settings['DATABASE'] ?? [], CASE_LOWER);
    $redisConfig = array_change_key_case($settings['REDIS'] ?? [], CASE_LOWER);
    $prefix = preg_replace('/[^A-Za-z0-9_]/', '', (string)($db['prefix'] ?? ''));
    if ($prefix === '') {
        throw new RuntimeException('the table prefix is missing');
    }
    if (!is_file('/var/www/crmeb/public/install.lock')) {
        throw new RuntimeException('the application is not installed');
    }

    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%s;dbname=%s', $db['hostname'], $db['hostport'], $db['database']),
        $db['username'],
        $db['password'],
        [PDO::ATTR_TIMEOUT => 2, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    $pdo->query('SELECT 1');
    readyCheckSchema($pdo, $prefix);

    $redis = new Redis();
    if (!$redis->connect($redisConfig['redis_hostname'], (int)$redisConfig['port'], 2.0) ||
        ($redisConfig['redis_password'] !== '' && !$redis->auth($redisConfig['redis_password'])) ||
        !$redis->ping()) {
        throw new RuntimeException('Redis unavailable');
    }

    echo '{"ready":true}';
} catch (Throwable $error) {
    error_log('readiness check failed: ' . $error->getMessage());
    http_response_code(503);
    echo '{"ready":false}';
}
