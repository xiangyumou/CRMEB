<?php
declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';

use app\services\pay\YuePayServices;
use think\facade\Db;

[$script, $userId, $orderId, $startFile, $outputFile] = $argv;

while (!file_exists($startFile)) {
    usleep(1000);
}

$success = 0;
try {
    $order = Db::name('store_order')->where('id', (int)$orderId)->find();
    $result = app()->make(YuePayServices::class)->yueOrderPay($order, (int)$userId);
    $success = isset($result['status']) && $result['status'] === true ? 1 : 0;
} catch (Throwable $throwable) {
    $success = 0;
}

file_put_contents($outputFile, (string)$success);
