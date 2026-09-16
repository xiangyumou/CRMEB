<?php
declare(strict_types=1);
namespace Tests\Regression\Cases;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class CoreStoreMigrationTest extends RegressionTestCase
{
    public function testMigrationIsRepeatableAndRollbackRestoresConfiguration(): void
    {
        $before = Db::name('system_config')->order('id')->select()->toArray();
        $backup = tempnam(sys_get_temp_dir(), 'core-store-'); unlink($backup);
        $this->registerCleanup(function () use ($backup) { if (is_file($backup)) unlink($backup); });
        $cmd = 'php ' . escapeshellarg(CRMEB_TEST_ROOT . '/upgrade/core-store/migrate.php');
        exec($cmd . ' plan 2>&1', $plan, $status);
        self::assertSame(0, $status, implode("\n", $plan));
        self::assertSame($before, Db::name('system_config')->order('id')->select()->toArray());
        exec($cmd . ' apply ' . escapeshellarg($backup) . ' 2>&1', $apply, $status);
        self::assertSame(0, $status, implode("\n", $apply));
        self::assertFileExists($backup);
        try {
            $after = Db::name('system_config')->order('id')->select()->toArray();
            self::assertNotSame($before, $after);
            self::assertSame('0', Db::name('system_config')->where('menu_name','reward_money')->value('value'));
            self::assertSame('0', Db::name('system_config')->where('menu_name','reward_integral')->value('value'));
            self::assertSame(1, Db::name('system_config')->where('menu_name','customer_qrcode')->count());
            exec($cmd . ' apply ' . escapeshellarg($backup) . ' 2>&1', $repeat, $status);
            self::assertSame(0, $status, implode("\n", $repeat));
            self::assertSame($after, Db::name('system_config')->order('id')->select()->toArray());
        } finally {
            exec($cmd . ' rollback ' . escapeshellarg($backup) . ' 2>&1', $rollback, $status);
            self::assertSame(0, $status, implode("\n", $rollback));
        }
        self::assertSame($before, Db::name('system_config')->order('id')->select()->toArray());
    }
}
