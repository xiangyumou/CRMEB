<?php
/**
 * Drop the retired feature data from an existing database.
 *
 * Two phases, both CLI-only, both requiring an absolute backup path outside public/:
 *   php upgrade/core-store/drop-retired.php plan
 *   php upgrade/core-store/drop-retired.php apply /private/retired-backup.json
 *   php upgrade/core-store/drop-retired.php finalize
 *   php upgrade/core-store/drop-retired.php rollback /private/retired-backup.json
 *
 * `apply` renames the retired tables to eb_retired_* (instant, reversible) and
 * removes the retired settings, menus, timers and templates. It refuses to run
 * while any settlement is still pending. Run `finalize` after the acceptance
 * window to drop the renamed tables for good; after that only a mysqldump
 * restore can bring the data back.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__, 2) . '/vendor/autoload.php';
$app = new think\App(dirname(__DIR__, 2));
$app->initialize();
use think\facade\Db;

const RENAME_PREFIX = 'retired_';
const BACKUP_FORMAT = 'core-store-drop-v1';

/** Tables whose only owner was a retired feature. */
const RETIRED_TABLES = [
    'agent_level', 'agent_level_task', 'agent_level_task_record', 'app_version',
    'delivery_service', 'division_agent_apply',
    'live_anchor', 'live_goods', 'live_room', 'live_room_goods',
    'luck_lottery', 'luck_lottery_record', 'luck_prize',
    'member_card', 'member_card_batch', 'member_right', 'member_ship',
    'other_order', 'other_order_status', 'spread_apply',
    'store_activity', 'store_bargain', 'store_bargain_user', 'store_bargain_user_help',
    'store_integral', 'store_integral_order', 'store_integral_order_status',
    'store_order_economize', 'store_seckill', 'store_seckill_time',
    'store_service', 'store_service_feedback', 'store_service_log',
    'store_service_record', 'store_service_speechcraft',
    'system_sign_reward', 'system_store', 'system_store_staff', 'system_user_level',
    'user_brokerage', 'user_brokerage_frozen', 'user_extract', 'user_friends',
    'user_level', 'user_money', 'user_recharge', 'user_sign', 'user_spread',
];

/** Settings that only configured a retired feature. */
const RETIRED_CONFIG = [
    'brokerage_func_status', 'store_brokerage_statu', 'store_brokerage_price', 'brokerage_bindind',
    'store_brokerage_binding_status', 'store_brokerage_binding_time', 'spread_banner', 'brokerage_level',
    'division_status', 'agent_apply_open', 'brokerage_window_switch', 'brokerage_user_status',
    'uni_brokerage_price', 'day_brokerage_price_upper', 'store_brokerage_ratio', 'store_brokerage_two',
    'user_brokerage_type', 'extract_type', 'weixin_extract_type', 'alipay_extract_type',
    'extract_time', 'extract_min_price', 'extract_price', 'member_card_status', 'member_func_status',
    'member_price_status', 'level_status', 'order_give_exp', 'invite_user_exp',
    'balance_func_status', 'recharge_attention', 'recharge_switch', 'store_user_min_recharge',
    'integral_ratio', 'integral_max_num', 'order_give_integral', 'reward_integral', 'reward_money',
    'sign_status', 'sign_mode', 'sign_remind', 'sign_give_point', 'sign_give_exp',
    'store_integral_ratio', 'store_self_mention', 'offline_pay_status', 'offline_postage',
    'ali_pay_status', 'ali_pay_appid', 'yue_pay_status', 'allin_pay_status',
    'pay_wechat_type', 'wechat_extract_type', 'weixin_extract_switch',
    'user_sign_num', 'sign_day_num', 'app_version_*',
];

/** Config tabs that only held retired settings. */
const RETIRED_CONFIG_TABS = [9, 11, 28, 45, 63, 67, 69, 72, 73, 74, 119, 126];

/** Timer rows belonging to retired features. */
const RETIRED_TIMER_MARKS = ['agent', 'live', 'poster', 'other_order', 'sign'];

