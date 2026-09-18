<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * The drop script runs against a database that already holds real orders and users.
 * It must plan read-only, refuse while settlement is pending, apply reversibly,
 * repeat without changes, and roll everything back.
 */
final class CoreStoreMigrationTest extends RegressionTestCase
{
    private function script(): string
    {
        return 'php ' . escapeshellarg(CRMEB_TEST_ROOT . '/upgrade/core-store/drop-retired.php');
    }

    private function runScript(string $args): array
    {
        exec($this->script() . ' ' . $args . ' 2>&1', $output, $status);
        return [$status, implode("\n", $output)];
    }

    /** Plan prints its JSON among advisory notes; take the object itself. */
    private function parseReport(string $output): ?array
    {
        $start = strpos($output, '{');
        $end = strrpos($output, '}');
        if ($start === false || $end === false || $end < $start) return null;
        $report = json_decode(substr($output, $start, $end - $start + 1), true);
        return is_array($report) ? $report : null;
    }

    /** Seed the data the migration is expected to remove: a retired table and settings. */
    private function seedRetiredData(): void
    {
        Db::execute('CREATE TABLE IF NOT EXISTS `eb_user_extract` (
            `id` int NOT NULL AUTO_INCREMENT,
            `uid` int NOT NULL DEFAULT 0,
            `extract_price` decimal(10,2) NOT NULL DEFAULT 0,
            `extract_fee` decimal(10,2) NOT NULL DEFAULT 0,
            `status` tinyint NOT NULL DEFAULT 0,
            `add_time` int NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`))');
        Db::execute('CREATE TABLE IF NOT EXISTS `eb_store_service` (
            `id` int NOT NULL AUTO_INCREMENT,
            `uid` int NOT NULL DEFAULT 0,
            `status` tinyint NOT NULL DEFAULT 0,
            `notify` tinyint NOT NULL DEFAULT 0,
            `customer` tinyint NOT NULL DEFAULT 0,
            PRIMARY KEY (`id`))');
        Db::execute('CREATE TABLE IF NOT EXISTS `eb_store_seckill` (
            `id` int NOT NULL AUTO_INCREMENT,
            PRIMARY KEY (`id`))');
        $this->registerCleanup(function () {
            foreach (['user_extract', 'store_service', 'store_seckill'] as $table) {
                Db::execute('DROP TABLE IF EXISTS `eb_' . $table . '`');
                Db::execute('DROP TABLE IF EXISTS `eb_retired_' . $table . '`');
            }
        });
        // 1 is "already paid out" in the enum, not "pending": a shop with history
        // must not be blocked by withdrawals that finished long ago.
        Db::name('user_extract')->insert(['uid' => 1, 'extract_price' => '10.00', 'status' => 1, 'add_time' => time()]);
        // One grantee of each kind: only `notify` rows used to be carried over.
        Db::name('store_service')->insert(['uid' => 1, 'status' => 1, 'notify' => 1, 'customer' => 0]);
        Db::name('store_service')->insert(['uid' => 100, 'status' => 1, 'notify' => 0, 'customer' => 1]);
        Db::name('store_service')->insert(['uid' => 101, 'status' => 0, 'notify' => 1, 'customer' => 1]);

        if (!Db::name('system_config')->where('menu_name', 'brokerage_func_status')->count()) {
            $sample = Db::name('system_config')->order('id')->find();
            unset($sample['id']);
            $sample['menu_name'] = 'brokerage_func_status';
            $sample['value'] = json_encode(1);
            $id = (int)Db::name('system_config')->insertGetId($sample);
            $this->registerCleanup(function () use ($id) {
                Db::name('system_config')->where('id', $id)->delete();
            });
        }
    }

    public function testPlanIsReadOnlyAndReportsRetiredData(): void
    {
        $this->seedRetiredData();
        $before = Db::name('system_config')->order('id')->select()->toArray();

        [$status, $output] = $this->runScript('plan');
        self::assertSame(0, $status, $output);
        $report = $this->parseReport($output);
        self::assertIsArray($report, $output);
        self::assertSame(1, $report['retired_tables_present']);
        self::assertArrayHasKey('user_extract', $report['retired_tables']);
        self::assertSame(1, $report['retired_tables']['user_extract']);
        self::assertGreaterThanOrEqual(1, $report['retired_config_rows']);
        self::assertSame($before, Db::name('system_config')->order('id')->select()->toArray());
    }

    public function testApplyRenamesTablesRemovesSeedsAndRollbackRestoresThem(): void
    {
        $this->seedRetiredData();
        $this->cleanupCreatedSettings(['order_notice_admin_uids', 'customer_qrcode']);
        $beforeConfig = Db::name('system_config')->order('id')->select()->toArray();
        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
        });

        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertFileExists($backup);
        self::assertSame(0, (int)Db::name('system_config')->where('menu_name', 'brokerage_func_status')->count(), 'retired settings must be gone');
        self::assertNotSame($beforeConfig, Db::name('system_config')->order('id')->select()->toArray());
        self::assertNotEmpty(Db::query("SHOW TABLES LIKE 'eb_retired_user_extract'"), 'tables are renamed, not dropped');

        // The roster keeps everyone who could receive or manage orders, not just
        // the notify flag, and merges with what the setting already held.
        $roster = json_decode((string)Db::name('system_config')->where('menu_name', 'order_notice_admin_uids')->value('value'), true);
        $uids = array_map('intval', explode(',', (string)$roster));
        self::assertContains(1, $uids, 'notify=1 rows are carried over');
        self::assertContains(100, $uids, 'customer=1 rows are carried over');
        self::assertNotContains(101, $uids, 'inactive rows are not');

        // The settings the retained code reads exist after the upgrade.
        self::assertSame(1, (int)Db::name('system_config')->where('menu_name', 'customer_qrcode')->count());

        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(1, $status, $output);
        self::assertStringContainsString('already exists', $output, 'a second apply must not overwrite the backup');

        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup . '.2'));
        self::assertSame(0, $status, $output);
        self::assertStringContainsString('Already migrated', $output);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup . '.2')) unlink($backup . '.2');
        });

        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertSame($beforeConfig, Db::name('system_config')->order('id')->select()->toArray());
        self::assertSame(1, (int)Db::name('user_extract')->count(), 'the retired table comes back with its rows');
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_retired_%'"));
    }

    /**
     * `status` in `eb_user_extract` is -1 refused, 0 waiting, 1 paid out. Reading
     * 1 as pending blocked apply on every shop that ever paid a withdrawal.
     */
    public function testCompletedWithdrawalsDoNotBlockApply(): void
    {
        $this->seedRetiredData();
        [$status, $output] = $this->runScript('plan');
        self::assertSame(0, $status, $output);

        Db::name('user_extract')->where('uid', 1)->update(['status' => 0]);
        [$status, $output] = $this->runScript('plan');
        self::assertSame(2, $status, $output);
        self::assertStringContainsString('withdrawal', $output);
    }

    public function testFinalizeRefusesWithoutADump(): void
    {
        $this->seedRetiredData();
        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
            Db::execute('DROP TABLE IF EXISTS `eb_retired_user_extract`');
        });

        [$status, $output] = $this->runScript('finalize');
        self::assertSame(1, $status, $output);
        self::assertStringContainsString('--dump', $output);
        self::assertNotEmpty(Db::query("SHOW TABLES LIKE 'eb_retired_user_extract'"), 'nothing is dropped without a dump');
    }

    /** After finalize the data is gone, so rollback must fail loudly, not report success. */
    public function testRollbackAfterFinalizeFails(): void
    {
        $this->seedRetiredData();
        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
        });

        $dump = $backup . '.sql';
        file_put_contents($dump, '-- ' . implode("\n-- ", array_map(static function ($table) {
            return 'eb_retired_' . $table;
        }, ['user_extract', 'store_service', 'store_seckill'])));
        [$status, $output] = $this->runScript('finalize --dump=' . escapeshellarg($dump) . ' --yes');
        self::assertSame(0, $status, $output);

        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(1, $status, $output);
        self::assertStringContainsString('mysqldump', $output);
    }

    public function testFinalizeDropsTheRenamedTables(): void
    {
        $this->seedRetiredData();
        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertFileExists($backup);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
        });

        $dump = $backup . '.sql';
        file_put_contents($dump, '-- ' . implode("\n-- ", array_map(static function ($table) {
            return 'eb_retired_' . $table;
        }, ['user_extract', 'store_service', 'store_seckill'])));
        [$status, $output] = $this->runScript('finalize --dump=' . escapeshellarg($dump) . ' --yes');
        self::assertSame(0, $status, $output);
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_retired_%'"));
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_user_extract'"));
    }

    /**
     * Build a full order row from the live schema so the insert only has to
     * supply the columns the case cares about. The suite's database carries no
     * orders to copy from.
     */
    private function orderRow(array $overrides): array
    {
        $row = [];
        foreach (Db::query('SHOW FULL COLUMNS FROM eb_store_order') as $column) {
            $name = $column['Field'];
            if ($column['Key'] === 'PRI') continue;
            $type = strtolower($column['Type']);
            $numeric = strpos($type, 'int') !== false || strpos($type, 'decimal') !== false
                || strpos($type, 'float') !== false || strpos($type, 'double') !== false;
            $row[$name] = $numeric ? 0 : '';
            if ($column['Null'] === 'YES') $row[$name] = null;
            if ($column['Default'] !== null) $row[$name] = $column['Default'];
        }
        return array_merge($row, $overrides);
    }

    public function testPlanReportsUnreachableBalances(): void
    {
        $this->seedRetiredData();
        $uid = (int)Db::name('user')->order('uid')->value('uid');
        $before = Db::name('user')->where('uid', $uid)->find();
        $this->registerCleanup(function () use ($uid, $before) {
            Db::name('user')->where('uid', $uid)->update([
                'now_money' => $before['now_money'],
                'integral' => $before['integral'],
                'brokerage_price' => $before['brokerage_price'],
            ]);
        });
        Db::name('user')->where('uid', $uid)->update(['now_money' => 42.5, 'integral' => 7, 'brokerage_price' => 3.25]);

        [$status, $output] = $this->runScript('plan');
        self::assertSame(0, $status, $output);
        $report = $this->parseReport($output);
        self::assertIsArray($report, $output);
        // A field-restricted find() without a where clause returns empty in
        // think-orm, which used to report zero balances for a funded database.
        self::assertGreaterThanOrEqual(1, $report['unreachable_balances']['money_users']);
        self::assertGreaterThanOrEqual(42.5, (float)$report['unreachable_balances']['money_total']);
        self::assertGreaterThanOrEqual(7, (int)$report['unreachable_balances']['integral_total']);
    }

    public function testPaidSelfPickupOrderBlocksApply(): void
    {
        $this->seedRetiredData();
        $uid = (int)Db::name('user')->order('uid')->value('uid');
        $this->registerCleanup(function () use ($uid) {
            Db::name('store_order')->where('uid', $uid)->where('unique', 'pickup-liability')->delete();
        });
        Db::name('store_order')->insert($this->orderRow([
            'order_id' => 'SO-PICKUP-CASE', 'unique' => 'pickup-liability', 'uid' => $uid,
            'shipping_type' => 2, 'paid' => 1, 'status' => 0, 'is_del' => 0, 'refund_status' => 0,
            'store_id' => 1, 'verify_code' => '000111', 'add_time' => time(),
        ]));

        [$status, $output] = $this->runScript('plan');
        self::assertSame(2, $status, $output);
        self::assertStringContainsString('self-pickup', $output);
    }

    public function testApplyRefusesWhileSettlementIsPending(): void
    {
        $this->seedRetiredData();
        Db::name('user_extract')->where('uid', 1)->update(['status' => 0]);

        [$status, $output] = $this->runScript('plan');
        self::assertSame(2, $status, $output);
        self::assertStringContainsString('withdrawal', $output);

        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(1, $status, $output);
        self::assertStringContainsString('Pending settlement', $output);
        self::assertFileDoesNotExist($backup);
    }
}
