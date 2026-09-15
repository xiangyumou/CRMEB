<?php
declare(strict_types=1);

namespace Tests\Regression\Cases;

use app\dao\product\product\StoreProductDao;
use app\dao\product\sku\StoreProductAttrValueDao;
use Tests\Regression\Support\FixtureFactory;
use Tests\Regression\Support\RegressionTestCase;
use think\facade\Db;

final class InventoryTest extends RegressionTestCase
{
    /** @var array */
    private $fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->fixture = (new FixtureFactory($this, $this->getName()))->createProduct(
            ['stock' => 1, 'sales' => 0],
            ['stock' => 3, 'quota' => 1, 'sales' => 0, 'type' => 1]
        );
    }

    public function testRejectsNonPositiveAndInsufficientDeductions(): void
    {
        $dao = new StoreProductDao();

        self::assertFalse($dao->decStockIncSales(['id' => $this->fixture['id']], 0));
        self::assertFalse($dao->decStockIncSales(['id' => $this->fixture['id']], -1));
        self::assertSame(0, $dao->decStockIncSales(['id' => $this->fixture['id']], 2));
        self::assertSame(['stock' => 1, 'sales' => 0], $this->inventory());
    }

    public function testLastItemCanOnlyBeDeductedOnce(): void
    {
        for ($round = 0; $round < 20; $round++) {
            Db::name('store_product')->where('id', $this->fixture['id'])->update(['stock' => 1, 'sales' => 0]);
            $this->assertOneOfTwoConcurrentDeductionsSucceeds();
        }
    }

    private function assertOneOfTwoConcurrentDeductionsSucceeds(): void
    {
        $start = tempnam(sys_get_temp_dir(), 'crmeb-stock-start-');
        $outputs = [tempnam(sys_get_temp_dir(), 'crmeb-stock-a-'), tempnam(sys_get_temp_dir(), 'crmeb-stock-b-')];
        unlink($start);
        $processes = [];

        foreach ($outputs as $output) {
            $command = sprintf(
                'php %s %d %s %s',
                escapeshellarg(dirname(__DIR__) . '/Support/inventory-worker.php'),
                $this->fixture['id'],
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

        sort($results);
        self::assertSame([0, 1], $results);
        self::assertSame(['stock' => 0, 'sales' => 1], $this->inventory());
    }

    public function testActivityStockRequiresEnoughStockAndQuotaAtomically(): void
    {
        $dao = new StoreProductAttrValueDao();

        self::assertSame(0, $dao->decStockIncSales(['id' => $this->fixture['sku_id'], 'type' => 1], 2));
        self::assertSame(1, $dao->decStockIncSales(['id' => $this->fixture['sku_id'], 'type' => 1], 1));
        $row = Db::name('store_product_attr_value')->where('id', $this->fixture['sku_id'])->field('stock,quota,sales')->find();
        self::assertSame(['stock' => 2, 'quota' => 0, 'sales' => 1], array_map('intval', $row));
    }

    private function inventory(): array
    {
        $row = Db::name('store_product')->where('id', $this->fixture['id'])->field('stock,sales')->find();
        return ['stock' => (int) $row['stock'], 'sales' => (int) $row['sales']];
    }
}
