<?php
/**
 * Add the order reliability objects an existing database needs.
 *
 * CLI only:
 *   php upgrade/core-store/order-reliability.php plan
 *   php upgrade/core-store/order-reliability.php apply
 *
 * `drop-retired.php` removes retired features and rewrites settings inside one
 * business transaction. This script is deliberately separate and much smaller:
 * it only adds the two reliability tables and the two refund columns, so an
 * existing shop gets the same schema a fresh install ships without touching a
 * single business row.
 *
 * Every step is idempotent: an object that already exists is reported and
 * skipped, so the script can be run again after an interrupted release and it
 * can be run on a database that is already up to date.
 *
 * MySQL commits DDL implicitly; nothing here opens a transaction, and no
 * business data is rewritten. Verified objects are re-read from
 * information_schema after creation, so a silent failure cannot be reported as
 * success.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
umask(0077);
require dirname(__DIR__, 2) . '/vendor/autoload.php';
$app = new think\App(dirname(__DIR__, 2));
$app->initialize();
use think\facade\Db;

/** Tables the retained payment and refund paths write to. */
const RELIABILITY_TABLES = [
    'store_order_payment_attempt' => <<<'SQL'
CREATE TABLE IF NOT EXISTS `%s` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `store_order_id` int(11) NOT NULL DEFAULT '0' COMMENT '订单表ID',
  `out_trade_no` varchar(64) NOT NULL DEFAULT '' COMMENT '提交给支付网关的商户订单号',
  `driver` varchar(32) NOT NULL DEFAULT '' COMMENT '支付驱动 wechat_pay或v3_wechat_pay',
  `mch_id` varchar(64) NOT NULL DEFAULT '' COMMENT '商户号',
  `app_id` varchar(64) NOT NULL DEFAULT '' COMMENT '应用标识',
  `channel` varchar(16) NOT NULL DEFAULT '' COMMENT '支付渠道 routine/weixin/weixin_h5/pc',
  `pay_type` varchar(32) NOT NULL DEFAULT '' COMMENT '支付方式',
  `total_fee` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '订单应付金额',
  `pay_uid` int(11) NOT NULL DEFAULT '0' COMMENT '支付用户uid',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0已提交 1已支付 2已关闭 3结果未知',
  `trade_no` varchar(100) NOT NULL DEFAULT '' COMMENT '网关支付单号',
  `last_result` varchar(255) NOT NULL DEFAULT '' COMMENT '最近一次查单或关单结论',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '创建时间',
  `update_time` int(11) NOT NULL DEFAULT '0' COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `out_trade_no` (`out_trade_no`) USING BTREE,
  KEY `store_order_id` (`store_order_id`) USING BTREE,
  KEY `status` (`status`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单支付尝试记录';
SQL,
    'store_order_effect' => <<<'SQL'
CREATE TABLE IF NOT EXISTS `%s` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `store_order_id` int(11) NOT NULL DEFAULT '0' COMMENT '订单表ID',
  `event_type` varchar(64) NOT NULL DEFAULT '' COMMENT '副作用类型',
  `payload` text COMMENT '处理该副作用所需的数据',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0待处理 1已完成 2结果未知 3执行中',
  `attempts` int(11) NOT NULL DEFAULT '0' COMMENT '已处理次数',
  `last_error` varchar(255) NOT NULL DEFAULT '' COMMENT '最近一次错误',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '创建时间',
  `update_time` int(11) NOT NULL DEFAULT '0' COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_event` (`store_order_id`,`event_type`) USING BTREE,
  KEY `status` (`status`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单支付后置副作用';
SQL,
];

/** Columns the retained refund path needs on a table that already exists. */
const RELIABILITY_COLUMNS = [
    'store_order_refund' => [
        'out_refund_no' => "varchar(64) NOT NULL DEFAULT '' COMMENT '提交给支付网关的退款单号，重试时必须复用'",
        'refund_request' => "text COMMENT '首次发起退款时冻结的请求上下文（金额、渠道、驱动）'",
    ],
];

function validIdentifier(string $name): bool
{
    return (bool)preg_match('/^[a-z0-9_]+$/', $name);
}

function prefixed(string $table): string
{
    if (!validIdentifier($table)) throw new RuntimeException("Unsafe table name: {$table}");
    return config('database.connections.mysql.prefix') . $table;
}

function existingColumns(string $table): array
{
    $rows = Db::query(
        'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [prefixed($table)]
    );
    $columns = [];
    foreach ($rows as $row) $columns[strtolower((string)$row['name'])] = true;
    return $columns;
}

function objectExists(string $table): bool
{
    $rows = Db::query(
        'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        [prefixed($table)]
    );
    return (int)$rows[0]['total'] > 0;
}

/**
 * Every object this script owns, with a reader that proves it is really there.
 * @return array<string, string> object key => "table.column" or "table"
 */
function requiredObjects(): array
{
    $objects = [];
    foreach (array_keys(RELIABILITY_TABLES) as $table) $objects[$table] = $table;
    foreach (RELIABILITY_COLUMNS as $table => $columns) {
        foreach (array_keys($columns) as $column) $objects[$table . '.' . $column] = $table . '.' . $column;
    }
    return $objects;
}

/** @return string[] missing object keys */
function missingObjects(): array
{
    $missing = [];
    $columns = [];
    foreach (requiredObjects() as $key => $object) {
        [$table, $column] = array_pad(explode('.', $object, 2), 2, null);
        if (!objectExists($table)) {
            $missing[] = $key;
            continue;
        }
        if ($column === null) continue;
        if (!isset($columns[$table])) $columns[$table] = existingColumns($table);
        if (!isset($columns[$table][strtolower($column)])) $missing[] = $key;
    }
    return $missing;
}

/** @return string[] object keys that are still absent after apply — always empty on success */
function applyMissingObjects(): array
{
    foreach (RELIABILITY_TABLES as $table => $sql) {
        if (objectExists($table)) continue;
        Db::execute(sprintf($sql, prefixed($table)));
        echo "Created table {$table}\n";
    }
    foreach (RELIABILITY_COLUMNS as $table => $columns) {
        if (!objectExists($table)) {
            throw new RuntimeException("Table {$table} is missing; the refund columns cannot be added to it.");
        }
        $present = existingColumns($table);
        foreach ($columns as $column => $definition) {
            if (isset($present[strtolower($column)])) continue;
            Db::execute(sprintf(
                'ALTER TABLE `%s` ADD COLUMN `%s` %s',
                prefixed($table),
                $column,
                $definition
            ));
            echo "Added {$table}.{$column}\n";
        }
    }
    return missingObjects();
}

$mode = $argv[1] ?? 'plan';
if (!in_array($mode, ['plan', 'apply'], true)) {
    fwrite(STDERR, "Usage: php upgrade/core-store/order-reliability.php plan|apply\n");
    exit(1);
}

try {
    if ($mode === 'plan') {
        $missing = missingObjects();
        if (!$missing) {
            echo "Order reliability schema is up to date; nothing to add.\n";
            exit;
        }
        fwrite(STDOUT, 'apply would add ' . count($missing) . " object(s):\n");
        foreach ($missing as $object) fwrite(STDOUT, "- {$object}\n");
        exit;
    }

    $stillMissing = applyMissingObjects();
    if ($stillMissing) {
        fwrite(STDERR, 'Applied, but these objects are still absent: ' . implode(', ', $stillMissing) . "\n");
        exit(1);
    }
    echo "Order reliability schema applied and verified.\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
