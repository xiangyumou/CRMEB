<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

use think\facade\Config;

/**
 * A dedicated PDO connection for the test infrastructure.
 *
 * The offline gateway and the barriers MUST NOT share the application's
 * connection: a gateway request is not undone by the caller's local rollback,
 * so the double's state has to live outside every application transaction.
 * This connection autocommits and is only used by the test doubles.
 */
final class TestConnection
{
    /** @var \PDO|null */
    private static $pdo;

    public static function pdo(): \PDO
    {
        if (self::$pdo instanceof \PDO) {
            return self::$pdo;
        }
        $config = (array)Config::get('database.connections.mysql', []);
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            $config['hostname'] ?? '127.0.0.1',
            $config['hostport'] ?? '3306',
            $config['database'] ?? '',
            $config['charset'] ?? 'utf8mb4'
        );
        self::$pdo = new \PDO($dsn, (string)$config['username'], (string)$config['password'], [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_AUTOCOMMIT => true,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
        ]);
        if (!empty($config['prefix'])) {
            self::$prefix = (string)$config['prefix'];
        }

        return self::$pdo;
    }

    /** @var string */
    private static $prefix = 'eb_';

    public static function prefix(): string
    {
        return self::$prefix;
    }

    public static function table(string $unprefixed): string
    {
        return self::prefix() . $unprefixed;
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function one(string $sql, array $params = [])
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        $stmt->closeCursor();

        return $row === false ? null : $row;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function all(string $sql, array $params = []): array
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $stmt->closeCursor();

        return $rows;
    }

    public static function exec(string $sql, array $params = []): int
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        $affected = $stmt->rowCount();
        $stmt->closeCursor();

        return $affected;
    }
}
