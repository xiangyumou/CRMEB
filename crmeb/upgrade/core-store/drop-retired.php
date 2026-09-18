<?php
/**
 * Drop the retired feature data from an existing database.
 *
 * CLI only, backup path absolute and outside public/:
 *   php upgrade/core-store/drop-retired.php plan
 *   php upgrade/core-store/drop-retired.php apply /private/retired-backup.json
 *   php upgrade/core-store/drop-retired.php rollback /private/retired-backup.json [--force]
 *   php upgrade/core-store/drop-retired.php finalize --dump=/private/full-dump.sql [--yes]
 *
 * `apply` works in two phases, because MySQL commits implicitly on DDL:
 *   1. one transaction removes the retired settings, menus, timers, group data
 *      and saved layouts, carries the order-notice roster over, inserts the
 *      settings the retained code needs and verifies the protected tables are
 *      untouched;
 *   2. outside a transaction the retired tables are renamed to `eb_retired_*`.
 *      Each rename is written to the backup *before* it is executed, so a run
 *      killed halfway leaves an exact record of what to restore; a failure stops
 *      the run and prints the list.
 *
 * `rollback` restores the names and the removed rows, refusing to overwrite
 * records that changed after the migration. It fails hard when a renamed table
 * cannot be restored (usually because `finalize` already dropped it).
 *
 * `finalize` drops the renamed tables for good, and only with a mysqldump that
 * names every one of them plus an explicit confirmation.
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
umask(0077);
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
    'system_notice', 'system_notice_admin', 'system_sign_reward',
    'system_store', 'system_store_staff', 'system_user_level',
    'user_brokerage', 'user_brokerage_frozen', 'user_enter', 'user_extract',
    'user_friends', 'user_level', 'user_money', 'user_notice', 'user_notice_see',
    'user_recharge', 'user_sign', 'user_spread',
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
    // The customer-service chat is gone; contact is a QR code now.
    'customer_type', 'customer_url', 'customer_phone', 'customer_corpId', 'service_feedback',
];

/**
 * Config tabs that only held retired settings; their remaining rows go too.
 * The customer-service tab stays: the retained QR setting lives in it.
 */
const RETIRED_CONFIG_TABS = [9, 11, 28, 45, 63, 67, 72, 73, 74, 119, 126];

/**
 * Timer rows belonging to retired features. Matched on the exact mark: the
 * retired agents are gone from the runner, while `takeDelivery`, `clearPoster`
 * and the rest still run and must survive.
 */
const RETIRED_TIMER_MARKS = ['agentUnbind', 'liveProductStatus', 'liveRoomStatus', 'signRemind'];

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

/**
 * Retained menus that sit under a retired ancestor. They are moved under the
 * given retained menu instead of being left invisible behind a deleted
 * ancestor, or keeping the retired parent alive as a link to a dead page.
 */
const RETAINED_MENU_REPARENT = [
    '/setting/kefu_config' => '/setting',
    '/order/invoice' => '/order',
    '/finance/capital_flow' => '/finance',
    '/finance/billing_records' => '/finance',
];

/** Tables whose rows must survive untouched, reported by count and hash. */
const PROTECTED_TABLES = [
    'store_product', 'store_product_attr', 'store_product_attr_value',
    'store_product_attr_result', 'store_product_description', 'store_category',
    'system_attachment', 'store_order', 'store_order_cart_info', 'user',
];

/** Rows living inside shared tables that belong to retired features. */
const RETIRED_GROUP_DATA = ['routine_seckill_time', 'sign_day_num', 'user_recharge_quota', 'integral_shop_banner'];

/** Saved-layout rows pointing at a removed H5 page are pruned with the menu. */
const RETAINED_MENU_GROUP = 'routine_my_menus';

/**
 * Admin menus a fresh install ships that an older database never had. Without
 * them the retained feature is reachable by URL but invisible in the sidebar.
 * Each entry is keyed by `unique_auth`; the second element names the parent.
 */
const REQUIRED_MENUS = [
    // unique_auth => [menu_path, parent unique_auth ('' = root/parent menu), name, controller, action,
    //                 sort, auth_type, header, is_header, mark]
    'marketing-presell' => ['/marketing/presell/index', '/marketing', '预售管理', 'marketing.store_advance', '', 81, 1, 'marketing', 1, '预售管理'],
    'marketing-presell-presell_list' => ['/marketing/presell/presell_list', 'marketing-presell', '预售列表', 'marketing.store_advance', 'presellList', 0, 1, 'marketing', 0, '预售列表'],
    'marketing-presell-create' => ['/marketing/presell/create', 'marketing-presell', '添加预售', '', '', 0, 3, '', 0, '添加预售'],
    'advance-edit' => ['/', 'marketing-presell-presell_list', '编辑预售', '', '', 0, 3, '', 0, '编辑预售'],
    'advance-delete' => ['/', 'marketing-presell-presell_list', '删除预售', '', '', 0, 3, '', 0, '删除预售'],
];

