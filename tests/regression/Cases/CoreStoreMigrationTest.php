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

    /**
     * The five notice tables count as retired by decision; the rest stand in for
     * the longer list. Every one of them only has to be renamed, so a minimal
     * schema is enough.
     */
    private const RETIRED_FIXTURES = [
        'user_extract' => '`uid` int NOT NULL DEFAULT 0, `extract_price` decimal(10,2) NOT NULL DEFAULT 0,
            `extract_fee` decimal(10,2) NOT NULL DEFAULT 0, `status` tinyint NOT NULL DEFAULT 0,
            `add_time` int NOT NULL DEFAULT 0',
        'store_service' => '`uid` int NOT NULL DEFAULT 0, `status` tinyint NOT NULL DEFAULT 0,
            `notify` tinyint NOT NULL DEFAULT 0, `customer` tinyint NOT NULL DEFAULT 0',
        'store_seckill' => '`title` varchar(64) NOT NULL DEFAULT \'\'',
        'system_notice' => '`uid` int NOT NULL DEFAULT 0, `content` varchar(64) NOT NULL DEFAULT \'\'',
        'system_notice_admin' => '`admin_id` int NOT NULL DEFAULT 0, `content` varchar(64) NOT NULL DEFAULT \'\'',
        'user_notice' => '`uid` int NOT NULL DEFAULT 0, `content` varchar(64) NOT NULL DEFAULT \'\'',
        'user_notice_see' => '`uid` int NOT NULL DEFAULT 0, `notice_id` int NOT NULL DEFAULT 0',
        'user_enter' => '`uid` int NOT NULL DEFAULT 0, `add_time` int NOT NULL DEFAULT 0',
    ];

    private const RETIRED_TIMER_MARK = 'signRemind';
    private const RETIRED_MENU_PATH = '/marketing/store_seckill';
    private const RETIRED_GROUP = 'sign_day_num';

    /** Seed the data the migration is expected to remove: tables, seeds and settings. */
    private function seedRetiredData(): void
    {
        foreach (self::RETIRED_FIXTURES as $table => $columns) {
            Db::execute('CREATE TABLE IF NOT EXISTS `eb_' . $table . '` (
                `id` int NOT NULL AUTO_INCREMENT, ' . $columns . ', PRIMARY KEY (`id`))');
        }
        $this->registerCleanup(function () {
            foreach (array_keys(self::RETIRED_FIXTURES) as $table) {
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
        Db::name('store_seckill')->insert(['title' => 'retired seckill']);
        Db::name('system_notice')->insert(['uid' => 1, 'content' => 'retired notice']);
        Db::name('user_notice')->insert(['uid' => 1, 'content' => 'retired user notice']);

        $this->seedRetiredSeeds();

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

    /**
     * Seeds outside the retired tables: a menu, a timer and two group rows. These
     * live in shared tables, so they are the ones a rule change can quietly stop
     * removing — or start removing when it should not.
     */
    private function seedRetiredSeeds(): void
    {
        $timerId = (int)Db::name('system_timer')->insertGetId([
            'name' => '积分签到提醒', 'mark' => self::RETIRED_TIMER_MARK, 'content' => 'retired timer',
            'type' => 2, 'week' => 1, 'day' => 1, 'hour' => 1, 'minute' => 0, 'second' => 0,
            'last_execution_time' => 0, 'next_execution_time' => 0, 'add_time' => time(), 'is_del' => 0, 'is_open' => 1,
        ]);
        $menu = Db::name('system_menus')->order('id')->find();
        unset($menu['id']);
        $menu['pid'] = 0;
        $menu['menu_name'] = '秒杀管理';
        $menu['menu_path'] = self::RETIRED_MENU_PATH;
        $menu['unique_auth'] = 'regression-retired-menu';
        $menu['auth_type'] = 1;
        $menuId = (int)Db::name('system_menus')->insertGetId($menu);

        $groupId = (int)Db::name('system_group')->insertGetId([
            'cate_id' => 0, 'name' => '签到设置', 'info' => 'retired group',
            'config_name' => self::RETIRED_GROUP, 'fields' => '[]',
        ]);
        $groupDataId = (int)Db::name('system_group_data')->insertGetId([
            'gid' => $groupId, 'value' => json_encode(['day' => ['value' => '7']]), 'add_time' => time(),
        ]);

        // A saved personal-centre menu entry pointing at a page the cleanup
        // registry lists as removed.
        $removedPages = json_decode((string)file_get_contents(CRMEB_TEST_ROOT . '/config/core_store_removed_pages.json'), true) ?: [];
        $menuGroupId = (int)Db::name('system_group')->where('config_name', 'routine_my_menus')->value('id');
        $deadLinkId = 0;
        if ($menuGroupId && $removedPages) {
            $deadLinkId = (int)Db::name('system_group_data')->insertGetId([
                'gid' => $menuGroupId,
                'value' => json_encode(['name' => ['value' => '砍价'], 'url' => ['value' => $removedPages[0]]]),
                'add_time' => time(),
            ]);
        }

        // A permission row of a retired feature hanging under a retained parent,
        // plus a notification template and a custom event with no sender left.
        // pid 0 keeps the unique_auth rule (not the removed-parent cascade) as
        // the only thing that can catch this row.
        $permissionMenu = $menu;
        $permissionMenu['pid'] = 0;
        $permissionMenu['menu_name'] = '赠送会员';
        $permissionMenu['menu_path'] = '';
        $permissionMenu['unique_auth'] = 'user-give_level_time';
        $permissionMenu['auth_type'] = 2;
        $permissionId = (int)Db::name('system_menus')->insertGetId($permissionMenu);

        $notificationTemplate = Db::name('system_notification')->order('id')->find();
        unset($notificationTemplate['id']);
        $notificationTemplate['mark'] = 'recharge_success';
        $notificationId = (int)Db::name('system_notification')->insertGetId($notificationTemplate);

        $eventDataId = (int)Db::name('system_event_data')->insertGetId([
            'label' => '用户提现', 'value' => 'user_extract', 'data' => '{}',
        ]);

        $this->registerCleanup(function () use ($timerId, $menuId, $groupId, $groupDataId, $deadLinkId, $permissionId, $notificationId, $eventDataId) {
            Db::name('system_group_data')->whereIn('id', array_filter([$groupDataId, $deadLinkId]))->delete();
            Db::name('system_group')->where('id', $groupId)->delete();
            Db::name('system_menus')->whereIn('id', [$menuId, $permissionId])->delete();
            Db::name('system_timer')->where('id', $timerId)->delete();
            Db::name('system_notification')->where('id', $notificationId)->delete();
            Db::name('system_event_data')->where('id', $eventDataId)->delete();
        });

        $this->seededSeedIds = [$timerId, $menuId, $groupId, $groupDataId, $deadLinkId, $permissionId, $notificationId, $eventDataId];
    }

    /** @var int[] */
    private $seededSeedIds = [];

    /**
     * Settings and tabs apply creates for a shop that never had them; removing
     * them again keeps the suite repeatable and leaves the seeded schema alone.
     */
    private function cleanupCreatedSettings(array $names): void
    {
        $this->registerCleanup(function () use ($names) {
            foreach ($names as $name) {
                $row = Db::name('system_config')->where('menu_name', $name)->find();
                if ($row) Db::name('system_config')->where('id', $row['id'])->delete();
            }
            foreach (Db::name('system_config_tab')->where('eng_title', 'order_notice')->select()->toArray() as $tab) {
                Db::name('system_config_tab')->where('id', $tab['id'])->delete();
            }
        });
    }

    public function testPlanIsReadOnlyAndReportsRetiredData(): void
    {
        $this->seedRetiredData();
        $before = Db::name('system_config')->order('id')->select()->toArray();

        [$status, $output] = $this->runScript('plan');
        self::assertSame(0, $status, $output);
        $report = $this->parseReport($output);
        self::assertIsArray($report, $output);
        self::assertSame(count(self::RETIRED_FIXTURES), $report['retired_tables_present']);
        self::assertArrayHasKey('user_extract', $report['retired_tables']);
        self::assertSame(1, $report['retired_tables']['user_extract']);
        self::assertSame(1, $report['retired_tables']['system_notice']);
        self::assertSame(0, $report['retired_tables']['user_enter'], 'an empty retired table still counts as present');
        self::assertGreaterThanOrEqual(1, $report['retired_config_rows']);
        self::assertSame(1, $report['retired_timer_rows']);
        self::assertSame([self::RETIRED_TIMER_MARK], $report['retired_timer_marks']);
        self::assertGreaterThanOrEqual(2, $report['retired_menu_rows'], 'the retired page and its permission row');
        self::assertGreaterThanOrEqual(2, $report['retired_group_data_rows'], 'the retired group and the dead menu link');
        self::assertSame(1, $report['retired_notification_rows']);
        self::assertSame(1, $report['retired_event_rows']);
        self::assertSame($before, Db::name('system_config')->order('id')->select()->toArray());
    }

    /**
     * The guards inside the script are what keeps a real shop intact; this test
     * checks the plan against the *shipped* seed data, so a change to the retired
     * lists that would delete a retained timer or keep a retired menu shows up.
     */
    public function testPlanKeepsRetainedTimersAndRemovesTheRetiredOnes(): void
    {
        [$status, $output] = $this->runScript('plan');
        self::assertSame(0, $status, $output);
        $report = $this->parseReport($output);
        self::assertIsArray($report, $output);

        $marks = Db::name('system_timer')->column('mark');
        foreach (['takeDelivery', 'clearPoster', 'orderCancel', 'advanceOff'] as $retained) {
            self::assertContains($retained, $marks, $retained . ' is still a retained timer');
            self::assertNotContains($retained, $report['retired_timer_marks'], $retained . ' must survive apply');
        }

        // The menus whose parents the retired list also removes: they must be
        // re-homed, not dropped. The install SQL ships them under a live parent.
        foreach (['/order/invoice', '/finance/capital_flow', '/finance/billing_records', '/setting/kefu_config'] as $path) {
            $menu = Db::name('system_menus')->whereLike('menu_path', $path . '%')->find();
            self::assertNotEmpty($menu, $path . ' is shipped by the install SQL');
            $parent = Db::name('system_menus')->where('id', (int)$menu['pid'])->find();
            self::assertNotEmpty($parent, $path . ' keeps a live parent');
            self::assertSame(0, (int)$parent['is_del'], $path . ' does not hang under a deleted menu');
        }
    }

    public function testApplyRenamesTablesRemovesSeedsAndRollbackRestoresThem(): void
    {
        $this->seedRetiredData();
        $this->cleanupCreatedSettings(['order_notice_admin_uids', 'customer_qrcode']);
        $beforeConfig = Db::name('system_config')->order('id')->select()->toArray();
        $beforeTimers = Db::name('system_timer')->order('id')->select()->toArray();
        $beforeMenus = Db::name('system_menus')->order('id')->select()->toArray();
        $beforeGroups = Db::name('system_group')->order('id')->select()->toArray();
        $beforeGroupData = Db::name('system_group_data')->order('id')->select()->toArray();
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
        foreach (['system_notice', 'user_notice'] as $table) {
            self::assertNotEmpty(Db::query("SHOW TABLES LIKE 'eb_retired_" . $table . "'"), $table . ' is renamed too');
            self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_" . $table . "'"), $table . ' is gone from its live name');
        }

        // Seeds inside shared tables: the retired ones go, the retained ones stay.
        self::assertSame(0, (int)Db::name('system_timer')->where('mark', self::RETIRED_TIMER_MARK)->count(), 'the retired timer is removed');
        self::assertSame(0, (int)Db::name('system_menus')->where('menu_path', self::RETIRED_MENU_PATH)->count(), 'the retired menu is removed');
        self::assertSame(0, (int)Db::name('system_group')->where('config_name', self::RETIRED_GROUP)->count());
        self::assertSame(0, (int)Db::name('system_group_data')->where('gid', $this->seededSeedIds[2])->count());
        self::assertContains('takeDelivery', Db::name('system_timer')->column('mark'), 'a retained timer survives');
        self::assertSame(0, (int)Db::name('system_group_data')->where('id', $this->seededSeedIds[4])->count(), 'the dead personal-centre link is pruned');
        self::assertSame(0, (int)Db::name('system_menus')->where('unique_auth', 'user-give_level_time')->count(), 'the dead permission row goes even with a live parent shape');
        self::assertSame(0, (int)Db::name('system_notification')->where('mark', 'recharge_success')->count(), 'the senderless notification template goes');
        self::assertSame(0, (int)Db::name('system_event_data')->where('value', 'user_extract')->count(), 'the senderless custom event goes');

        // The roster keeps everyone who could receive or manage orders, not just
        // the notify flag, and merges with what the setting already held.
        $roster = json_decode((string)Db::name('system_config')->where('menu_name', 'order_notice_admin_uids')->value('value'), true);
        $uids = array_map('intval', explode(',', (string)$roster));
        self::assertContains(1, $uids, 'notify=1 rows are carried over');
        self::assertContains(100, $uids, 'customer=1 rows are carried over');
        self::assertNotContains(101, $uids, 'inactive rows are not');

        // The settings the retained code reads exist after the upgrade.
        self::assertSame(1, (int)Db::name('system_config')->where('menu_name', 'customer_qrcode')->count());

        // Nothing left to do: the run is a no-op and the backup stays untouched.
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertStringContainsString('Already migrated', $output);

        // With work to do, the existing backup must not be overwritten: the
        // rollback point for the applied run would be lost.
        $sample = Db::name('system_config')->order('id')->find();
        unset($sample['id']);
        $sample['menu_name'] = 'brokerage_func_status';
        $lateId = (int)Db::name('system_config')->insertGetId($sample);
        $this->registerCleanup(function () use ($lateId) {
            Db::name('system_config')->where('id', $lateId)->delete();
        });
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(1, $status, $output);
        self::assertStringContainsString('already exists', $output);
        Db::name('system_config')->where('id', $lateId)->delete();

        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        // Every seeded row and every retired table comes back, row for row.
        self::assertSame($beforeConfig, Db::name('system_config')->order('id')->select()->toArray());
        self::assertSame($beforeTimers, Db::name('system_timer')->order('id')->select()->toArray());
        self::assertSame($beforeMenus, Db::name('system_menus')->order('id')->select()->toArray());
        self::assertSame($beforeGroups, Db::name('system_group')->order('id')->select()->toArray());
        self::assertSame($beforeGroupData, Db::name('system_group_data')->order('id')->select()->toArray());
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
        }, array_keys(self::RETIRED_FIXTURES))));
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
        }, array_keys(self::RETIRED_FIXTURES))));
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
