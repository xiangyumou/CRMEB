<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * The reliability objects（支付尝试表、订单副作用表、退款单号与冻结请求字段）are what
 * the retained payment and refund paths write to. A fresh install ships them through
 * the install SQL; an existing shop gets them from the standalone, repeatable
 * migration. Both routes have to end in the same verified schema without touching a
 * single business row.
 */
final class OrderReliabilityMigrationTest extends RegressionTestCase
{
    private const TABLES = ['store_order_payment_attempt', 'store_order_effect'];
    private const REFUND_COLUMNS = ['out_refund_no', 'refund_request'];

    private function script(): string
    {
        return 'php ' . escapeshellarg(CRMEB_TEST_ROOT . '/upgrade/core-store/order-reliability.php');
    }

    /** @return array{0:int,1:string} */
    private function runScript(string $args): array
    {
        exec($this->script() . ' ' . $args . ' 2>&1', $output, $status);
        return [$status, implode("\n", $output)];
    }

    private function tableExists(string $table): bool
    {
        $rows = Db::query(
            'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
            ['eb_' . $table]
        );
        return (int)$rows[0]['total'] > 0;
    }

    /** @return string[] lower-cased column names read back from the live schema */
    private function columnsOf(string $table): array
    {
        $rows = Db::query(
            'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
            ['eb_' . $table]
        );
        return array_map(static function ($row): string {
            return strtolower((string)$row['name']);
        }, $rows);
    }

    /** @return string[] index names on the live table */
    private function indexesOf(string $table): array
    {
        $rows = Db::query(
            'SELECT DISTINCT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
            ['eb_' . $table]
        );
        return array_map(static function ($row): string {
            return (string)$row['name'];
        }, $rows);
    }

    /**
     * The install SQL is the source of truth for a new shop: if it stopped shipping an
     * object the payment or refund path writes to, every new deployment would fail at
     * runtime instead of at install time.
     */
    public function testInstallSchemaAlreadyShipsEveryReliabilityObject(): void
    {
        [$status, $output] = $this->runScript('plan');
        self::assertSame(0, $status, $output);
        self::assertStringContainsString('up to date', $output, 'the restored install SQL must ship the reliability schema');

        foreach (self::TABLES as $table) {
            self::assertTrue($this->tableExists($table), $table . ' is created by the install SQL');
        }
        self::assertContains('out_trade_no', $this->indexesOf('store_order_payment_attempt'), 'the merchant order number is unique');
        self::assertContains('order_event', $this->indexesOf('store_order_effect'), 'one effect per order and event type');
        self::assertContains('out_trade_no', $this->columnsOf('store_order_payment_attempt'));
        self::assertContains('status', $this->columnsOf('store_order_payment_attempt'));
        foreach (self::REFUND_COLUMNS as $column) {
            self::assertContains($column, $this->columnsOf('store_order_refund'), 'the install SQL ships store_order_refund.' . $column);
        }
    }

    /**
     * An existing shop upgrades with the standalone script. It has to create what is
     * missing, verify by re-reading the schema, leave business rows alone and be safe
     * to run again after an interrupted release.
     */
    public function testApplyAddsEveryMissingObjectAndRepeatsWithoutTouchingBusinessRows(): void
    {
        $factory = new FixtureFactory($this, 'order reliability migration');
        $user = $factory->createUser();
        $order = $factory->createOrder((int)$user['uid']);
        $refund = $factory->createRefundOrder((int)$user['uid'], (int)$order['id']);
        $refundPrice = (string)Db::name('store_order_refund')->where('id', $refund['id'])->value('refund_price');
        $orderCount = (int)Db::name('store_order')->count();
        $refundCount = (int)Db::name('store_order_refund')->count();

        foreach (self::TABLES as $table) {
            Db::execute('DROP TABLE IF EXISTS eb_' . $table);
        }
        Db::execute('ALTER TABLE eb_store_order_refund DROP COLUMN out_refund_no, DROP COLUMN refund_request');
        // Run the same migration the release runs, which also proves the objects come
        // back for any test that runs after this one.
        $this->registerCleanup(function (): void {
            $this->runScript('apply');
        });

        [$status, $output] = $this->runScript('plan');
        self::assertSame(0, $status, $output);
        foreach (array_merge(self::TABLES, ['store_order_refund.out_refund_no', 'store_order_refund.refund_request']) as $object) {
            self::assertStringContainsString('- ' . $object, $output, $object . ' is reported as missing');
        }

        [$status, $output] = $this->runScript('apply');
        self::assertSame(0, $status, $output);
        self::assertStringContainsString('applied and verified', $output);

        // Re-read the live schema instead of trusting the script's own summary.
        foreach (self::TABLES as $table) {
            self::assertTrue($this->tableExists($table), 'apply created ' . $table);
        }
        foreach (self::REFUND_COLUMNS as $column) {
            self::assertContains($column, $this->columnsOf('store_order_refund'), 'apply added store_order_refund.' . $column);
        }
        self::assertContains('status', $this->columnsOf('store_order_effect'));

        [$status, $output] = $this->runScript('plan');
        self::assertSame(0, $status, $output);
        self::assertStringContainsString('up to date', $output, 'a second run has nothing left to do');

        [$status, $output] = $this->runScript('apply');
        self::assertSame(0, $status, $output, 'apply stays safe to repeat');
        self::assertStringNotContainsString('Added store_order_refund.out_refund_no', $output, 'existing columns are not added twice');
        self::assertSame(1, count(array_keys($this->columnsOf('store_order_refund'), 'out_refund_no', true)), 'the column exists exactly once');

        self::assertSame($orderCount, (int)Db::name('store_order')->count(), 'no order is created or removed');
        self::assertSame($refundCount, (int)Db::name('store_order_refund')->count(), 'no refund row is created or removed');
        self::assertSame($refundPrice, (string)Db::name('store_order_refund')->where('id', $refund['id'])->value('refund_price'), 'the existing refund row keeps its amount');
        self::assertSame('', (string)Db::name('store_order_refund')->where('id', $refund['id'])->value('out_refund_no'), 'the new column starts empty for old refunds');
    }

    /**
     * An interrupted release can stop between the two tables. The second run has to
     * finish the job instead of failing on the table that already exists.
     */
    public function testApplyFinishesAnInterruptedRun(): void
    {
        Db::execute('DROP TABLE IF EXISTS eb_store_order_effect');
        $this->registerCleanup(function (): void {
            $this->runScript('apply');
        });
        self::assertTrue($this->tableExists('store_order_payment_attempt'), 'the other table is still there from before the interruption');

        [$status, $output] = $this->runScript('plan');
        self::assertSame(0, $status, $output);
        self::assertStringContainsString('- store_order_effect', $output);
        self::assertStringNotContainsString('- store_order_payment_attempt', $output, 'an object that already exists is not planned again');

        [$status, $output] = $this->runScript('apply');
        self::assertSame(0, $status, $output);
        self::assertTrue($this->tableExists('store_order_effect'), 'the interrupted run is completed');
    }
}

