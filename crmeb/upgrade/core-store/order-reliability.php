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
 * it only adds the reliability tables and the refund/payment context columns, so an
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
  `payment_context` text COMMENT '冻结的支付适配上下文，不含密钥',
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
    'store_order_payment_exception' => <<<'SQL'
CREATE TABLE IF NOT EXISTS `%s` (
  `id` int(11) NOT NULL AUTO_INCREMENT COMMENT '自增ID',
  `store_order_id` int(11) NOT NULL DEFAULT '0' COMMENT '订单表ID，无法归属时为0',
  `payment_attempt_id` int(11) NOT NULL DEFAULT '0' COMMENT '命中的支付尝试ID，无对应尝试时为0',
  `mch_id` varchar(64) NOT NULL DEFAULT '' COMMENT '收款商户号',
  `trade_no` varchar(100) NOT NULL DEFAULT '' COMMENT '网关交易号',
  `out_trade_no` varchar(64) NOT NULL DEFAULT '' COMMENT '回调携带的商户订单号',
  `reason` varchar(32) NOT NULL DEFAULT '' COMMENT '异常原因 duplicate_payment/cancelled_order_payment/unmatched_payment',
  `paid_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT '实收金额',
  `currency` varchar(8) NOT NULL DEFAULT 'CNY' COMMENT '币种',
  `payment_context` text COMMENT '冻结的支付上下文（驱动、渠道、身份），不含密钥',
  `status` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0待处理 1已退款 2退款结果未知 3退款失败 4退款处理中',
  `refund_no` varchar(64) NOT NULL DEFAULT '' COMMENT '稳定退款单号，同一记录永远一致',
  `refund_request` text COMMENT '退款请求与网关应答记录',
  `operator` varchar(64) NOT NULL DEFAULT '' COMMENT '退款操作人',
  `refund_time` int(11) NOT NULL DEFAULT '0' COMMENT '退款时间',
  `alarm_time` int(11) NOT NULL DEFAULT '0' COMMENT '告警记录时间',
  `add_time` int(11) NOT NULL DEFAULT '0' COMMENT '创建时间',
  `update_time` int(11) NOT NULL DEFAULT '0' COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `mch_trade` (`mch_id`,`trade_no`) USING BTREE,
  KEY `store_order_id` (`store_order_id`) USING BTREE,
  KEY `status` (`status`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='异常收款记录';
SQL,
];

/** Columns the retained refund path needs on a table that already exists. */
const RELIABILITY_COLUMNS = [
    'store_order_payment_attempt' => [
        'payment_context' => "text COMMENT '冻结的支付适配上下文，不含密钥'",
    ],
    'store_order_refund' => [
        'out_refund_no' => "varchar(64) NOT NULL DEFAULT '' COMMENT '提交给支付网关的退款单号，重试时必须复用'",
        'refund_request' => "text COMMENT '首次发起退款时冻结的请求上下文（原支付订单、交易号、驱动、商户、应用、渠道、金额、币种）'",
        'refund_state' => "tinyint(1) NOT NULL DEFAULT '0' COMMENT '0未提交 1处理中 2结果未知 3成功 4关闭/失败'",
    ],
];

/**
 * 必须存在的唯一索引：缺少它时并发保护失效
 * 表名 => [索引名 => 列(按顺序)]
 */
const RELIABILITY_UNIQUE_INDEXES = [
    'store_order_payment_attempt' => ['out_trade_no' => ['out_trade_no']],
    'store_order_effect' => ['order_event' => ['store_order_id', 'event_type']],
    'store_order_payment_exception' => ['mch_trade' => ['mch_id', 'trade_no']],
];

/**
 * 关键列的类型约束：只检查"列存在"不足以证明迁移真的做完了
 * "表.列" => 规范化类型（information_schema.COLUMNS 的 DATA_TYPE）
 */
const RELIABILITY_COLUMN_TYPES = [
    'store_order_payment_attempt.out_trade_no' => 'varchar',
    'store_order_payment_attempt.driver' => 'varchar',
    'store_order_payment_attempt.status' => 'tinyint',
    'store_order_payment_attempt.total_fee' => 'decimal',
    'store_order_payment_attempt.payment_context' => 'text',
    'store_order_effect.event_type' => 'varchar',
    'store_order_effect.status' => 'tinyint',
    'store_order_payment_exception.mch_id' => 'varchar',
    'store_order_payment_exception.trade_no' => 'varchar',
    'store_order_payment_exception.reason' => 'varchar',
    'store_order_payment_exception.paid_amount' => 'decimal',
    'store_order_payment_exception.status' => 'tinyint',
    'store_order_refund.out_refund_no' => 'varchar',
    'store_order_refund.refund_state' => 'tinyint',
];

/**
 * 迁移前后必须逐行核对数量的保留业务表
 *
 * 数量不硬编码：脚本先记录迁移前的行数，迁移后再读一次并比对，任何一处变化
 * 都说明这次迁移动了业务数据。
 */
const SNAPSHOT_TABLES = [
    'store_order',
    'store_order_cart_info',
    'store_order_refund',
    'store_coupon_user',
    'store_coupon_issue_user',
    'store_order_payment_attempt',
    'store_order_effect',
    'user',
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

/**
 * 列的规范化类型，用于比对配置要求和实际结构
 * @param string $table
 * @param string $column
 * @return string|null
 */
function columnType(string $table, string $column): ?string
{
    $rows = Db::query(
        'SELECT DATA_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [prefixed($table), $column]
    );
    return $rows ? strtolower((string)$rows[0]['type']) : null;
}

/**
 * 唯一索引及其列顺序
 * @param string $table
 * @return array<string, string[]> 索引名 => 列名
 */
function uniqueIndexes(string $table): array
{
    $rows = Db::query(
        'SELECT INDEX_NAME AS name, COLUMN_NAME AS column_name, SEQ_IN_INDEX AS seq
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND NON_UNIQUE = 0
         ORDER BY INDEX_NAME, SEQ_IN_INDEX',
        [prefixed($table)]
    );
    $indexes = [];
    foreach ($rows as $row) {
        if ((string)$row['name'] === 'PRIMARY') continue;
        $indexes[(string)$row['name']][] = (string)$row['column_name'];
    }
    return $indexes;
}

/**
 * 缺少的唯一索引
 * @return string[]
 */
function missingUniqueIndexes(): array
{
    $missing = [];
    foreach (RELIABILITY_UNIQUE_INDEXES as $table => $indexes) {
        if (!objectExists($table)) {
            //整表缺失已由 missingObjects 报告，这里不重复
            continue;
        }
        $present = uniqueIndexes($table);
        foreach ($indexes as $name => $columns) {
            if (!isset($present[$name]) || $present[$name] !== $columns) {
                $missing[] = $table . '.' . $name . '(' . implode(',', $columns) . ')';
            }
        }
    }
    return $missing;
}

/**
 * 类型与配置不符的列
 * @return string[]
 */
function wrongColumnTypes(): array
{
    $wrong = [];
    foreach (RELIABILITY_COLUMN_TYPES as $key => $expected) {
        [$table, $column] = explode('.', $key, 2);
        $actual = columnType($table, $column);
        if ($actual === null) {
            continue; //缺失由 missingObjects 报告
        }
        if ($actual !== $expected) {
            $wrong[] = $key . ' is ' . $actual . ', expected ' . $expected;
        }
    }
    return $wrong;
}

/**
 * 迁移前的存量数据预检查
 *
 * 未决支付尝试、非空退款上下文、无法归属的旧副作用任务都代表"结果不明"的
 * 存量：迁移不会替商户猜测它们，只能报告并阻断，由人工确认后再上线。
 *
 * @return string[] 阻断原因
 */
function precheckBlockers(): array
{
    $blockers = [];
    if (objectExists('store_order_payment_attempt')) {
        $row = Db::query(
            'SELECT COUNT(*) AS total FROM `' . prefixed('store_order_payment_attempt') . '` WHERE status IN (0, 3, 4)'
        );
        $pending = (int)($row[0]['total'] ?? 0);
        if ($pending > 0) {
            $blockers[] = "有 {$pending} 条未决支付尝试（status 0/3）：请在迁移前通过 order:reconcile payments:list 核对";
        }
    }
    // refund_state 可能尚未建立（正是这次迁移要补的列）：结构检查与存量检查
    // 都要按当前实际结构来，否则脚本会在"还没迁完"的库上自己报错。
    $refundColumns = objectExists('store_order_refund') ? existingColumns('store_order_refund') : [];
    if (isset($refundColumns['refund_state'], $refundColumns['refund_request'])) {
        $row = Db::query(
            'SELECT COUNT(*) AS total FROM `' . prefixed('store_order_refund') . '`
             WHERE refund_request <> "" AND refund_state IN (0, 1, 2)'
        );
        $unfinished = (int)($row[0]['total'] ?? 0);
        if ($unfinished > 0) {
            $blockers[] = "有 {$unfinished} 条退款请求尚未完成（状态 0/1/2）：请在迁移前通过 order:reconcile refunds:list 核对";
        }
    }
    if (isset($refundColumns['refund_request']) && !isset($refundColumns['refund_state'])) {
        // 旧库的 refund_request 里冻结了金额但还没有状态列：迁移只补结构，不改写
        // 任何一行；有冻结请求的旧记录需要人工确认状态后再上线。
        $row = Db::query(
            'SELECT COUNT(*) AS total FROM `' . prefixed('store_order_refund') . '` WHERE refund_request <> ""'
        );
        $frozen = (int)($row[0]['total'] ?? 0);
        if ($frozen > 0) {
            $blockers[] = "有 {$frozen} 条旧退款记录带有冻结请求但缺少状态列，请在迁移后人工核对退款状态";
        }
    }
    if (objectExists('store_order_effect')) {
        $row = Db::query(
            'SELECT COUNT(*) AS total FROM `' . prefixed('store_order_effect') . '` WHERE status IN (2, 3)'
        );
        $unknown = (int)($row[0]['total'] ?? 0);
        if ($unknown > 0) {
            $blockers[] = "有 {$unknown} 条副作用结果未知或执行中：请在迁移前通过 order:reconcile effects:list 核对";
        }
    }
    return $blockers;
}

/**
 * 保留业务表的行数快照
 * @return array<string, int>
 */
function rowSnapshot(): array
{
    $snapshot = [];
    foreach (SNAPSHOT_TABLES as $table) {
        if (!objectExists($table)) {
            $snapshot[$table] = -1; //不存在：迁移也不会创建它
            continue;
        }
        $row = Db::query('SELECT COUNT(*) AS total FROM `' . prefixed($table) . '`');
        $snapshot[$table] = (int)($row[0]['total'] ?? 0);
    }
    return $snapshot;
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

/**
 * 补齐缺失的唯一索引，返回仍然失败的对象
 *
 * DDL 独立执行（MySQL 隐式提交），中断后可以重跑：已经存在的索引会被跳过。
 *
 * @return string[]
 */
function addMissingUniqueIndexes(): array
{
    foreach (RELIABILITY_UNIQUE_INDEXES as $table => $indexes) {
        if (!objectExists($table)) continue;
        $present = uniqueIndexes($table);
        foreach ($indexes as $name => $columns) {
            if (isset($present[$name])) continue;
            $columnList = '`' . implode('`,`', $columns) . '`';
            try {
                Db::execute(sprintf('ALTER TABLE `%s` ADD UNIQUE KEY `%s` (%s)', prefixed($table), $name, $columnList));
                echo "Added unique index {$table}.{$name}\n";
            } catch (\Throwable $e) {
                //并发或重跑时同名索引可能已经被另一次运行建立：复查后再决定
                if (!isset(uniqueIndexes($table)[$name])) {
                    throw $e;
                }
            }
        }
    }
    return missingUniqueIndexes();
}

$mode = $argv[1] ?? 'plan';
if (!in_array($mode, ['plan', 'apply'], true)) {
    fwrite(STDERR, "Usage: php upgrade/core-store/order-reliability.php plan|apply\n");
    exit(1);
}

try {
    if ($mode === 'plan') {
        $missing = missingObjects();
        $missingIndexes = missingUniqueIndexes();
        $wrongTypes = wrongColumnTypes();
        $blockers = precheckBlockers();
        if ($blockers) {
            fwrite(STDOUT, "存量数据预检查未通过，apply 会拒绝执行：\n");
            foreach ($blockers as $blocker) fwrite(STDOUT, "- {$blocker}\n");
        }
        if (!$missing && !$missingIndexes && !$wrongTypes) {
            echo "Order reliability schema is up to date; nothing to add.\n";
            exit($blockers ? 1 : 0);
        }
        fwrite(STDOUT, 'apply would add ' . count($missing) . " object(s):\n");
        foreach ($missing as $object) fwrite(STDOUT, "- {$object}\n");
        if ($missingIndexes) {
            fwrite(STDOUT, 'apply would add ' . count($missingIndexes) . " unique index(es):\n");
            foreach ($missingIndexes as $index) fwrite(STDOUT, "- {$index}\n");
        }
        if ($wrongTypes) {
            fwrite(STDOUT, "structure conflicts (report only, nothing is changed):\n");
            foreach ($wrongTypes as $conflict) fwrite(STDOUT, "- {$conflict}\n");
        }
        //唯一索引缺失同样需要 apply，和缺失对象、类型冲突一样以非零退出
        exit($blockers || $wrongTypes || $missingIndexes ? 1 : 0);
    }

    //存量数据预检查必须在任何 DDL 之前：无法确认的存量由人工处理，不自动猜测
    $blockers = precheckBlockers();
    if ($blockers) {
        fwrite(STDERR, "存量数据预检查未通过，未执行任何结构变更：\n");
        foreach ($blockers as $blocker) fwrite(STDERR, "- {$blocker}\n");
        exit(1);
    }
    //结构冲突也要在执行可避免的修改之前报告
    $wrongTypes = wrongColumnTypes();
    if ($wrongTypes) {
        fwrite(STDERR, "结构冲突，未执行任何结构变更：\n");
        foreach ($wrongTypes as $conflict) fwrite(STDERR, "- {$conflict}\n");
        exit(1);
    }

    $before = rowSnapshot();
    // -1 表示迁移前这张表还不存在（例如正是本脚本要建的可靠性表）：它被创建
    // 属于预期结果，不算业务数据变化
    $stillMissing = applyMissingObjects();
    if ($stillMissing) {
        fwrite(STDERR, 'Applied, but these objects are still absent: ' . implode(', ', $stillMissing) . "\n");
        exit(1);
    }
    //唯一索引缺失同样会让并发保护失效，必须补齐并复查
    $indexFailures = addMissingUniqueIndexes();
    if ($indexFailures) {
        fwrite(STDERR, 'Applied, but these unique indexes could not be added: ' . implode(', ', $indexFailures) . "\n");
        exit(1);
    }
    //迁移后逐行核对保留业务表：数量变化说明这次迁移动了业务数据
    $after = rowSnapshot();
    $changed = [];
    foreach ($before as $table => $count) {
        if ($count === -1) {
            continue; //迁移前不存在，创建它是预期结果
        }
        if (($after[$table] ?? null) !== $count) {
            $changed[] = $table . ' ' . $count . ' -> ' . ($after[$table] ?? 'missing');
        }
    }
    if ($changed) {
        fwrite(STDERR, '保留业务表行数发生变化，迁移未完成核对：' . implode(', ', $changed) . "\n");
        exit(1);
    }
    $indexVerify = missingUniqueIndexes();
    if ($indexVerify) {
        fwrite(STDERR, 'Applied, but these unique indexes are still absent: ' . implode(', ', $indexVerify) . "\n");
        exit(1);
    }
    echo "Order reliability schema applied and verified (objects, unique indexes, column types, row counts).\n";
} catch (Throwable $error) {
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
