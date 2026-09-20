<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\model\order\StoreOrderPaymentAttempt;
use app\model\order\StoreOrderPaymentException;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * The reliability migration on a database that predates it.
 *
 * The script must prove the result, not assume it: it verifies column types and
 * unique indexes (their absence silently removes the concurrency protection),
 * refuses before any DDL when the existing data holds an unresolved payment,
 * refund or effect, and shows the retained business rows are untouched by
 * comparing counts taken before and after.
 */
final class OrderReliabilitySchemaTest extends RegressionTestCase
{
    /** @var string[] */
    private array $dropTables = [];

    /** @var array<int, array{table:string,column:string,definition:string}> */
    private array $restoreColumns = [];

    protected function tearDown(): void
    {
        foreach ($this->restoreColumns as $entry) {
            if ($this->columnExists($entry['table'], $entry['column'])) {
                // The test may have replaced the column with a probe of the wrong
                // type; the definition is restored either way so the next run sees
                // the schema this suite expects.
                Db::execute(sprintf(
                    'ALTER TABLE `%s` MODIFY `%s` %s',
                    $this->prefix() . $entry['table'],
                    $entry['column'],
                    $entry['definition']
                ));
                continue;
            }
            Db::execute(sprintf(
                'ALTER TABLE `%s` ADD COLUMN `%s` %s',
                $this->prefix() . $entry['table'],
                $entry['column'],
                $entry['definition']
            ));
        }
        foreach ($this->dropTables as $table) {
            Db::execute(sprintf('DROP TABLE IF EXISTS `%s`', $this->prefix() . $table));
        }
        parent::tearDown();
    }

    private function prefix(): string
    {
        return (string)config('database.connections.mysql.prefix');
    }

    private function columnExists(string $table, string $column): bool
    {
        $rows = Db::query(
            'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [$this->prefix() . $table, $column]
        );

        return (bool)$rows;
    }

    /**
     * Resolve whatever unresolved state exists so apply can pass its pre-check.
     * The pre-check itself is global by design (a shop must not migrate while any
     * payment is unresolved); these tests only need a clean baseline.
     */
    private function clearUnresolvedState(): void
    {
        Db::name('store_order_payment_attempt')->whereIn('status', [0, 3])->update(['status' => StoreOrderPaymentAttempt::STATUS_CLOSED, 'last_result' => 'test:closed']);
        Db::name('store_order_effect')->where('status', 2)->update(['status' => \app\model\order\StoreOrderEffect::STATUS_DONE]);
        Db::name('store_order_refund')
            ->whereIn('refund_state', [\app\services\order\StoreOrderRefundServices::REFUND_STATE_PROCESSING, \app\services\order\StoreOrderRefundServices::REFUND_STATE_UNKNOWN])
            ->update(['refund_state' => \app\services\order\StoreOrderRefundServices::REFUND_STATE_SUCCESS]);
    }

    private function runScript(string $args): array
    {
        $command = sprintf(
            'php %s %s 2>&1',
            escapeshellarg(CRMEB_TEST_ROOT . '/upgrade/core-store/order-reliability.php'),
            $args
        );
        exec($command, $output, $status);

        return [$status, implode("\n", $output)];
    }

    /**
     * MIG-018: a unique index dropped from a shipped table is detected and put
     * back, and the re-read schema proves it — not just the CREATE statement.
     */
    public function testAMissingUniqueIndexIsReportedAndRecreated(): void
    {
        // Drop the unique index that protects the merchant order number.
        Db::execute('ALTER TABLE `' . $this->prefix() . 'store_order_payment_attempt` DROP INDEX `out_trade_no`');
        $this->registerCleanup(function (): void {
            $rows = Db::query(
                'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
                [$this->prefix() . 'store_order_payment_attempt', 'out_trade_no']
            );
            if (!$rows) {
                Db::execute('ALTER TABLE `' . $this->prefix() . 'store_order_payment_attempt` ADD UNIQUE KEY `out_trade_no` (`out_trade_no`)');
            }
        });

        [$status, $output] = $this->runScript('plan');
        self::assertSame(1, $status, 'plan reports the missing unique index as a conflict: ' . $output);
        self::assertStringContainsString('unique index', $output);
        self::assertStringContainsString('out_trade_no', $output);

        $this->clearUnresolvedState();
        [$status, $output] = $this->runScript('apply');
        self::assertSame(0, $status, $output);
        $rows = Db::query(
            'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
            [$this->prefix() . 'store_order_payment_attempt', 'out_trade_no']
        );
        self::assertNotEmpty($rows, 'the unique index really exists after apply');
    }