/** Retired admin menu paths; a parent with a retained child stays navigable. */
const RETIRED_MENU_PATHS = [
    '/user/level', '/user/grade', '/agent', '/setting/system_config_retail',
    '/setting/membership_level', '/setting/member_config', '/marketing/store_seckill',
    '/marketing/store_seckill_data', '/marketing/store_bargain', '/marketing/store_integral',
    '/marketing/lottery', '/marketing/live', '/marketing/point_record', '/marketing/point_statistic',
    '/marketing/integral', '/marketing/recharge', '/finance/user_recharge', '/finance/user_extract',
    '/finance/finance/commission', '/finance/balance', '/statistic/balance', '/kefu',
    '/setting/store_service', '/setting/freight/city', '/setting/merchant/system_store',
    '/setting/merchant/system_store_staff', '/setting/merchant/system_verify_order',
    '/setting/delivery_service', '/setting/sign_config', '/setting/system_group_data/sign',
    '/setting/recharge_config', '/marketing/sign_rewards', '/order/offline',
    '/app/app/version', '/system/crossVersionUpgrade',
];

/** Tables whose rows must survive untouched, reported by count and hash. */
const PROTECTED_TABLES = [
    'store_product', 'store_product_attr', 'store_product_attr_value',
    'store_product_attr_result', 'store_product_description', 'store_category',
    'system_attachment', 'store_order', 'store_order_cart_info', 'user',
];

/** Rows living inside shared tables that belong to retired features. */
const RETIRED_GROUP_DATA = ['sign_day_num', 'user_recharge_quota', 'integral_shop_banner', 'user_sgin', 'routine_sign'];

function tableExists(string $table): bool
{
    if (!preg_match('/^[a-z0-9_]+$/', $table)) return false;
    $full = config('database.connections.mysql.prefix') . $table;
    return (bool)Db::query("SHOW TABLES LIKE '" . $full . "'");
}

function tableName(string $table): string
{
    return config('database.connections.mysql.prefix') . $table;
}

/** Probe an already-prefixed physical table name. */
function tableExistsRaw(string $full): bool
{
    if (!preg_match('/^[a-z0-9_]+$/', $full)) return false;
    return (bool)Db::query("SHOW TABLES LIKE '" . $full . "'");
}

function retiredTableName(string $table): string
{
    return config('database.connections.mysql.prefix') . RENAME_PREFIX . $table;
}

function configNameMatches(string $name): bool
{
    foreach (RETIRED_CONFIG as $pattern) {
        if (substr($pattern, -1) === '*') {
            if (strpos($name, rtrim($pattern, '*')) === 0) return true;
            continue;
        }
        if ($name === $pattern) return true;
    }
    return strpos($name, 'brokerage_') === 0
        || strpos($name, 'extract_') === 0
        || strpos($name, 'member_') === 0
        || strpos($name, 'sign_') === 0
        || strpos($name, 'point_') === 0
        || strpos($name, 'integral_') === 0
        || strpos($name, 'recharge_') === 0
        || strpos($name, 'kefu_') === 0
        || strpos($name, 'ali_pay_') === 0
        || strpos($name, 'yue_pay_') === 0
        || strpos($name, 'offline_') === 0;
}

function protectedFingerprint(): array
{
    $out = [];
    foreach (PROTECTED_TABLES as $table) {
        if (!tableExists($table)) continue;
        $rows = Db::name($table)->select()->toArray();
        $encoded = array_map(function ($row) { ksort($row); return json_encode($row); }, $rows);
        sort($encoded, SORT_STRING);
        $out[$table] = ['count' => count($rows), 'sha256' => hash('sha256', implode("\n", $encoded))];
    }
    return $out;
}

