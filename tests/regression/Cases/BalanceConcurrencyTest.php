<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\user\UserDao;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class BalanceConcurrencyTest extends RegressionTestCase
{
    private const USER_ID = 1;

    public function testCompetingDeductionsCannotSpendBalanceTwice(): void
    {
        Db::name('user')->where('uid', self::USER_ID)->update(['now_money' => '30.00']);

        $results = $this->runWorkers('dec', '20.00');

        sort($results);
        self::assertSame([0, 1], $results);
        self::assertSame('10.00', Db::name('user')->where('uid', self::USER_ID)->value('now_money'));
    }

    public function testConcurrentRefundCreditsAreNotLost(): void
    {
        Db::name('user')->where('uid', self::USER_ID)->update(['now_money' => '0.00']);

        $results = $this->runWorkers('inc', '10.00');

        self::assertSame([1, 1], $results);
        self::assertSame('20.00', Db::name('user')->where('uid', self::USER_ID)->value('now_money'));
    }

    public function testNegativeBalanceChangesAreRejected(): void
    {
        Db::name('user')->where('uid', self::USER_ID)->update(['now_money' => '30.00']);
        $users = new UserDao();

        self::assertFalse($users->bcInc(self::USER_ID, 'now_money', '-1.00', 'uid'));
        self::assertFalse($users->bcDec(self::USER_ID, 'now_money', '-1.00', 'uid'));
        self::assertSame('30.00', Db::name('user')->where('uid', self::USER_ID)->value('now_money'));
    }

    private function runWorkers(string $operation, string $amount): array
    {
        $start = tempnam(sys_get_temp_dir(), 'crmeb-balance-start-');
        $outputs = [tempnam(sys_get_temp_dir(), 'crmeb-balance-a-'), tempnam(sys_get_temp_dir(), 'crmeb-balance-b-')];
        unlink($start);
        $processes = [];

        foreach ($outputs as $output) {
            $command = sprintf(
                'php %s %d %s %s %s %s',
                escapeshellarg(dirname(__DIR__) . '/Support/balance-worker.php'),
                self::USER_ID,
                escapeshellarg($operation),
                escapeshellarg($amount),
                escapeshellarg($start),
                escapeshellarg($output)
            );
            $processes[] = proc_open($command, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
        }

        touch($start);
        foreach ($processes as $process) {
            self::assertSame(0, proc_close($process));
        }
        $results = array_map(static function (string $file): int {
            $result = (int) trim((string) file_get_contents($file));
            unlink($file);
            return $result;
        }, $outputs);
        unlink($start);
        return $results;
    }
}