    /**
     * MIG-019: a column of the wrong type is reported and blocks apply before any
     * avoidable DDL, instead of being silently accepted.
     */
    public function testAWrongColumnTypeBlocksApplyBeforeAnyChange(): void
    {
        // Make the amount column a plain string: the frozen decimal comparisons
        // would silently lose precision.
        Db::execute('ALTER TABLE `' . $this->prefix() . 'store_order_payment_attempt` MODIFY `total_fee` varchar(16) NOT NULL DEFAULT "0"');
        $this->registerCleanup(function (): void {
            Db::execute('ALTER TABLE `' . $this->prefix() . 'store_order_payment_attempt` MODIFY `total_fee` decimal(12,2) NOT NULL DEFAULT "0.00"');
        });

        [$status, $output] = $this->runScript('plan');
        self::assertSame(1, $status, 'plan reports the type conflict: ' . $output);
        self::assertStringContainsString('expected decimal', $output);

        [$status, $output] = $this->runScript('apply');
        self::assertSame(1, $status, 'apply refuses before any avoidable change');
        self::assertStringContainsString('结构冲突', $output);
        // Nothing was changed: the wrong type is still there and no new table appeared.
        self::assertSame('varchar', strtolower((string)Db::query(
            'SELECT DATA_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
            [$this->prefix() . 'store_order_payment_attempt', 'total_fee']
        )[0]['t']), 'the conflicting column is left as it was');
    }

    /**
     * MIG-020: the pre-check blocks apply while an unresolved payment, refund or
     * effect exists, and releases it once the state is resolved.
     */
    public function testAnUnresolvedPaymentBlocksApplyUntilItIsResolved(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder((int)$user['uid']);
        $attemptId = (int)Db::name('store_order_payment_attempt')->insertGetId([
            'store_order_id' => (int)$order['id'],
            'out_trade_no' => 'MIG-' . bin2hex(random_bytes(4)),
            'driver' => 'wechat_pay',
            'channel' => '2',
            'pay_type' => 'weixin',
            'total_fee' => '10.00',
            'pay_uid' => (int)$user['uid'],
            'status' => StoreOrderPaymentAttempt::STATUS_UNKNOWN,
            'trade_no' => '',
            'last_result' => 'create:unknown',
            'add_time' => time(),
            'update_time' => time(),
        ]);
        $this->registerCleanup(static function () use ($attemptId): void {
            Db::name('store_order_payment_attempt')->where('id', $attemptId)->delete();
        });

        [$status, $output] = $this->runScript('apply');
        self::assertSame(1, $status, 'an unresolved payment blocks the migration: ' . $output);
        self::assertStringContainsString('未决', $output);
        self::assertStringContainsString('order:reconcile', $output, 'the operator is told how to resolve it');

        // Resolve it the way an operator would and the migration proceeds.
        Db::name('store_order_payment_attempt')->where('id', $attemptId)->update(['status' => StoreOrderPaymentAttempt::STATUS_CLOSED, 'last_result' => 'operator:closed']);
        $this->clearUnresolvedState();
        [$status, $output] = $this->runScript('apply');
        self::assertSame(0, $status, $output);
    }

