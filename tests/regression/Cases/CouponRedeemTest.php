<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\services\activity\coupon\StoreCouponUserServices;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

/**
 * A coupon can only be spent once.
 *
 * Order creation redeems the coupon with one conditional update keyed on the
 * holder, the unused state and the validity window, and refuses the order unless
 * exactly one row changed. That statement is the only thing standing between a
 * double click (or two concurrent requests) and one coupon paying for two orders,
 * so it is exercised against the real MySQL rather than the SQL text.
 */
final class CouponRedeemTest extends RegressionTestCase
{
    public function testRedeemingTheSameCouponTwiceOnlySucceedsOnce(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $coupon = $fixtures->createUserCoupon($user['uid']);
        $service = app()->make(StoreCouponUserServices::class);

        self::assertSame(1, (int)$service->redeemCoupon((int)$coupon['id'], (int)$user['uid']));

        $row = Db::name('store_coupon_user')->where('id', $coupon['id'])->find();
        self::assertSame(1, (int)$row['status'], 'the coupon is marked used');
        self::assertGreaterThan(0, (int)$row['use_time'], 'the use time is recorded');

        // The second attempt lands in a later second on purpose: MySQL reports
        // *changed* rows, so an unconditional update would look unchanged only
        // while it happens to write the same `use_time`.
        sleep(1);
        self::assertSame(
            0,
            (int)$service->redeemCoupon((int)$coupon['id'], (int)$user['uid']),
            'the second attempt changes nothing'
        );
        self::assertSame(1, (int)Db::name('store_coupon_user')->where('id', $coupon['id'])->value('status'));
        self::assertSame((int)$row['use_time'], (int)Db::name('store_coupon_user')->where('id', $coupon['id'])->value('use_time'), 'the recorded use time is not rewritten');
    }

    /**
     * The guard reads the row's own state, not the request: a coupon held by
     * somebody else, one already failed, one expired and one not yet valid all
     * have to stay unspent.
     *
     * @dataProvider unusableCouponProvider
     */
    public function testACouponThatIsNotUsableByThisHolderIsRefused(array $overrides, bool $otherHolder): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $coupon = $fixtures->createUserCoupon($user['uid'], $overrides);
        $uid = $otherHolder ? (int)$user['uid'] + 100000 : (int)$user['uid'];

        self::assertSame(0, (int)app()->make(StoreCouponUserServices::class)->redeemCoupon((int)$coupon['id'], $uid));
        self::assertSame(
            (int)($overrides['status'] ?? 0),
            (int)Db::name('store_coupon_user')->where('id', $coupon['id'])->value('status'),
            'the refused redemption must leave the row in the state it was found in'
        );
    }

    public function unusableCouponProvider(): array
    {
        return [
            'already used' => [['status' => 1, 'use_time' => time()], false],
            'marked failed' => [['is_fail' => 1], false],
            'expired' => [['start_time' => time() - 7200, 'end_time' => time() - 3600], false],
            'not yet valid' => [['start_time' => time() + 3600, 'end_time' => time() + 7200], false],
            'another holder' => [[], true],
        ];
    }

    /**
     * Two requests released together must not both spend one coupon. The loser
     * has to observe zero affected rows, because that is what makes order
     * creation throw instead of writing a second order on the same coupon.
     */
    public function testConcurrentRedemptionsLeaveExactlyOneWinner(): void
    {
        $fixtures = new FixtureFactory($this, $this->getName());
        $user = $fixtures->createUser();
        $coupon = $fixtures->createUserCoupon($user['uid']);

        $results = $this->race((int)$coupon['id'], (int)$user['uid']);
        sort($results);

        self::assertSame([0, 1], $results, 'exactly one redemption may win');
        self::assertSame(1, (int)Db::name('store_coupon_user')->where('id', $coupon['id'])->value('status'));
        self::assertSame(
            1,
            (int)Db::name('store_coupon_user')->where('id', $coupon['id'])->where('status', 1)->count(),
            'the coupon records a single use'
        );
    }

    /**
     * Run the same write in two processes released together, so the race is real
     * rather than a claimed property of the generated SQL.
     *
     * @return array<int, int>
     */
    private function race(int $couponId, int $uid): array
    {
        $start = tempnam(sys_get_temp_dir(), 'crmeb-race-start-');
        unlink($start);
        $processes = [];
        $outputs = [];
        foreach ([0, 1] as $index) {
            $output = tempnam(sys_get_temp_dir(), 'crmeb-race-');
            $outputs[$index] = $output;
            $command = sprintf(
                'php %s %s %d %d %s %s',
                escapeshellarg(dirname(__DIR__) . '/Support/race-worker.php'),
                escapeshellarg('coupon-redeem'),
                $couponId,
                $uid,
                escapeshellarg($start),
                escapeshellarg($output)
            );
            $processes[$index] = proc_open($command, [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']], $pipes);
        }

        touch($start);
        $results = [];
        foreach ($processes as $index => $process) {
            self::assertSame(0, proc_close($process), 'the redemption worker exits cleanly');
            $raw = (string)file_get_contents($outputs[$index]);
            unlink($outputs[$index]);
            $decoded = json_decode($raw, true);
            self::assertIsArray($decoded, 'the worker reported a result: ' . $raw);
            self::assertSame('', (string)$decoded['error'], 'the worker must not fail');
            self::assertTrue($decoded['ok']);
            $results[] = (int)$decoded['value'];
        }
        unlink($start);

        return $results;
    }
}
