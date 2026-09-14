<?php
declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';

[$script, $productId, $startFile, $outputFile] = $argv;
$deadline = microtime(true) + 10;
while (!file_exists($startFile)) {
    if (microtime(true) >= $deadline) {
        exit(2);
    }
    usleep(1000);
}

$result = (new app\dao\product\product\StoreProductDao())->decStockIncSales(['id' => (int) $productId], 1);
file_put_contents($outputFile, (string) (int) $result);
