<?php
declare(strict_types=1);

// One cancellation attempt in its own process, so two of them can race for the
// same order the way the manual, queue and timer entries do in production.
//   php cancel-worker.php <direct|job> <orderId> <startFile> <outputFile>

require dirname(__DIR__) . '/bootstrap.php';

[, $mode, $orderId, $startFile, $outputFile] = $argv;
$deadline = microtime(true) + 10;
while (!file_exists($startFile)) {
    if (microtime(true) >= $deadline) {
        exit(2);
    }
    usleep(1000);
}

$result = false;
$error = '';
try {
    if ($mode === 'job') {
        // The queue entry: app\jobs\UnpaidOrderCancelJob::doJob
        $result = (new app\jobs\UnpaidOrderCancelJob())->doJob((int)$orderId);
    } else {
        // The manual and timer entry: StoreOrderServices::cancelUnpaidOrder
        $result = app()->make(app\services\order\StoreOrderServices::class)
            ->cancelUnpaidOrder((int)$orderId, '并发取消');
    }
} catch (Throwable $throwable) {
    $error = get_class($throwable) . ': ' . $throwable->getMessage();
}

file_put_contents($outputFile, json_encode(['ok' => (bool)$result, 'error' => $error]));

