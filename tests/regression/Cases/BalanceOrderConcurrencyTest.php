<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class BalanceOrderConcurrencyTest extends RegressionTestCase
{
    public function testCompetingFullPaymentsPersistExactlyOnce(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser(['now_money' => '20.00']);
        $order = $fixtures->createOrder($user['uid'], [
            'pay_price' => '20.00',
            'total_price' => '20.00',
            'real_name' => 'Balance Race',
            'user_phone' => '13000000003',
            'user_address' => 'Regression Address',
        ]);

        for ($round = 0; $round < 20; $round++) {
            Db::name('user')->where('uid', $user['uid'])->update(['now_money' => '20.00']);
            Db::name('store_order')->where('id', $order['id'])->update([
                'paid' => 0,
                'pay_time' => 0,
                'pay_type' => '',
            ]);
            Db::name('user_money')->where([
                'uid' => $user['uid'],
                'link_id' => (string)$order['id'],
                'type' => 'pay_product',
            ])->delete();

            $results = $this->runWorkers($user['uid'], $order['id']);

            sort($results);
            self::assertSame([0, 1], $results, 'round ' . $round);
            self::assertSame('0.00', Db::name('user')->where('uid', $user['uid'])->value('now_money'));
            $state = Db::name('store_order')->where('id', $order['id'])->field('paid,pay_type')->find();
            self::assertSame(1, (int)$state['paid']);
            self::assertSame('yue', $state['pay_type']);
            self::assertSame(1, (int)Db::name('user_money')->where([
                'uid' => $user['uid'],
                'link_id' => (string)$order['id'],
                'type' => 'pay_product',
            ])->count());
        }
    }

    private function runWorkers(int $userId, int $orderId): array
    {
        $start = tempnam(sys_get_temp_dir(), 'crmeb-payment-start-');
        $outputs = [tempnam(sys_get_temp_dir(), 'crmeb-payment-a-'), tempnam(sys_get_temp_dir(), 'crmeb-payment-b-')];
        unlink($start);
        $this->registerCleanup(static function () use ($start, $outputs): void {
            foreach (array_merge([$start], $outputs) as $file) {
                if (file_exists($file)) unlink($file);
            }
        });
        $processes = [];
        foreach ($outputs as $output) {
            $command = sprintf(
                'php %s %d %d %s %s',
                escapeshellarg(dirname(__DIR__) . '/Support/payment-worker.php'),
                $userId,
                $orderId,
                escapeshellarg($start),
                escapeshellarg($output)
            );
            $processes[] = proc_open($command, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
        }
        touch($start);
        foreach ($processes as $process) {
            self::assertSame(0, proc_close($process));
        }
        return array_map(static function (string $file): int {
            return (int)trim((string)file_get_contents($file));
        }, $outputs);
    }
}
