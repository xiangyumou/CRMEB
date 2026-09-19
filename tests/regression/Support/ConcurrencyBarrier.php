<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

/**
 * Cross-process synchronization for concurrency tests.
 *
 * The barrier lives in the shared regression MySQL so the PHPUnit process, the
 * worker processes and (when needed) containers can coordinate precisely:
 * a request can be held at a chosen stage and released on purpose instead of
 * relying on sleeps. Test-stack only: the table is prefixed and never read by
 * application code. Writes go through the dedicated test connection so a
 * barrier inside an application transaction keeps working.
 */
final class ConcurrencyBarrier
{
    private const TABLE = 'regression_barrier';
    private const POLL_MICROS = 5000;

    /**
     * Create the backing table if it does not exist yet.
     */
    public static function install(): void
    {
        TestConnection::exec(sprintf('CREATE TABLE IF NOT EXISTS %s (
            barrier_key varchar(64) NOT NULL PRIMARY KEY,
            released tinyint NOT NULL DEFAULT 0,
            arrivals int NOT NULL DEFAULT 0,
            updated int NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', TestConnection::table(self::TABLE)));
    }

    /**
     * Reset one barrier to closed with zero arrivals.
     */
    public static function open(string $key): void
    {
        self::install();
        TestConnection::exec(
            sprintf('REPLACE INTO %s (barrier_key, released, arrivals, updated) VALUES (?, 0, 0, ?)', TestConnection::table(self::TABLE)),
            [$key, time()]
        );
    }

    /**
     * Block until the barrier is released or the deadline passes.
     */
    public static function await(string $key, float $timeoutSeconds = 10.0): bool
    {
        $deadline = microtime(true) + $timeoutSeconds;
        while (microtime(true) < $deadline) {
            $row = TestConnection::one(
                sprintf('SELECT released FROM %s WHERE barrier_key = ?', TestConnection::table(self::TABLE)),
                [$key]
            );
            if ($row && (int)$row['released'] === 1) {
                return true;
            }
            usleep(self::POLL_MICROS);
        }

        return false;
    }

    /**
     * Register one party's arrival.
     */
    public static function arrive(string $key): void
    {
        self::install();
        $affected = TestConnection::exec(
            sprintf('UPDATE %s SET arrivals = arrivals + 1, updated = ? WHERE barrier_key = ?', TestConnection::table(self::TABLE)),
            [time(), $key]
        );
        if (!$affected) {
            TestConnection::exec(
                sprintf('REPLACE INTO %s (barrier_key, released, arrivals, updated) VALUES (?, 0, 1, ?)', TestConnection::table(self::TABLE)),
                [$key, time()]
            );
        }
    }

    /**
     * Block until `count` parties arrived.
     */
    public static function awaitArrivals(string $key, int $count, float $timeoutSeconds = 10.0): bool
    {
        $deadline = microtime(true) + $timeoutSeconds;
        while (microtime(true) < $deadline) {
            $row = TestConnection::one(
                sprintf('SELECT arrivals FROM %s WHERE barrier_key = ?', TestConnection::table(self::TABLE)),
                [$key]
            );
            if ($row && (int)$row['arrivals'] >= $count) {
                return true;
            }
            usleep(self::POLL_MICROS);
        }

        return false;
    }

    /**
     * Release a held barrier.
     */
    public static function release(string $key): void
    {
        TestConnection::exec(
            sprintf('UPDATE %s SET released = 1, updated = ? WHERE barrier_key = ?', TestConnection::table(self::TABLE)),
            [time(), $key]
        );
    }

    /**
     * Remove every barrier row; called between tests.
     */
    public static function reset(): void
    {
        self::install();
        TestConnection::exec(sprintf('DELETE FROM %s', TestConnection::table(self::TABLE)));
    }
}
