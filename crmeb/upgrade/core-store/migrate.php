<?php
/** Run only against a verified database copy first. No schema or asset deletion. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__, 2) . '/vendor/autoload.php';
$app = new think\App(dirname(__DIR__, 2));
$app->initialize();
use think\facade\Db;
use app\services\CoreStore;

$mode = $argv[1] ?? 'plan';
$backup = $argv[2] ?? '';
if (!in_array($mode, ['plan', 'apply', 'rollback'], true) || ($mode !== 'plan' && !$backup)) {
    fwrite(STDERR, "Usage: php upgrade/core-store/migrate.php plan|apply|rollback [absolute-backup.json]\n"); exit(1);
}
if ($backup && ($backup[0] !== '/' || strpos(realpath(dirname($backup)) . '/', realpath(public_path()) . '/') === 0)) {
    fwrite(STDERR, "Backup must be an absolute path outside public/.\n"); exit(1);
}
$removedPages = json_decode(file_get_contents(dirname(__DIR__, 2) . '/config/core_store_removed_pages.json'), true);
function protectedFingerprint() {
    $out = [];
    foreach (['store_product','store_product_attr','store_product_attr_value','store_product_attr_result','store_product_description','store_category','system_attachment'] as $table) {
        $rows = Db::name($table)->select()->toArray();
        $encoded = array_map(function ($row) { ksort($row); return json_encode($row); }, $rows);
        sort($encoded, SORT_STRING);
        $out[$table] = ['count' => count($rows), 'sha256' => hash('sha256', implode("\n", $encoded))];
    }
    return $out;
}
try {
    Db::startTrans();
    // Fail closed on transactional history, regardless of client-side assumptions.
    foreach (['store_order', 'user_recharge', 'user_extract', 'other_order'] as $table) {
        if (Db::name($table)->count()) throw new RuntimeException("Transactional records in $table; migration stopped.");
    }
    if (Db::name('user')->where('now_money', '<>', 0)->count() || Db::name('user')->where('brokerage_price', '<>', 0)->count()) {
        throw new RuntimeException('Existing balance or commission; migration stopped.');
    }
    if ($mode === 'rollback') {
        $saved = json_decode(file_get_contents($backup), true, 512, JSON_THROW_ON_ERROR);
        if (($saved['format'] ?? '') !== 'core-store-v1') throw new RuntimeException('Invalid backup format.');
        foreach (array_reverse($saved['changes']) as $change) {
            $current = Db::name($change['table'])->where('id', $change['id'])->lock(true)->find();
            if ($current == $change['before']) continue;
            if ($current != $change['after']) throw new RuntimeException('Concurrent changes: rollback refused.');
            if ($change['before'] === null) Db::name($change['table'])->where('id', $change['id'])->delete();
            else Db::name($change['table'])->where('id', $change['id'])->update($change['before']);
        }
        Db::commit();
        \crmeb\services\CacheService::clear();
        echo "Rollback complete.\n"; exit;
    }
    $fingerprint = protectedFingerprint();
    $changes = [];
    $disabled = CoreStore::DISABLED_CONFIG;
    foreach (Db::name('system_config')->lock(true)->select()->toArray() as $row) {
        $next = $row; $name = $row['menu_name'];
        if (array_key_exists($name, $disabled)) { $next['value'] = json_encode($disabled[$name]); $next['status'] = 0; }
        if (in_array($name, ['customer_phone','customer_type','customer_url','customer_corpId'], true)) $next['status'] = 0;
        if ($next != $row) $changes[] = ['table'=>'system_config','id'=>$row['id'],'before'=>$row,'after'=>$next];
    }
    if (!Db::name('system_config')->where('menu_name','customer_qrcode')->count()) {
        $sample = Db::name('system_config')->where('menu_name','customer_phone')->find();
        if (!$sample) throw new RuntimeException('Missing customer configuration group.');
        $sample['id'] = (int)Db::name('system_config')->max('id') + 1;
        $sample = array_merge($sample, ['menu_name'=>'customer_qrcode','type'=>'upload','upload_type'=>1,'value'=>'""','info'=>'客服二维码','desc'=>'未配置时隐藏客服入口','status'=>1,'level'=>0,'link_id'=>0,'link_value'=>0]);
        $changes[] = ['table'=>'system_config','id'=>$sample['id'],'before'=>null,'after'=>$sample];
    }
    $menus = Db::name('system_menus')->lock(true)->select()->toArray();
    $ids = array_fill_keys(\app\services\CoreStoreAdmin::removedMenuIds($menus), true);
    foreach ($menus as $row) {
        if (isset($ids[$row['id']])) {
            $next = array_merge($row, ['is_show'=>0,'is_show_path'=>0,'access'=>0,'is_del'=>1]);
            if ($row != $next) $changes[] = ['table'=>'system_menus','id'=>$row['id'],'before'=>$row,'after'=>$next];
        }
    }
    foreach (Db::name('diy')->lock(true)->select()->toArray() as $row) {
        $next = $row;
        foreach (['value', 'default_value'] as $field) {
            $value = json_decode($row[$field] ?? '', true);
            if (!is_array($value)) continue;
            $cleaned = CoreStore::cleanDiy($value);
            if ($cleaned !== $value) $next[$field] = json_encode($cleaned, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        if ($next != $row) {
            $next['version'] = 'core-' . substr(hash('sha256', $next['value']), 0, 16);
            $next['update_time'] = time();
            $changes[] = ['table'=>'diy','id'=>$row['id'],'before'=>$row,'after'=>$next];
        }
    }
    foreach (Db::name('system_group_data')->lock(true)->select()->toArray() as $row) {
        $value = json_decode($row['value'] ?? '', true);
        if (!is_array($value)) continue;
        $cleaned = CoreStore::cleanDiy($value);
        if ($cleaned !== $value) {
            $next = $row;
            $next['value'] = json_encode($cleaned, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $changes[] = ['table'=>'system_group_data','id'=>$row['id'],'before'=>$row,'after'=>$next];
        }
    }
    foreach (Db::name('theme')->lock(true)->select()->toArray() as $row) {
        $next = $row;
        foreach ($row as $field => $encoded) {
            if (substr($field, -5) !== '_data') continue;
            $value = json_decode($encoded ?? '', true);
            if (!is_array($value)) continue;
            $cleaned = CoreStore::cleanDiy($value);
            if ($cleaned !== $value) $next[$field] = json_encode($cleaned, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        if ($next != $row) {
            $next['version'] = 'core-' . substr(hash('sha256', json_encode($next)), 0, 16);
            $next['up_time'] = time();
            $changes[] = ['table'=>'theme','id'=>$row['id'],'before'=>$row,'after'=>$next];
        }
    }
    if ($mode === 'plan') { Db::rollback(); echo json_encode(['changes'=>count($changes),'protected'=>$fingerprint], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n"; exit; }
    if (!$changes) { Db::rollback(); echo "Already migrated.\n"; exit; }
    $handle = fopen($backup, 'x');
    if (!$handle) throw new RuntimeException('Backup exists or cannot be created.');
    chmod($backup, 0600);
    $payload = json_encode(['format'=>'core-store-v1','protected'=>$fingerprint,'changes'=>$changes], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    if (fwrite($handle, $payload) !== strlen($payload) || !fflush($handle)) throw new RuntimeException('Backup write failed.');
    fclose($handle);
    foreach ($changes as $change) {
        if ($change['before'] === null) Db::name($change['table'])->insert($change['after']);
        else Db::name($change['table'])->where('id',$change['id'])->update($change['after']);
    }
    if ($fingerprint !== protectedFingerprint()) throw new RuntimeException('Protected data changed.');
    Db::commit();
    \crmeb\services\CacheService::clear();
    echo 'Applied ' . count($changes) . " changes; protected records unchanged.\n";
} catch (Throwable $error) {
    Db::rollback(); fwrite(STDERR, $error->getMessage() . "\n"); exit(1);
}
