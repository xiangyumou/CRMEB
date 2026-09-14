<?php
declare(strict_types=1);

require dirname(__DIR__) . '/bootstrap.php';

[$script, $userId, $operation, $amount, $startFile, $outputFile] = $argv;
$deadline = microtime(true) + 10;
while (!file_exists($startFile)) {
    if (microtime(true) >= $deadline) {
        exit(2);
    }
    usleep(1000);
}

$users = new app\dao\user\UserDao();
$method = $operation === 'inc' ? 'bcInc' : 'bcDec';
$result = $users->{$method}((int) $userId, 'now_money', $amount, 'uid');
file_put_contents($outputFile, (string) (int) $result);
