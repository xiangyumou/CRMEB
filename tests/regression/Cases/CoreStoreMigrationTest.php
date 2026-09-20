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

    /** Remove a shipped setting for one test and put it back at teardown. */
    private function removeShippedSetting(string $name): array
    {
        $row = Db::name('system_config')->where('menu_name', $name)->find();
        if (!$row) return [];
        Db::name('system_config')->where('id', $row['id'])->delete();
        $this->registerCleanup(function () use ($row) {
            if (!Db::name('system_config')->where('id', $row['id'])->count()) {
                Db::name('system_config')->insert($row);
            }
        });
        return $row;
    }

    /** Remove a shipped config tab for one test and put it back at teardown. */
    private function removeShippedTab(string $engTitle): array
    {
        $row = Db::name('system_config_tab')->where('eng_title', $engTitle)->find();
        if (!$row) return [];
        Db::name('system_config_tab')->where('id', $row['id'])->delete();
        $this->registerCleanup(function () use ($row) {
            if (!Db::name('system_config_tab')->where('id', $row['id'])->count()) {
                Db::name('system_config_tab')->insert($row);
            }
        });
        return $row;
    }

    /**
     * A shop that never had the customer-service or order-notice tab must get
     * both, and two settings added in one run must not share an id. Reading
     * MAX(id)+1 once per row handed every new row the same key, and a same-key
     * change is merged, so the second setting vanished without an error.
     */
    public function testApplyCreatesEveryMissingTabAndSettingWithUniqueIds(): void
    {
        $this->seedRetiredData();
        $this->removeShippedTab('kefu_config');
        $this->removeShippedTab('order_notice');
        $this->removeShippedSetting('customer_qrcode');
        $this->removeShippedSetting('order_notice_admin_uids');

        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
        });
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);

        $tabs = Db::name('system_config_tab')->whereIn('eng_title', ['kefu_config', 'order_notice'])
            ->order('id')->select()->toArray();
        self::assertCount(2, $tabs, 'both missing tabs are recreated');
        self::assertNotSame((int)$tabs[0]['id'], (int)$tabs[1]['id'], 'each new tab gets its own id');
        $tabIds = [];
        foreach ($tabs as $tab) $tabIds[(string)$tab['eng_title']] = (int)$tab['id'];

        $settings = Db::name('system_config')->whereIn('menu_name', ['customer_qrcode', 'order_notice_admin_uids'])
            ->order('id')->select()->toArray();
        self::assertCount(2, $settings, 'both missing settings are created');
        self::assertNotSame((int)$settings[0]['id'], (int)$settings[1]['id'], 'each new setting gets its own id');
        foreach ($settings as $row) {
            if ((string)$row['menu_name'] === 'customer_qrcode') {
                self::assertSame($tabIds['kefu_config'], (int)$row['config_tab_id'], 'the QR setting points at the recreated tab');
            } else {
                self::assertSame($tabIds['order_notice'], (int)$row['config_tab_id'], 'the roster setting points at the recreated tab');
            }
        }

        // Both added rows are in the backup, so one rollback takes them all away.
        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertSame(0, (int)Db::name('system_config')
            ->whereIn('menu_name', ['customer_qrcode', 'order_notice_admin_uids'])->count());
        self::assertSame(0, (int)Db::name('system_config_tab')
            ->whereIn('eng_title', ['kefu_config', 'order_notice'])->count());
    }

    /**
     * Creating the roster setting must carry the retired chat's members over:
     * they and the mobile order-management permission otherwise disappear.
     */
    public function testRosterIsInheritedWhenTheSettingIsCreated(): void
    {
        $this->seedRetiredData();
        $this->removeShippedSetting('order_notice_admin_uids');

        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
        });
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);

        $value = (string)Db::name('system_config')->where('menu_name', 'order_notice_admin_uids')->value('value');
        $uids = array_map('intval', array_filter(explode(',', trim($value, '"'))));
        self::assertContains(1, $uids, 'a notify=1 row is carried into the created setting');
        self::assertContains(100, $uids, 'a customer=1 row is carried too');
        self::assertNotContains(101, $uids, 'an inactive row is not');

        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertSame(0, (int)Db::name('system_config')->where('menu_name', 'order_notice_admin_uids')->count());
    }

    /**
     * A retained setting parked on a retired tab must be moved onto a live one,
     * not deleted with the tab it happened to sit on.
     */
    public function testRetainedSettingOnARetiredTabIsMovedAndKept(): void
    {
        $this->seedRetiredData();
        $original = Db::name('system_config')->where('menu_name', 'customer_qrcode')->find();
        self::assertNotEmpty($original, 'the install SQL ships the QR setting');
        $kept = '"https://example.test/customer.png"';
        Db::name('system_config')->where('id', $original['id'])->update(['config_tab_id' => 119, 'value' => $kept]);
        $this->registerCleanup(function () use ($original) {
            Db::name('system_config')->where('id', $original['id'])->update([
                'config_tab_id' => $original['config_tab_id'], 'value' => $original['value'],
            ]);
        });

        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
        });
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);

        $row = Db::name('system_config')->where('id', $original['id'])->find();
        self::assertNotEmpty($row, 'the setting survives the retired tab it sat on');
        self::assertNotContains((int)$row['config_tab_id'], [9, 11, 28, 45, 63, 67, 72, 73, 74, 108, 119, 126], 'it is moved off the retired tab');
        self::assertSame(1, (int)Db::name('system_config_tab')->where('id', (int)$row['config_tab_id'])->count(), 'onto a tab that still exists');
        self::assertSame($kept, (string)$row['value'], 'the operator value is kept');

        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertSame(119, (int)Db::name('system_config')->where('id', $original['id'])->value('config_tab_id'), 'rollback puts it back where it was');
    }

    /** A row edited after apply stops the rollback before either the names or the rows move. */
    public function testRollbackRefusesWhenARowChangedAndLeavesEverythingAsIs(): void
    {
        $this->seedRetiredData();
        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
        });
        // The roster row is edited twice below. If an assertion fails in between,
        // the edit would survive into the next run and turn this test's own
        // precondition into "already changed", so the original value is restored
        // on cleanup no matter how the test ends.
        $rosterRow = Db::name('system_config')->where('menu_name', 'order_notice_admin_uids')->find();
        self::assertIsArray($rosterRow, 'the install ships the order-notice roster setting');
        $this->registerCleanup(function () use ($rosterRow): void {
            Db::name('system_config')->where('id', (int)$rosterRow['id'])->update(['value' => $rosterRow['value']]);
        });
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);

        $rosterId = (int)$rosterRow['id'];
        $afterApply = (string)Db::name('system_config')->where('id', $rosterId)->value('value');
        self::assertNotSame('"4242"', $afterApply, 'the apply produced a roster value of its own to edit');
        Db::name('system_config')->where('id', $rosterId)->update(['value' => '"4242"']);

        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(1, $status, $output);
        self::assertStringContainsString('Concurrent changes', $output);
        self::assertNotEmpty(Db::query("SHOW TABLES LIKE 'eb_retired_user_extract'"), 'the tables are left renamed');
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_user_extract'"));
        self::assertSame('"4242"', (string)Db::name('system_config')->where('id', $rosterId)->value('value'), 'the edit is untouched');
        self::assertSame(0, (int)Db::name('system_config')->where('menu_name', 'brokerage_func_status')->count(), 'nothing was restored');

        // Undo the edit and the same backup rolls back cleanly.
        Db::name('system_config')->where('id', $rosterId)->update(['value' => $afterApply]);
        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_retired_%'"));
        self::assertSame(1, (int)Db::name('user_extract')->count());
    }

    /**
     * A failed data restore keeps the names restored and the same backup usable:
     * RENAME commits implicitly, so the row work runs in its own transaction.
     */
    public function testRollbackCanBeRetriedAfterTheDataRestoreFails(): void
    {
        $this->seedRetiredData();
        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
            Db::execute('DROP TRIGGER IF EXISTS regression_block_restore');
        });
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);

        // A trigger stands in for any write failure inside the restore: the
        // pre-check still classifies the row, the insert does not go through.
        Db::execute('CREATE TRIGGER regression_block_restore BEFORE INSERT ON `eb_system_config` FOR EACH ROW'
            . " SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'regression: block insert'");

        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(1, $status, $output);
        self::assertStringContainsString('data restore failed and can be retried', $output);
        self::assertStringContainsString('Re-run the rollback', $output);
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_retired_%'"), 'the names came back even though the rows did not');
        self::assertSame(1, (int)Db::name('user_extract')->count(), 'a renamed table is back with its rows');
        self::assertSame(0, (int)Db::name('system_config')->where('menu_name', 'brokerage_func_status')->count(), 'the row restore is still pending');

        Db::execute('DROP TRIGGER `regression_block_restore`');
        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        self::assertSame(1, (int)Db::name('system_config')->where('menu_name', 'brokerage_func_status')->count(), 'the retry finishes the restore');
    }

    /** The WeChat payment version selector chooses a retained gateway and must survive. */
    public function testWechatPaymentVersionSettingSurvivesApply(): void
    {
        $this->seedRetiredData();
        $row = Db::name('system_config')->where('menu_name', 'pay_wechat_type')->find();
        self::assertNotEmpty($row, 'the install SQL ships the version selector');
        self::assertSame('0', (string)$row['value']);
        Db::name('system_config')->where('id', $row['id'])->update(['value' => '1']);
        $this->registerCleanup(function () use ($row) {
            Db::name('system_config')->where('id', $row['id'])->update(['value' => $row['value']]);
        });

        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
        });
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);

        $after = Db::name('system_config')->where('menu_name', 'pay_wechat_type')->find();
        self::assertNotEmpty($after, 'the version selector is not dropped with the retired settings');
        self::assertSame('1', (string)$after['value'], 'an operator who chose v3 keeps v3');
        self::assertSame('pay', (string)Db::name('system_config_tab')->where('id', (int)$after['config_tab_id'])->value('eng_title'), 'it stays on the live payment tab');

        [$status, $output] = $this->runScript('rollback ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
    }

    /** A refusal while planning must leave the database exactly as it was. */
    public function testPlanRefusalLeavesTheDatabaseUnmodified(): void
    {
        $this->seedRetiredData();
        $setting = Db::name('system_config')->where('menu_name', 'pay_wechat_type')->find();
        $payTab = Db::name('system_config_tab')->where('eng_title', 'pay')->find();
        // The selector sits on a retired tab and the tab it belongs on is gone:
        // no live tab can hold it, so the run must refuse before writing.
        Db::name('system_config')->where('id', $setting['id'])->update(['config_tab_id' => 119]);
        Db::name('system_config_tab')->where('id', $payTab['id'])->delete();
        $this->registerCleanup(function () use ($setting, $payTab) {
            Db::name('system_config')->where('id', $setting['id'])->update(['config_tab_id' => $setting['config_tab_id']]);
            if (!Db::name('system_config_tab')->where('id', $payTab['id'])->count()) {
                Db::name('system_config_tab')->insert($payTab);
            }
        });

        $beforeConfig = Db::name('system_config')->order('id')->select()->toArray();
        $beforeTabs = Db::name('system_config_tab')->order('id')->select()->toArray();
        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);

        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(1, $status, $output);
        self::assertStringContainsString('pay_wechat_type', $output);
        self::assertFileDoesNotExist($backup, 'the refusal happens before the backup is written');
        self::assertSame($beforeConfig, Db::name('system_config')->order('id')->select()->toArray());
        self::assertSame($beforeTabs, Db::name('system_config_tab')->order('id')->select()->toArray());
        self::assertNotEmpty(Db::query("SHOW TABLES LIKE 'eb_user_extract'"), 'the retired tables are not renamed');
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_retired_%'"));
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

    /** Rows left in the renamed tables are real data; a dump file that merely names them proves nothing. */
    public function testFinalizeRefusesTablesThatStillHoldRows(): void
    {
        $this->seedRetiredData();
        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        $dump = $backup . '.sql';
        file_put_contents($dump, '-- ' . implode("\n-- ", array_map(static function ($table) {
            return 'eb_retired_' . $table;
        }, array_keys(self::RETIRED_FIXTURES))));
        $this->registerCleanup(function () use ($backup, $dump) {
            if (is_file($backup)) unlink($backup);
            if (is_file($dump)) unlink($dump);
            Db::execute('DROP TABLE IF EXISTS `eb_retired_user_extract`');
        });

        // A dump that only mentions the table names, plus --yes, must not be
        // allowed to take the rows with it.
        [$status, $output] = $this->runScript('finalize --dump=' . escapeshellarg($dump) . ' --yes');
        self::assertSame(2, $status, $output);
        self::assertStringContainsString('still hold rows', $output);
        self::assertStringContainsString('eb_retired_user_extract', $output);
        self::assertNotEmpty(Db::query("SHOW TABLES LIKE 'eb_retired_user_extract'"), 'the non-empty table survives');
        self::assertSame(1, $this->renamedRowCount('user_extract'), 'its rows survive too');
    }

    /** An empty table still needs a dump recorded: the drop cannot be undone. */
    public function testFinalizeNeedsADumpForEmptyTables(): void
    {
        $this->seedRetiredData();
        $backup = tempnam(sys_get_temp_dir(), 'retired-'); unlink($backup);
        [$status, $output] = $this->runScript('apply ' . escapeshellarg($backup));
        self::assertSame(0, $status, $output);
        $this->registerCleanup(function () use ($backup) {
            if (is_file($backup)) unlink($backup);
            Db::execute('DROP TABLE IF EXISTS `eb_retired_user_extract`');
        });
        $this->emptyRenamedTables();

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
        $this->emptyRenamedTables();

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
        $this->emptyRenamedTables();

        $dump = $backup . '.sql';
        file_put_contents($dump, '-- ' . implode("\n-- ", array_map(static function ($table) {
            return 'eb_retired_' . $table;
        }, array_keys(self::RETIRED_FIXTURES))));
        [$status, $output] = $this->runScript('finalize --dump=' . escapeshellarg($dump) . ' --yes');
        self::assertSame(0, $status, $output);
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_retired_%'"));
        self::assertSame([], Db::query("SHOW TABLES LIKE 'eb_user_extract'"));
    }

    /** Rows held by a renamed table, read through its retired name. */
    private function renamedRowCount(string $table): int
    {
        $rows = Db::query('SELECT COUNT(*) AS `rows` FROM `eb_retired_' . $table . '`');
        return (int)$rows[0]['rows'];
    }

    /**
     * Empty every renamed table of the fixture list. finalize only removes
     * empty tables, so a test that wants the drop to go through has to clear
     * the seeded rows first.
     */
    private function emptyRenamedTables(): void
    {
        foreach (array_keys(self::RETIRED_FIXTURES) as $table) {
            if (Db::query("SHOW TABLES LIKE 'eb_retired_" . $table . "'")) {
                Db::execute('TRUNCATE TABLE `eb_retired_' . $table . '`');
            }
        }
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
