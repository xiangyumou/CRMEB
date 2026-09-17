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
        $this->registerCleanup(function () {
            Db::execute('DROP TABLE IF EXISTS `eb_user_extract`');
            Db::execute('DROP TABLE IF EXISTS `eb_retired_user_extract`');
        });
        Db::name('user_extract')->insert(['uid' => 1, 'extract_price' => '10.00', 'status' => 2, 'add_time' => time()]);

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
        $report = json_decode($output, true);
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

        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertStringContainsString('Already migrated', $output);

        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertSame($beforeConfig, Db::name('system_config')->order('id')->select()->toArray());
        self::assertSame(1, (int)Db::name('user_extract')->count(), 'the retired table comes back with its rows');
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_retired_%'"));
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

        [$status, $output] = $this->runScript('finalize');
        self::assertSame(0, $status, $output);
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_retired_%'"));
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_user_extract'"));
    }

    public function testApplyRefusesWhileSettlementIsPending(): void
    {
        $this->seedRetiredData();
        Db::name('user_extract')->where('uid', 1)->update(['status' => 0]);

        [$status, $output] = $this->runScript('plan 2>/dev/null');
        self::assertSame(2, $status, $output);
        self::assertStringContainsString('withdrawal', $output);

        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(1, $status, $output);
        self::assertStringContainsString('Pending settlement', $output);
        self::assertFileDoesNotExist($backup);
    }
}