/**
 * Config tabs the retained code reads. They are recreated when an old database
 * never had them, so the migrated schema matches a fresh install.
 */
const REQUIRED_CONFIG_TABS = [
    'kefu_config' => [0, '客服配置', 3, 0, 3421],
    'order_notice' => [113, '订单通知', 3, 0, 3424],
];

/**
 * Settings the retained code reads. Rows are inserted when missing; the values
 * here are the same defaults the install SQL ships.
 */
const REQUIRED_CONFIG = [
    'customer_qrcode' => [
        'tab' => 'kefu_config', 'type' => 'upload', 'input_type' => 'input', 'upload_type' => 1,
        'value' => '""', 'info' => '客服二维码', 'desc' => '未配置时隐藏客服入口', 'sort' => 0,
    ],
    'order_notice_admin_uids' => [
        'tab' => 'order_notice', 'type' => 'text', 'input_type' => 'input', 'upload_type' => 1,
        'value' => '""', 'info' => '订单通知管理员',
        'desc' => '填写用户UID，多个用英文逗号分隔；这些用户会收到订单通知并可使用移动端订单管理', 'sort' => 0,
    ],
];

function validIdentifier(string $name): bool
{
    return (bool)preg_match('/^[a-z0-9_]+$/', $name);
}

function tableName(string $table): string
{
    if (!validIdentifier($table)) throw new RuntimeException("Unsafe table name: {$table}");
    return config('database.connections.mysql.prefix') . $table;
}

function retiredTableName(string $table): string
{
    if (!validIdentifier($table)) throw new RuntimeException("Unsafe table name: {$table}");
    return config('database.connections.mysql.prefix') . RENAME_PREFIX . $table;
}

/** Probe an already-prefixed physical table name. */
function tableExistsRaw(string $full): bool
{
    if (!validIdentifier($full)) throw new RuntimeException("Unsafe table name: {$full}");
    return (bool)Db::query("SHOW TABLES LIKE '" . $full . "'");
}

function tableExists(string $table): bool
{
    return tableExistsRaw(tableName($table));
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
        || strpos($name, 'alipay_') === 0
        || strpos($name, 'ali_pay_') === 0
        || strpos($name, 'yue_pay_') === 0
        || strpos($name, 'offline_') === 0;
}

function isRetiredMenuPath(string $path): bool
{
    $normalized = '/' . ltrim($path, '/');
    foreach (RETIRED_MENU_PATHS as $prefix) {
        if ($normalized === $prefix || strpos($normalized, $prefix . '/') === 0) return true;
    }
    return false;
}

/**
 * Row-wise fingerprint of the protected tables, computed by the database so a
 * shop with millions of orders does not fill memory: SUM(CRC32(...)) over the
 * string form of every column is order independent, survives NULLs (they hash
 * as 0x00, which no text column can contain) and comes back as one scalar.
 */
function protectedFingerprint(): array
{
    $out = [];
    foreach (PROTECTED_TABLES as $table) {
        if (!tableExists($table)) continue;
        $columns = Db::query('SHOW COLUMNS FROM `' . tableName($table) . '`');
        $expressions = [];
        foreach ($columns as $column) {
            $name = (string)$column['Field'];
            if (!validIdentifier($name)) throw new RuntimeException("Unsafe column name: {$name}");
            $expressions[] = 'IFNULL(CAST(`' . $name . '` AS CHAR), 0x00)';
        }
        $row = Db::query(
            'SELECT COUNT(*) AS c, IFNULL(SUM(CRC32(CONCAT_WS(0x1f, ' . implode(', ', $expressions) . '))), 0) AS h'
            . ' FROM `' . tableName($table) . '`'
        );
        $out[$table] = ['count' => (int)$row[0]['c'], 'hash' => (string)$row[0]['h']];
    }
    return $out;
}