/** Settlement that must not be dropped silently: money or goods still owed. */
function pendingLiabilities(): array
{
    $pending = [];
    if (tableExists('user_extract')) {
        $count = (int)Db::name('user_extract')->whereIn('status', [0, 1])->count();
        if ($count) $pending[] = "user_extract: {$count} withdrawal request(s) not settled";
    }
    if (tableExists('other_order')) {
        $count = (int)Db::name('other_order')->where('paid', 0)->where('is_del', 0)->count();
        if ($count) $pending[] = "other_order: {$count} unpaid member/recharge order(s)";
    }
    if (tableExists('store_integral_order')) {
        $count = (int)Db::name('store_integral_order')->whereIn('status', [0, 1, 4])->count();
        if ($count) $pending[] = "store_integral_order: {$count} points-mall order(s) not finished";
    }
    if (tableExists('store_order')) {
        $legacy = Db::name('store_order')->whereIn('pay_type', ['yue', 'offline'])
            ->where('paid', 1)->whereIn('status', [0, 1, 4])->where('is_del', 0);
        $count = (int)$legacy->count();
        if ($count) $pending[] = "store_order: {$count} historical balance/offline order(s) still being fulfilled";
        // Self-pickup write-off is retired with the store module, so a paid
        // pickup order that was never collected can no longer be completed.
        $pickup = Db::name('store_order')->where('shipping_type', 2)
            ->where('paid', 1)->whereIn('status', [0, 1])->where('is_del', 0);
        $count = (int)$pickup->count();
        if ($count) $pending[] = "store_order: {$count} paid self-pickup order(s) awaiting write-off";
    }
    return $pending;
}

/** Money that is not owed but will become unreachable; exported for the operator. */
function strandedBalances(): array
{
    if (!tableExists('user')) return [];
    // The query builder refuses a field-restricted find() without a where clause
    // (think-orm BaseQuery::find), which would silently report zero balances.
    $row = Db::name('user')->where('uid', '>', 0)->field([
        'COUNT(CASE WHEN now_money > 0 THEN 1 END) as money_users',
        'IFNULL(SUM(now_money), 0) as money_total',
        'COUNT(CASE WHEN integral > 0 THEN 1 END) as integral_users',
        'IFNULL(SUM(integral), 0) as integral_total',
        'COUNT(CASE WHEN brokerage_price > 0 THEN 1 END) as brokerage_users',
        'IFNULL(SUM(brokerage_price), 0) as brokerage_total',
    ])->find();
    return $row ?: [];
}

/** The affected accounts, so the operator can compensate them one by one. */
function strandedBalanceHolders(): array
{
    if (!tableExists('user')) return [];
    return Db::name('user')->where('uid', '>', 0)
        ->where(function ($query) {
            $query->where('now_money', '>', 0)->whereOr('integral', '>', 0)->whereOr('brokerage_price', '>', 0);
        })
        ->field('uid,nickname,phone,now_money,integral,brokerage_price')
        ->order('uid')->select()->toArray();
}

$mode = $argv[1] ?? 'plan';
$backup = $argv[2] ?? '';
if (!in_array($mode, ['plan', 'apply', 'finalize', 'rollback'], true)) {
    fwrite(STDERR, "Usage: php upgrade/core-store/drop-retired.php plan|apply|finalize|rollback [absolute-backup.json]\n");
    exit(1);
}
if (in_array($mode, ['apply', 'rollback'], true) && !$backup) {
    fwrite(STDERR, "The {$mode} step needs an absolute backup path.\n");
    exit(1);
}
if ($backup && ($backup[0] !== '/' || strpos(realpath(dirname($backup)) . '/', realpath(public_path()) . '/') === 0)) {
    fwrite(STDERR, "Backup must be an absolute path outside public/.\n");
    exit(1);
}