    /**
     * MIG-021: an unresolved refund and an unknown effect block the migration too.
     */
    public function testUnresolvedRefundsAndEffectsBlockApply(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder((int)$user['uid']);

        // An unknown effect.
        $effectId = (int)Db::name('store_order_effect')->insertGetId([
            'store_order_id' => (int)$order['id'],
            'event_type' => 'migration_probe',
            'payload' => '{}',
            'status' => \app\model\order\StoreOrderEffect::STATUS_UNKNOWN,
            'attempts' => 1,
            'last_error' => 'probe',
            'add_time' => time(),
            'update_time' => time(),
        ]);
        $this->registerCleanup(static function () use ($effectId): void {
            Db::name('store_order_effect')->where('id', $effectId)->delete();
        });
        [$status, $output] = $this->runScript('apply');
        self::assertSame(1, $status, 'an unknown effect blocks the migration: ' . $output);
        self::assertStringContainsString('副作用', $output);
        self::assertStringContainsString('effects:list', $output);

        Db::name('store_order_effect')->where('id', $effectId)->update(['status' => \app\model\order\StoreOrderEffect::STATUS_DONE]);

        // An in-flight refund.
        $refund = $fixtures->createRefundOrder((int)$user['uid'], (int)$order['id'], [
            'refund_type' => 1,
            'refund_price' => '10.00',
            'out_refund_no' => 'MIGR-' . bin2hex(random_bytes(3)),
            'refund_request' => json_encode(['refund_price' => '10.00', 'context' => ['driver' => 'wechat_pay']]),
            'refund_state' => \app\services\order\StoreOrderRefundServices::REFUND_STATE_PROCESSING,
        ]);
        [$status, $output] = $this->runScript('apply');
        self::assertSame(1, $status, 'an in-flight refund blocks the migration: ' . $output);
        self::assertStringContainsString('退款', $output);
        self::assertStringContainsString('refunds:list', $output);

        Db::name('store_order_refund')->where('id', $refund['id'])->update(['refund_state' => \app\services\order\StoreOrderRefundServices::REFUND_STATE_SUCCESS]);
        $this->clearUnresolvedState();
        [$status, $output] = $this->runScript('apply');
        self::assertSame(0, $status, $output);
    }

    /**
     * MIG-022: a retry of an interrupted run finishes the work and reports the
     * retained business rows unchanged.
     */
    public function testARerunAfterInterruptionCompletesAndTouchesNoBusinessRow(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $order = $fixtures->createOrder((int)$user['uid'], ['order_id' => 'mig-' . bin2hex(random_bytes(4))]);
        $coupon = $fixtures->createUserCoupon((int)$user['uid'], ['status' => 1, 'use_time' => time()]);

        $this->clearUnresolvedState();

        // Simulate an interrupted run: the exception table exists but the refund
        // columns were never added. Note the pre-check reads refund_state, so it
        // is restored first thing by the run under test.
        Db::execute('ALTER TABLE `' . $this->prefix() . 'store_order_refund` DROP COLUMN `refund_state`');
        $this->restoreColumns[] = [
            'table' => 'store_order_refund',
            'column' => 'refund_state',
            'definition' => "tinyint(1) NOT NULL DEFAULT '0'",
        ];

        $countsBefore = [];
        foreach (['store_order', 'store_order_cart_info', 'store_coupon_user', 'user'] as $table) {
            $countsBefore[$table] = (int)Db::name($table)->count();
        }

        [$status, $output] = $this->runScript('apply');
        self::assertSame(0, $status, 'the interrupted run is completed: ' . $output);
        self::assertTrue($this->columnExists('store_order_refund', 'refund_state'), 'the missing column is added back');

        // The second run is a no-op and still verifies.
        $this->clearUnresolvedState();
        [$status, $output] = $this->runScript('apply');
        self::assertSame(0, $status, $output);
        self::assertStringContainsString('applied and verified', $output);

        foreach ($countsBefore as $table => $count) {
            self::assertSame($count, (int)Db::name($table)->count(), $table . ' keeps its rows');
        }
        $refund = Db::name('store_order_refund')->where('store_order_id', (int)$order['id'])->find();
        self::assertNull($refund, 'the migration created no refund row of its own');
        self::assertSame(1, (int)Db::name('store_coupon_user')->where('id', $coupon['id'])->value('status'), 'the coupon keeps its state');
    }
}
