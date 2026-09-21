<?php
/**
 * Widen `user.pwd` so a bcrypt hash fits.
 *
 * CLI only:
 *   php upgrade/core-store/user-password-hash.php plan
 *   php upgrade/core-store/user-password-hash.php apply
 *
 * 前台用户的口令历史上存的是无盐 MD5，列因此是 varchar(32)——正好装下一个 MD5，
 * 装不下 bcrypt 的 60 字符。登录路径已经改成校验时兼容 MD5、成功后就地升级为
 * bcrypt；这个脚本负责把列加宽，否则 MySQL 会静默截断那个哈希。
 *
 * 登录侧对此有兜底（写完读回来验一遍，验不过就写回原值），所以代码与本迁移谁先
 * 上线都不会把用户锁在门外；在本迁移跑完之前，升级只是不会发生。
 *
 * 幂等：列已经够宽就只报告、不改。只有 ALTER，不触碰任何业务行——`plan` 会打印
 * 迁移前的用户行数，`apply` 跑完再读一次并比对，数量有任何变化都判失败。
 *
 * MySQL 的 DDL 隐式提交，这里不开事务。改完从 information_schema 重新读一遍，
 * 所以静默失败不会被报告成成功。
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
umask(0077);
require dirname(__DIR__, 2) . '/vendor/autoload.php';
$app = new think\App(dirname(__DIR__, 2));
$app->initialize();
use think\facade\Db;

/** 目标列定义：bcrypt 是 60 字符，留足余量并允许将来换更长的算法。 */
const PASSWORD_COLUMN_TABLE = 'user';
const PASSWORD_COLUMN_NAME = 'pwd';
const PASSWORD_COLUMN_MIN_LENGTH = 255;
const PASSWORD_COLUMN_DEFINITION = "varchar(255) NOT NULL DEFAULT '' COMMENT '用户密码（bcrypt；历史值为无盐 MD5，登录成功时就地升级）'";

function validIdentifier(string $name): bool
{
    return (bool)preg_match('/^[a-z0-9_]+$/', $name);
}

function prefixed(string $table): string
{
    if (!validIdentifier($table)) throw new RuntimeException("Unsafe table name: {$table}");
    return config('database.connections.mysql.prefix') . $table;
}

/**
 * 列的字符长度上限；列不存在时返回 null。
 */
function columnLength(string $table, string $column): ?int
{
    $rows = Db::query(
        'SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.COLUMNS'
        . ' WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [prefixed($table), $column]
    );
    if (!$rows) return null;
    return $rows[0]['len'] === null ? null : (int)$rows[0]['len'];
}

function userRowCount(): int
{
    $rows = Db::query('SELECT COUNT(*) AS n FROM `' . prefixed(PASSWORD_COLUMN_TABLE) . '`');
    return (int)$rows[0]['n'];
}

function currentState(): array
{
    $length = columnLength(PASSWORD_COLUMN_TABLE, PASSWORD_COLUMN_NAME);
    return [
        'column' => prefixed(PASSWORD_COLUMN_TABLE) . '.' . PASSWORD_COLUMN_NAME,
        'present' => $length !== null,
        'length' => $length,
        'wide_enough' => $length !== null && $length >= PASSWORD_COLUMN_MIN_LENGTH,
        'users' => userRowCount(),
    ];
}

$action = $argv[1] ?? '';

if ($action === 'plan') {
    $state = currentState();
    if (!$state['present']) {
        $state['apply_ready'] = false;
        $state['blocker'] = $state['column'] . ' does not exist';
    } else {
        $state['apply_ready'] = true;
        $state['action'] = $state['wide_enough'] ? 'nothing to do' : 'widen to varchar(' . PASSWORD_COLUMN_MIN_LENGTH . ')';
    }
    echo json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
    exit($state['apply_ready'] ? 0 : 1);
}

if ($action !== 'apply') {
    fwrite(STDERR, "usage: php upgrade/core-store/user-password-hash.php plan|apply\n");
    exit(2);
}

$before = currentState();
if (!$before['present']) {
    fwrite(STDERR, $before['column'] . " does not exist\n");
    exit(1);
}

$changed = false;
if (!$before['wide_enough']) {
    Db::execute(
        'ALTER TABLE `' . prefixed(PASSWORD_COLUMN_TABLE) . '`'
        . ' MODIFY COLUMN `' . PASSWORD_COLUMN_NAME . '` ' . PASSWORD_COLUMN_DEFINITION
    );
    $changed = true;
}

// 改完重新读一遍结构，而不是相信 ALTER 没报错就等于成功。
$after = currentState();
$failures = [];
if (!$after['wide_enough']) {
    $failures[] = $after['column'] . ' is still ' . var_export($after['length'], true)
        . ', expected at least ' . PASSWORD_COLUMN_MIN_LENGTH;
}
// 这是一个纯 DDL 迁移：一行业务数据都不该变。
if ($after['users'] !== $before['users']) {
    $failures[] = 'user row count changed: ' . $before['users'] . ' -> ' . $after['users'];
}

$result = [
    'changed' => $changed,
    'before_length' => $before['length'],
    'after_length' => $after['length'],
    'users' => $after['users'],
    'verified' => $failures === [],
    'failures' => $failures,
];
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
exit($failures === [] ? 0 : 1);