try {
    if ($mode === 'finalize') {
        $dropped = 0;
        foreach (RETIRED_TABLES as $table) {
            $renamed = retiredTableName($table);
            if (!tableExistsRaw($renamed)) continue;
            Db::execute('DROP TABLE `' . $renamed . '`');
            $dropped++;
        }
        \crmeb\services\CacheService::clear();
        echo "Finalized: dropped {$dropped} renamed table(s).\n";
        exit;
    }

    if ($mode === 'rollback') {
        $saved = json_decode((string)@file_get_contents($backup), true);
        if (!is_array($saved) || ($saved['format'] ?? '') !== BACKUP_FORMAT) {
            throw new RuntimeException('Invalid backup format.');
        }
        Db::startTrans();
        foreach (array_reverse($saved['renamed']) as $table) {
            if (tableExistsRaw(retiredTableName($table)) && !tableExists($table)) {
                Db::execute('RENAME TABLE `' . retiredTableName($table) . '` TO `' . tableName($table) . '`');
            }
        }
        foreach (array_reverse($saved['changes']) as $change) {
            $table = Db::name($change['table']);
            $current = $change['after'] === null
                ? null
                : $table->where('id', $change['id'])->find();
            if ($change['after'] !== null && $current != $change['after']) {
                throw new RuntimeException('Concurrent changes: rollback refused.');
            }
            if ($change['after'] === null) {
                // the row was deleted; put the original back
                $table->insert($change['before']);
            } else {
                $table->where('id', $change['id'])->update($change['before']);
            }
        }
        Db::commit();
        \crmeb\services\CacheService::clear();
        echo "Rollback complete.\n";
        exit;
    }

    $pending = pendingLiabilities();
    $stranded = strandedBalances();
    $report = [
        'mode' => $mode,
        'pending_liabilities' => $pending,
        'unreachable_balances' => $stranded,
        'retired_tables' => [],
        'retired_tables_present' => 0,
        'retired_config_rows' => 0,
        'retired_config_tabs' => 0,
        'retired_menu_rows' => 0,
        'retired_timer_rows' => 0,
        'retired_group_data_rows' => 0,
        'protected' => protectedFingerprint(),
    ];
    foreach (RETIRED_TABLES as $table) {
        if (!tableExists($table)) continue;
        $report['retired_tables_present']++;
        $report['retired_tables'][$table] = (int)Db::name($table)->count();
    }
    if (tableExists('system_config')) {
        foreach (Db::name('system_config')->column('menu_name') as $name) {
            if (configNameMatches((string)$name)) $report['retired_config_rows']++;
        }
    }
    if (tableExists('system_config_tab')) {
        $report['retired_config_tabs'] = (int)Db::name('system_config_tab')->whereIn('id', RETIRED_CONFIG_TABS)->count();
    }
    if (tableExists('system_group_data') && tableExists('system_group')) {
        $retiredGids = Db::name('system_group')->whereIn('config_name', RETIRED_GROUP_DATA)->column('id');
        if ($retiredGids) {
            $report['retired_group_data_rows'] = (int)Db::name('system_group_data')->whereIn('gid', $retiredGids)->count();
        }
    }
    if (tableExists('system_menus')) {
        foreach (Db::name('system_menus')->column('menu_path') as $path) {
            $normalized = '/' . ltrim((string)$path, '/');
            foreach (RETIRED_MENU_PATHS as $prefix) {
                if ($normalized === $prefix || strpos($normalized, $prefix . '/') === 0) {
                    $report['retired_menu_rows']++;
                    break;
                }
            }
        }
    }
    if (tableExists('system_timer')) {
        foreach (Db::name('system_timer')->select()->toArray() as $row) {
            foreach (RETIRED_TIMER_MARKS as $mark) {
                if (stripos((string)$row['mark'], $mark) !== false || stripos((string)$row['name'], $mark) !== false) {
                    $report['retired_timer_rows']++;
                    break;
                }
            }
        }
    }

    if ($mode === 'plan') {
        echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        if ($pending) {
            fwrite(STDERR, "apply will be refused until these are settled:\n- " . implode("\n- ", $pending) . "\n");
            exit(2);
        }
        if (array_sum(array_map('intval', $stranded)) > 0) {
            fwrite(STDERR, "Note: unreachable balances exist; export them before apply for offline compensation.\n");
        }
        exit;
    }

    if ($pending) {
        throw new RuntimeException("Pending settlement blocks apply:\n- " . implode("\n- ", $pending));
    }

    // Carry the order notification roster and mobile order-management grant over
    // to the retained setting before the service rows are renamed away.
    $inherit = [];
    if (tableExists('store_service')) {
        $notifyUids = Db::name('store_service')->where(['status' => 1, 'notify' => 1])->column('uid');
        if ($notifyUids && tableExists('system_config')) {
            $existing = Db::name('system_config')->where('menu_name', 'order_notice_admin_uids')->find();
            $inherit['notify_uids'] = array_map('intval', $notifyUids);
            if (!$existing) {
                throw new RuntimeException('order_notice_admin_uids is missing; run the install SQL upgrade first.');
            }
            if (trim($existing['value'], '"') === '') {
                $inherit['config_before'] = $existing;
            }
        }
    }

    Db::startTrans();
    $fingerprint = protectedFingerprint();
    $changes = [];
    $renamed = [];

    if (!empty($inherit['notify_uids']) && isset($inherit['config_before'])) {
        $next = $inherit['config_before'];
        $next['value'] = json_encode(implode(',', $inherit['notify_uids']));
        $changes[] = ['table' => 'system_config', 'id' => $next['id'], 'before' => $inherit['config_before'], 'after' => $next];
    }

    if (tableExists('system_config')) {
        foreach (Db::name('system_config')->lock(true)->select()->toArray() as $row) {
            if (!configNameMatches((string)$row['menu_name'])) continue;
            $changes[] = ['table' => 'system_config', 'id' => $row['id'], 'before' => $row, 'after' => null];
        }
    }
    if (tableExists('system_config_tab')) {
        foreach (Db::name('system_config_tab')->whereIn('id', RETIRED_CONFIG_TABS)->lock(true)->select()->toArray() as $row) {
            $changes[] = ['table' => 'system_config_tab', 'id' => $row['id'], 'before' => $row, 'after' => null];
        }
    }
    if (tableExists('system_timer')) {
        $timers = Db::name('system_timer')->lock(true)->select()->toArray();
        foreach ($timers as $row) {
            $matches = false;
            foreach (RETIRED_TIMER_MARKS as $mark) {
                if (stripos((string)$row['mark'], $mark) !== false || stripos((string)$row['name'], $mark) !== false) {
                    $matches = true;
                    break;
                }
            }
            if ($matches) $changes[] = ['table' => 'system_timer', 'id' => $row['id'], 'before' => $row, 'after' => null];
        }
    }
    if (tableExists('system_group_data') && tableExists('system_group')) {
        $retiredGids = Db::name('system_group')->whereIn('config_name', RETIRED_GROUP_DATA)->column('id');
        if ($retiredGids) {
            foreach (Db::name('system_group_data')->whereIn('gid', $retiredGids)->lock(true)->select()->toArray() as $row) {
                $changes[] = ['table' => 'system_group_data', 'id' => $row['id'], 'before' => $row, 'after' => null];
            }
        }
    }
    if (tableExists('system_group')) {
        foreach (Db::name('system_group')->whereIn('config_name', RETIRED_GROUP_DATA)->lock(true)->select()->toArray() as $row) {
            $changes[] = ['table' => 'system_group', 'id' => $row['id'], 'before' => $row, 'after' => null];
        }
    }
    if (tableExists('system_menus')) {
        $menus = Db::name('system_menus')->lock(true)->select()->toArray();
        $removedIds = [];
        foreach ($menus as $m) {
            $path = '/' . ltrim((string)$m['menu_path'], '/');
            foreach (RETIRED_MENU_PATHS as $prefix) {
                if ($path === $prefix || strpos($path, $prefix . '/') === 0) { $removedIds[(int)$m['id']] = true; break; }
            }
        }
        $children = []; $byId = [];
        foreach ($menus as $m) { $children[(int)$m['pid']][] = (int)$m['id']; $byId[(int)$m['id']] = $m; }
        do {
            $changed = false;
            foreach ($menus as $m) {
                $id = (int)$m['id'];
                if (!isset($removedIds[$id])) continue;
                foreach ($children[$id] ?? [] as $child) {
                    $childMenu = $byId[$child] ?? null;
                    if ($childMenu && !isset($removedIds[$child]) && !in_array($childMenu['menu_path'], ['', '/'], true)) {
                        unset($removedIds[$id]); $changed = true; break;
                    }
                }
            }
        } while ($changed);
        foreach ($menus as $row) {
            if (isset($removedIds[$row['id']])) {
                $changes[] = ['table' => 'system_menus', 'id' => $row['id'], 'before' => $row, 'after' => null];
            }
        }
    }

    // Retired components may still be embedded in saved layouts; clean them in place.
    if (tableExists('diy')) {
        foreach (Db::name('diy')->lock(true)->select()->toArray() as $row) {
            $next = $row;
            foreach (['value', 'default_value'] as $field) {
                $value = json_decode($row[$field] ?? '', true);
                if (!is_array($value)) continue;
                $cleaned = \app\services\CoreStore::cleanDiy($value);
                if ($cleaned !== $value) $next[$field] = json_encode($cleaned, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            if ($next != $row) $changes[] = ['table' => 'diy', 'id' => $row['id'], 'before' => $row, 'after' => $next];
        }
    }
    if (tableExists('theme')) {
        foreach (Db::name('theme')->lock(true)->select()->toArray() as $row) {
            $next = $row;
            foreach ($row as $field => $encoded) {
                if (substr($field, -5) !== '_data') continue;
                $value = json_decode($encoded ?? '', true);
                if (!is_array($value)) continue;
                $cleaned = \app\services\CoreStore::cleanDiy($value);
                if ($cleaned !== $value) $next[$field] = json_encode($cleaned, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            if ($next != $row) $changes[] = ['table' => 'theme', 'id' => $row['id'], 'before' => $row, 'after' => $next];
        }
    }

    if (!$changes && !array_filter(RETIRED_TABLES, fn($t) => tableExists($t))) {
        Db::rollback();
        echo "Already migrated.\n";
        exit;
    }

    $handle = fopen($backup, 'x');
    if (!$handle) throw new RuntimeException('Backup exists or cannot be created.');
    chmod($backup, 0600);
    foreach (RETIRED_TABLES as $table) {
        if (tableExists($table)) $renamed[] = $table;
    }
    $payload = json_encode([
        'format' => BACKUP_FORMAT,
        'protected' => $fingerprint,
        'renamed' => $renamed,
        'changes' => $changes,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    if (fwrite($handle, $payload) !== strlen($payload) || !fflush($handle)) throw new RuntimeException('Backup write failed.');
    fclose($handle);

    foreach ($changes as $change) {
        if ($change['after'] === null) {
            Db::name($change['table'])->where('id', $change['id'])->delete();
        } else {
            Db::name($change['table'])->where('id', $change['id'])->update($change['after']);
        }
    }
    foreach ($renamed as $table) {
        Db::execute('RENAME TABLE `' . tableName($table) . '` TO `' . retiredTableName($table) . '`');
    }
    if ($fingerprint !== protectedFingerprint()) throw new RuntimeException('Protected data changed.');
    Db::commit();
    \crmeb\services\CacheService::clear();

    $strandedCsv = preg_replace('/\.json$/', '', $backup) . '-unreachable-balances.csv';
    if (array_sum(array_map('intval', $stranded)) > 0) {
        $fh = fopen($strandedCsv, 'w');
        chmod($strandedCsv, 0600);
        fputcsv($fh, ['summary']);
        fputcsv($fh, ['metric', 'users', 'total']);
        fputcsv($fh, ['now_money', $stranded['money_users'], $stranded['money_total']]);
        fputcsv($fh, ['integral', $stranded['integral_users'], $stranded['integral_total']]);
        fputcsv($fh, ['brokerage_price', $stranded['brokerage_users'], $stranded['brokerage_total']]);
        fputcsv($fh, []);
        fputcsv($fh, ['affected accounts']);
        fputcsv($fh, ['uid', 'nickname', 'phone', 'now_money', 'integral', 'brokerage_price']);
        foreach (strandedBalanceHolders() as $holder) {
            fputcsv($fh, [
                $holder['uid'], $holder['nickname'], $holder['phone'],
                $holder['now_money'], $holder['integral'], $holder['brokerage_price'],
            ]);
        }
        fclose($fh);
    }
    echo 'Applied: ' . count($changes) . ' row(s) removed, ' . count($renamed) . " table(s) renamed.\n";
    echo "Backup: {$backup}\n";
    echo "Unreachable balances exported for offline compensation (user columns keep their values).\n";
    echo "Run `finalize` after the acceptance window to drop the renamed tables.\n";
} catch (Throwable $error) {
    try {
        if (Db::connect()->getPdo() && Db::connect()->getPdo()->inTransaction()) Db::rollback();
    } catch (Throwable $ignored) {
        // the failure happened before the transaction opened
    }
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