/** Settlement that must not be dropped silently: money or goods still owed. */
function pendingLiabilities(): array
{
    $pending = [];
    if (tableExists('user_extract')) {
        // -1 turned down, 0 waiting for review, 1 already paid out.
        $count = (int)Db::name('user_extract')->where('status', 0)->count();
        if ($count) $pending[] = "user_extract: {$count} withdrawal request(s) not settled";
    }
    if (tableExists('other_order')) {
        $count = (int)Db::name('other_order')->where('paid', 0)->where('is_del', 0)->count();
        if ($count) $pending[] = "other_order: {$count} unpaid member/recharge order(s)";
    }
    if (tableExists('store_integral_order')) {
        // 1 waiting to ship, 2 shipped and waiting to be received, 3 finished.
        $count = (int)Db::name('store_integral_order')->whereIn('status', [1, 2])->count();
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

/**
 * Refunds on retired pay types cannot be pushed back through the original
 * channel any more, so the operator has to settle them offline. Reported, not
 * blocking: the money is already with the shop.
 */
function offlineRefundOrders(): int
{
    if (!tableExists('store_order')) return 0;
    return (int)Db::name('store_order')->whereIn('pay_type', ['yue', 'offline'])
        ->where('refund_status', 1)->count();
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

/**
 * Which menu rows go away, and where the survivors under them move to.
 * Retired paths are removed. A retained menu whose ancestor chain is retired is
 * re-homed under the nearest retained menu that can show it (an orphan is
 * invisible in the sidebar even though its page still works). Permission and
 * hidden API rows of a removed menu disappear with it.
 */
function menuRemovalPlan(array $menus): array
{
    $byId = [];
    foreach ($menus as $menu) {
        $byId[(int)$menu['id']] = $menu;
    }

    $remove = [];
    foreach ($menus as $menu) {
        if (isRetiredMenuPath((string)$menu['menu_path'])) $remove[(int)$menu['id']] = true;
    }

    // Menus that must survive take the place of the retired ancestor.
    $reparent = [];
    foreach ($menus as $menu) {
        $id = (int)$menu['id'];
        if (isset($remove[$id])) continue;
        $pid = (int)$menu['pid'];
        if ($pid === 0 || !ancestorChainRetired($pid, $byId, $remove)) continue;
        $target = reparentTargetId((string)$menu['menu_path'], $byId, $remove);
        if ($target !== null) $reparent[$id] = $target;
    }

    // Who hangs under whom once the moved menus are accounted for.
    $children = [];
    $parentOf = [];
    foreach ($menus as $menu) {
        $id = (int)$menu['id'];
        $pid = $reparent[$id] ?? (int)$menu['pid'];
        $parentOf[$id] = $pid;
        $children[$pid][] = $id;
    }

    // Permission and hidden-form rows of a removed menu disappear with it.
    $emptyPaths = ['', '/'];
    do {
        $changed = false;
        foreach ($menus as $menu) {
            $id = (int)$menu['id'];
            if (isset($remove[$id]) || !in_array((string)$menu['auth_type'], ['2', '3'], true)) continue;
            if (!in_array((string)$menu['menu_path'], $emptyPaths, true)) continue;
            $parent = $parentOf[$id] ?? 0;
            if (isset($remove[$parent])) {
                $remove[$id] = true;
                $changed = true;
            }
        }
    } while ($changed);

    // Anything still hanging under a removed parent moves up to a usable one.
    foreach ($menus as $menu) {
        $id = (int)$menu['id'];
        if (isset($remove[$id]) || isset($reparent[$id])) continue;
        $pid = (int)$menu['pid'];
        if ($pid === 0 || !isset($remove[$pid])) continue;
        $reparent[$id] = usableAncestorId($pid, $byId, $remove);
    }

    return ['remove' => array_map('intval', array_keys($remove)), 'reparent' => $reparent];
}

/** Whether any menu in the parent chain is being removed. */
function ancestorChainRetired(int $pid, array $byId, array $remove, int $depth = 0): bool
{
    while ($pid !== 0 && $depth++ < 64) {
        if (isset($remove[$pid])) return true;
        $pid = isset($byId[$pid]) ? (int)$byId[$pid]['pid'] : 0;
    }
    return false;
}

/** The retained menu a surviving row should hang under, or null to leave it alone. */
function reparentTargetId(string $menuPath, array $byId, array $remove): ?int
{
    $path = '/' . ltrim(explode('?', $menuPath)[0], '/');
    foreach (RETAINED_MENU_REPARENT as $prefix => $parentPath) {
        if ($path !== $prefix && strpos($path, $prefix . '/') !== 0) continue;
        foreach ($byId as $candidate) {
            if ((string)$candidate['menu_path'] === $parentPath) return (int)$candidate['id'];
        }
    }
    return null;
}

/** Nearest ancestor that is a visible, retained menu; the root when there is none. */
function usableAncestorId(int $pid, array $byId, array $remove): int
{
    $guard = 0;
    while ($pid !== 0 && $guard++ < 64) {
        $menu = $byId[$pid] ?? null;
        if (!$menu) return 0;
        $visible = (string)$menu['auth_type'] === '1'
            && !in_array((string)$menu['menu_path'], ['', '/'], true);
        if ($visible && !isset($remove[$pid])) return $pid;
        $pid = (int)$menu['pid'];
    }
    return 0;
}

/** Ids of the saved order-notification roster that must survive the store_service rename. */
function inheritedRosterUids(): array
{
    if (!tableExists('store_service')) return [];
    $uids = Db::name('store_service')->where('status', 1)
        ->where(function ($query) {
            $query->where('notify', 1)->whereOr('customer', 1);
        })->column('uid');
    return array_values(array_unique(array_map('intval', $uids)));
}

/**
 * Record a row mutation, composing with an earlier change for the same row so
 * the drop keeps the original in `before` and the final state in `after`.
 * Without this, a later edit of a row that apply itself rewrote would be
 * applied against the pre-migration image and silently did nothing.
 */
function recordChange(array &$changes, string $table, int $id, ?array $before, ?array $after): void
{
    foreach ($changes as $index => $change) {
        if ($change['table'] !== $table || $change['id'] !== $id) continue;
        unset($changes[$index]);
        if ($change['before'] === null && $after === null) {
            // looked up after being added by this run and then removed again
            return;
        }
        if ($after === null) {
            // the row is going away; keep the original for rollback
            $changes[] = ['table' => $table, 'id' => $id, 'before' => $change['before'], 'after' => null];
            return;
        }
        $merged = $change;
        if ($merged['before'] === null) {
            // an added row, edited again before the transaction committed
            $merged['after'] = array_merge($merged['after'], $after);
        } else {
            // Only this writer's own edits may win: the row it read still holds
            // the pre-apply image, so copying its whole `after` would undo an
            // earlier writer's field.
            foreach (array_diff_assoc($after, $before ?? []) as $field => $value) {
                $merged['after'][$field] = $value;
            }
        }
        if ($merged['before'] != $merged['after']) $changes[] = $merged;
        return;
    }
    if ($before == $after) return;
    $changes[] = ['table' => $table, 'id' => $id, 'before' => $before, 'after' => $after];
}

/** The tab ids the retained settings need, keyed by eng_title. */
function requiredConfigTabIds(array $changes): array
{
    $tabs = [];
    if (tableExists('system_config_tab')) {
        // think-orm returns rows for a comma-separated field list, so name the
        // index column explicitly to get the id => eng_title shape.
        foreach (Db::name('system_config_tab')->column('eng_title', 'id') as $id => $eng) {
            $tabs[(string)$eng] = (int)$id;
        }
    }
    foreach ($changes as $change) {
        if ($change['table'] !== 'system_config_tab' || $change['after'] === null) continue;
        $tabs[(string)$change['after']['eng_title']] = (int)$change['id'];
    }
    return $tabs;
}

/** Write the backup atomically, with the mode umask(0077) already gives us. */
function writeBackup(string $path, array $payload): void
{
    $encoded = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $temp = $path . '.tmp';
    $handle = fopen($temp, 'x');
    if (!$handle) {
        $handle = fopen($temp, 'w');
        if (!$handle) throw new RuntimeException('Backup cannot be written.');
    }
    $written = fwrite($handle, $encoded);
    if ($written !== strlen($encoded) || !fflush($handle)) {
        fclose($handle);
        throw new RuntimeException('Backup write failed.');
    }
    fclose($handle);
    chmod($temp, 0600);
    if (!rename($temp, $path)) throw new RuntimeException('Backup rename failed.');
}

$mode = $argv[1] ?? 'plan';
$options = array_slice($argv, 2);
$flags = [];
$positional = [];
foreach ($options as $option) {
    if (strpos($option, '--') === 0) {
        $parts = explode('=', ltrim($option, '-'), 2);
        $flags[$parts[0]] = $parts[1] ?? true;
        continue;
    }
    $positional[] = $option;
}
$backup = $positional[0] ?? '';

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
        $dump = is_string($flags['dump'] ?? null) ? (string)$flags['dump'] : '';
        $pending = [];
        foreach (RETIRED_TABLES as $table) {
            if (tableExistsRaw(retiredTableName($table))) $pending[] = $table;
        }
        if (!$pending) {
            echo "Nothing to finalize.\n";
            exit;
        }
        if (!$dump) {
            throw new RuntimeException(
                "finalize drops data for good; pass --dump=<mysqldump.sql> with a fresh dump naming these "
                . count($pending) . " table(s):\n- " . implode("\n- ", $pending)
            );
        }
        if (!is_file($dump) || filesize($dump) === 0) {
            throw new RuntimeException("The dump {$dump} is missing or empty; nothing was dropped.");
        }
        $contents = (string)file_get_contents($dump);
        $missing = [];
        foreach ($pending as $table) {
            if (strpos($contents, retiredTableName($table)) === false) $missing[] = $table;
        }
        if ($missing) {
            throw new RuntimeException("The dump {$dump} does not contain:\n- " . implode("\n- ", $missing));
        }
        if (empty($flags['yes'])) {
            fwrite(STDOUT, 'Type "yes" to drop ' . count($pending) . " renamed table(s):\n");
            $answer = trim((string)fgets(STDIN));
            if (strtolower($answer) !== 'yes') {
                fwrite(STDERR, "Not confirmed; nothing was dropped.\n");
                exit(1);
            }
        }
        $dropped = 0;
        foreach ($pending as $table) {
            Db::execute('DROP TABLE `' . retiredTableName($table) . '`');
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

        // First make sure the renamed tables can actually come back.
        $unrecoverable = [];
        $restorable = [];
        foreach (array_reverse($saved['renamed']) as $table) {
            $renamed = retiredTableName($table);
            if (tableExistsRaw($renamed)) {
                if (tableExists($table)) {
                    throw new RuntimeException(
                        "Cannot restore {$table}: both eb_{$table} and eb_" . RENAME_PREFIX . "{$table} exist. "
                        . 'Run this step against the migrated database only.'
                    );
                }
                $restorable[] = $table;
                continue;
            }
            if (!tableExists($table)) {
                $unrecoverable[] = $table;
            }
        }
        if ($unrecoverable) {
            throw new RuntimeException(
                "Cannot restore " . count($unrecoverable) . " table(s) that are no longer present:\n- "
                . implode("\n- ", $unrecoverable)
                . "\nThey were dropped by finalize (or by hand); only a mysqldump restore brings them back."
            );
        }

        $current = protectedFingerprint();
        $drifted = [];
        foreach ($saved['protected'] ?? [] as $table => $expected) {
            if (!isset($current[$table])) { $drifted[] = $table . ' (missing)'; continue; }
            if ($current[$table]['count'] !== $expected['count'] || $current[$table]['hash'] !== $expected['hash']) {
                $drifted[] = $table;
            }
        }
        if ($drifted && empty($flags['force'])) {
            throw new RuntimeException(
                "Protected data changed since the backup was written:\n- " . implode("\n- ", $drifted)
                . "\nRows written after the migration are not part of the backup. Roll back during the "
                . "acceptance window, or pass --force to restore the names and removed rows anyway."
            );
        }
        if ($drifted) {
            fwrite(STDERR, "Warning: protected data changed since the backup; continuing because of --force:\n- "
                . implode("\n- ", $drifted) . "\n");
        }

        Db::startTrans();
        foreach ($restorable as $table) {
            Db::execute('RENAME TABLE `' . retiredTableName($table) . '` TO `' . tableName($table) . '`');
        }
        foreach (array_reverse($saved['changes']) as $change) {
            $table = Db::name($change['table']);
            $currentRow = $table->where('id', $change['id'])->find();
            if ($change['after'] === null) {
                // the row was deleted by apply; put the original back
                if ($currentRow) throw new RuntimeException('Concurrent changes: rollback refused.');
                $table->insert($change['before']);
                continue;
            }
            if ($change['before'] === null) {
                // the row was inserted by apply; take it away again
                if ($currentRow != $change['after']) throw new RuntimeException('Concurrent changes: rollback refused.');
                $table->where('id', $change['id'])->delete();
                continue;
            }
            if ($currentRow != $change['after']) throw new RuntimeException('Concurrent changes: rollback refused.');
            $table->where('id', $change['id'])->update($change['before']);
        }
        Db::commit();
        \crmeb\services\CacheService::clear();
        echo "Rollback complete.\n";
        exit;
    }

    $pending = pendingLiabilities();
    $offlineRefunds = offlineRefundOrders();
    $stranded = strandedBalances();
    $menus = tableExists('system_menus') ? Db::name('system_menus')->select()->toArray() : [];
    $menuPlan = menuRemovalPlan($menus);
    $timers = tableExists('system_timer') ? Db::name('system_timer')->select()->toArray() : [];
    $retiredTimers = [];
    foreach ($timers as $row) {
        if (in_array((string)$row['mark'], RETIRED_TIMER_MARKS, true)) $retiredTimers[(int)$row['id']] = (string)$row['mark'];
    }
    $retiredGids = [];
    if (tableExists('system_group') && tableExists('system_group_data')) {
        $retiredGids = Db::name('system_group')->whereIn('config_name', RETIRED_GROUP_DATA)->column('id');
    }
    $report = [
        'mode' => $mode,
        'pending_liabilities' => $pending,
        'offline_refund_orders' => $offlineRefunds,
        'unreachable_balances' => $stranded,
        'retired_tables' => [],
        'retired_tables_present' => 0,
        'retired_config_rows' => 0,
        'retired_config_tabs' => 0,
        'retired_menu_rows' => count($menuPlan['remove']),
        'retired_menu_reparented' => count($menuPlan['reparent']),
        'retired_timer_rows' => count($retiredTimers),
        'retired_timer_marks' => array_values($retiredTimers),
        'retired_group_data_rows' => 0,
        'protected' => protectedFingerprint(),
    ];
    foreach (RETIRED_TABLES as $table) {
        if (!tableExists($table)) continue;
        $report['retired_tables_present']++;
        $report['retired_tables'][$table] = (int)Db::name($table)->count();
    }
    if (tableExists('system_config')) {
        $retiredTabIds = RETIRED_CONFIG_TABS;
        foreach (Db::name('system_config')->select()->toArray() as $row) {
            if (configNameMatches((string)$row['menu_name']) || in_array((int)$row['config_tab_id'], $retiredTabIds, true)) {
                $report['retired_config_rows']++;
            }
        }
    }
    if (tableExists('system_config_tab')) {
        $report['retired_config_tabs'] = (int)Db::name('system_config_tab')->whereIn('id', RETIRED_CONFIG_TABS)->count();
    }
    if ($retiredGids) {
        $report['retired_group_data_rows'] = (int)Db::name('system_group_data')->whereIn('gid', $retiredGids)->count();
        if (tableExists('system_group')) {
            $report['retired_group_data_rows'] += (int)Db::name('system_group')->whereIn('config_name', RETIRED_GROUP_DATA)->count();
        }
    }

    if ($mode === 'plan') {
        echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        if ($retiredTimers) {
            fwrite(STDERR, "Timers removed by apply: " . implode(', ', array_unique(array_values($retiredTimers))) . "\n");
        }
        if ($offlineRefunds) {
            fwrite(STDERR, "Note: {$offlineRefunds} refunding historical balance/offline order(s); after apply they can only be refunded offline.\n");
        }
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

    Db::startTrans();
    $fingerprint = protectedFingerprint();
    $changes = [];
    $renamed = [];
    if (tableExists('system_menus')) {
        $menus = Db::name('system_menus')->lock(true)->select()->toArray();
        $menuPlan = menuRemovalPlan($menus);
    }

    // Settings the retained code reads are created before anything is dropped, so
    // an upgrade reaches the same schema a fresh install ships.
    $requiredTabIds = requiredConfigTabIds([]);
    foreach (REQUIRED_CONFIG_TABS as $engTitle => [$pid, $title, $type, $sort, $menusId]) {
        if (isset($requiredTabIds[$engTitle]) || !tableExists('system_config_tab')) continue;
        $template = Db::name('system_config_tab')->order('id')->find();
        if (!$template) throw new RuntimeException('system_config_tab is empty; cannot add the retained tabs.');
        $row = array_merge($template, [
            'id' => (int)Db::name('system_config_tab')->lock(true)->max('id') + 1,
            'pid' => $pid, 'title' => $title, 'eng_title' => $engTitle, 'status' => 1,
            'icon' => '', 'type' => $type, 'sort' => $sort, 'menus_id' => $menusId,
        ]);
        recordChange($changes, 'system_config_tab', (int)$row['id'], null, $row);
        $requiredTabIds[$engTitle] = (int)$row['id'];
    }
    if (tableExists('system_config')) {
        foreach (REQUIRED_CONFIG as $name => $definition) {
            if (!isset($requiredTabIds[$definition['tab']])) continue;
            $existing = Db::name('system_config')->where('menu_name', $name)->lock(true)->find();
            if ($existing) {
                // An older shop may hold the row on a tab that is going away (or
                // on none at all); the form only renders it from a live tab.
                $currentTab = (int)$existing['config_tab_id'];
                $tabIsRetired = in_array($currentTab, RETIRED_CONFIG_TABS, true)
                    || !Db::name('system_config_tab')->where('id', $currentTab)->count();
                if (!$tabIsRetired) continue;
                $next = $existing;
                $next['config_tab_id'] = $requiredTabIds[$definition['tab']];
                recordChange($changes, 'system_config', (int)$existing['id'], $existing, $next);
                continue;
            }
            $template = Db::name('system_config')->order('id')->find();
            if (!$template) throw new RuntimeException('system_config is empty; cannot add the retained settings.');
            $row = array_merge($template, [
                'id' => (int)Db::name('system_config')->lock(true)->max('id') + 1,
                'menu_name' => $name, 'type' => $definition['type'], 'input_type' => $definition['input_type'],
                'config_tab_id' => $requiredTabIds[$definition['tab']], 'parameter' => '',
                'upload_type' => $definition['upload_type'], 'required' => '', 'width' => ($name === 'customer_qrcode' ? 0 : 100),
                'high' => 0, 'value' => $definition['value'], 'info' => $definition['info'],
                'desc' => $definition['desc'], 'sort' => $definition['sort'], 'status' => 1,
                'level' => 0, 'link_id' => 0, 'link_value' => 0,
            ]);
            recordChange($changes, 'system_config', (int)$row['id'], null, $row);
        }
    }

    // The retired chat held the order roster: carry its members over to the
    // retained setting, merging with whatever is configured there already.
    $rosterUids = inheritedRosterUids();
    if ($rosterUids && tableExists('system_config')) {
        $existing = Db::name('system_config')->where('menu_name', 'order_notice_admin_uids')->lock(true)->find();
        if ($existing) {
            $raw = trim((string)$existing['value'], '"');
            $configured = array_filter(array_map('intval', $raw === '' ? [] : explode(',', $raw)));
            $merged = array_values(array_unique(array_merge($configured, $rosterUids)));
            if ($merged !== $configured) {
                $next = $existing;
                $next['value'] = json_encode(implode(',', $merged));
                recordChange($changes, 'system_config', (int)$existing['id'], $existing, $next);
            }
        }
    }

    if (tableExists('system_config')) {
        foreach (Db::name('system_config')->lock(true)->select()->toArray() as $row) {
            $retired = configNameMatches((string)$row['menu_name'])
                || in_array((int)$row['config_tab_id'], RETIRED_CONFIG_TABS, true);
            if (!$retired) continue;
            recordChange($changes, 'system_config', (int)$row['id'], $row, null);
        }
    }
    if (tableExists('system_config_tab')) {
        foreach (Db::name('system_config_tab')->whereIn('id', RETIRED_CONFIG_TABS)->lock(true)->select()->toArray() as $row) {
            recordChange($changes, 'system_config_tab', (int)$row['id'], $row, null);
        }
    }
    if (tableExists('system_timer')) {
        foreach (Db::name('system_timer')->lock(true)->select()->toArray() as $row) {
            if (!in_array((string)$row['mark'], RETIRED_TIMER_MARKS, true)) continue;
            recordChange($changes, 'system_timer', (int)$row['id'], $row, null);
        }
    }
    if (tableExists('system_group_data') && tableExists('system_group')) {
        $gids = Db::name('system_group')->whereIn('config_name', RETIRED_GROUP_DATA)->column('id');
        if ($gids) {
            foreach (Db::name('system_group_data')->whereIn('gid', $gids)->lock(true)->select()->toArray() as $row) {
                recordChange($changes, 'system_group_data', (int)$row['id'], $row, null);
            }
        }
        // Saved personal-center menus keep entries whose page no longer exists.
        $removedPages = json_decode((string)@file_get_contents(dirname(__DIR__, 2) . '/config/core_store_removed_pages.json'), true) ?: [];
        $menuGroupId = (int)Db::name('system_group')->where('config_name', RETAINED_MENU_GROUP)->value('id');
        if ($menuGroupId && $removedPages) {
            foreach (Db::name('system_group_data')->where('gid', $menuGroupId)->lock(true)->select()->toArray() as $row) {
                $value = json_decode((string)$row['value'], true);
                $url = ltrim((string)($value['url']['value'] ?? ''), '/');
                if ($url === '' || !in_array($url, $removedPages, true)) continue;
                recordChange($changes, 'system_group_data', (int)$row['id'], $row, null);
            }
        }
    }
    if (tableExists('system_group')) {
        foreach (Db::name('system_group')->whereIn('config_name', RETIRED_GROUP_DATA)->lock(true)->select()->toArray() as $row) {
            recordChange($changes, 'system_group', (int)$row['id'], $row, null);
        }
    }
    if (tableExists('system_menus')) {
        $menusById = [];
        foreach ($menus as $menu) {
            $menusById[(int)$menu['id']] = $menu;
        }
        // Menus a fresh install ships that this database never had; the sidebar
        // would otherwise hide features that are present and working.
        $byAuth = [];
        $byPath = [];
        foreach ($menus as $menu) {
            $byAuth[(string)$menu['unique_auth']] = $menu;
            $byPath['/' . ltrim((string)$menu['menu_path'], '/')] = $menu;
        }
        $nextId = (int)Db::name('system_menus')->lock(true)->max('id') + 1;
        $addedMenus = [];
        foreach (REQUIRED_MENUS as $uniqueAuth => $definition) {
            if (isset($byAuth[$uniqueAuth])) continue;
            [$menuPath, $parentKey, $name, $controller, $action, $sort, $authType, $header, $isHeader, $mark] = $definition;
            if (strpos($parentKey, '/') === 0) {
                $parent = $byPath[$parentKey] ?? null;
            } else {
                $parent = $byAuth[$parentKey] ?? ($addedMenus[$parentKey] ?? null);
            }
            $pid = $parent ? (int)$parent['id'] : 0;
            $template = $parent ?: Db::name('system_menus')->order('id')->find();
            if (!$template) throw new RuntimeException('system_menus is empty; cannot add the retained menus.');
            $row = array_merge($template, [
                'id' => $nextId++, 'pid' => $pid, 'icon' => '', 'menu_name' => $name, 'module' => 'admin',
                'controller' => $controller, 'action' => $action, 'api_url' => '', 'methods' => '',
                'params' => '[]', 'sort' => $sort, 'is_show' => 1, 'is_show_path' => 1, 'access' => 1,
                'menu_path' => $menuPath,
                'path' => $parent ? (string)$parent['path'] . ($parent['path'] !== '' ? '/' : '') . $parent['id'] : '',
                'auth_type' => $authType, 'header' => $header, 'is_header' => $isHeader,
                'unique_auth' => $uniqueAuth, 'is_del' => 0, 'mark' => $mark,
            ]);
            recordChange($changes, 'system_menus', (int)$row['id'], null, $row);
            $byAuth[$uniqueAuth] = $row;
            $addedMenus[$uniqueAuth] = $row;
            if ($menuPath !== '' && $menuPath !== '/') $byPath[$menuPath] = $row;
        }
    }
    if ($menusById) {
        foreach ($menuPlan['remove'] as $id) {
            if (!isset($menusById[$id])) continue;
            $row = $menusById[$id];
            recordChange($changes, 'system_menus', (int)$row['id'], $row, null);
        }
        // The customer-service page keeps its menu, but the tab it opened was
        // recreated under a new id, so the embedded path has to follow.
        $kefuTabId = $requiredTabIds['kefu_config'] ?? null;
        foreach ($menusById as $id => $row) {
            if (isset($menuPlan['remove'][$id]) || !$kefuTabId) continue;
            if (strpos('/' . ltrim((string)$row['menu_path'], '/'), '/setting/kefu_config') !== 0) continue;
            $next = $row;
            $next['menu_path'] = '/setting/kefu_config/2/' . $kefuTabId;
            recordChange($changes, 'system_menus', (int)$row['id'], $row, $next);
        }
        foreach ($menuPlan['reparent'] as $id => $pid) {
            if (!isset($menusById[$id])) continue;
            $row = $menusById[$id];
            if ((int)$row['pid'] === (int)$pid) continue;
            $next = $row;
            $next['pid'] = $pid;
            recordChange($changes, 'system_menus', (int)$row['id'], $row, $next);
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
            if ($next != $row) recordChange($changes, 'diy', (int)$row['id'], $row, $next);
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
            if ($next != $row) recordChange($changes, 'theme', (int)$row['id'], $row, $next);
        }
    }

    foreach (RETIRED_TABLES as $table) {
        if (tableExists($table)) $renamed[] = $table;
    }
    $changes = array_values(array_filter($changes, function ($change) {
        return $change['before'] != $change['after'];
    }));

    if (!$changes && !$renamed) {
        Db::rollback();
        echo "Already migrated.\n";
        exit;
    }

    if (is_file($backup)) {
        throw new RuntimeException(
            "The backup {$backup} already exists. Roll back with it, then apply again with a fresh path."
        );
    }

    $backupPayload = [
        'format' => BACKUP_FORMAT,
        'protected' => $fingerprint,
        'renamed' => [],
        'pending_rename' => $renamed,
        'changes' => $changes,
    ];
    writeBackup($backup, $backupPayload);

    foreach ($changes as $change) {
        if ($change['after'] === null) {
            Db::name($change['table'])->where('id', $change['id'])->delete();
        } elseif ($change['before'] === null) {
            // a row this migration adds: the retained settings of an upgraded shop
            Db::name($change['table'])->insert($change['after']);
        } else {
            Db::name($change['table'])->where('id', $change['id'])->update($change['after']);
        }
    }
    if ($fingerprint !== protectedFingerprint()) throw new RuntimeException('Protected data changed.');
    Db::commit();

    // Phase two: DDL commits implicitly, so each rename is recorded first and a
    // failure leaves the rest of the run to the operator.
    $done = [];
    foreach ($renamed as $table) {
        $backupPayload['renamed'][] = $table;
        $backupPayload['pending_rename'] = array_values(array_diff($renamed, $backupPayload['renamed']));
        writeBackup($backup, $backupPayload);
        try {
            Db::execute('RENAME TABLE `' . tableName($table) . '` TO `' . retiredTableName($table) . '`');
            $done[] = $table;
        } catch (Throwable $renameError) {
            $backupPayload['pending_rename'] = array_values(array_diff($renamed, $done));
            writeBackup($backup, $backupPayload);
            \crmeb\services\CacheService::clear();
            fwrite(STDERR, 'Renaming ' . $table . ' failed: ' . $renameError->getMessage() . "\n");
            fwrite(STDERR, 'Renamed so far (still recoverable): ' . ($done ? implode(', ', $done) : 'none') . "\n");
            fwrite(STDERR, "The settings, menus and timers are already removed. Run `rollback {$backup}` to restore them.\n");
            exit(4);
        }
    }
    $backupPayload['pending_rename'] = [];
    writeBackup($backup, $backupPayload);
    \crmeb\services\CacheService::clear();

    $strandedCsv = preg_replace('/\.json$/', '', $backup) . '-unreachable-balances.csv';
    $exportError = null;
    if (array_sum(array_map('intval', $stranded)) > 0) {
        try {
            $fh = fopen($strandedCsv, 'x');
            if (!$fh) throw new RuntimeException('the export already exists');
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
        } catch (Throwable $exportFailure) {
            $exportError = $exportFailure->getMessage();
        }
    }

    echo 'Applied: ' . count($changes) . ' row(s) changed, ' . count($renamed) . " table(s) renamed.\n";
    echo "Backup: {$backup}\n";
    if ($exportError) {
        fwrite(STDERR, "The migration finished, but exporting the unreachable balances to {$strandedCsv} failed: {$exportError}\n");
        fwrite(STDERR, "Re-run the export by hand before compensating customers.\n");
        exit(3);
    }
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
