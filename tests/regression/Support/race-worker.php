<?php
declare(strict_types=1);

// One side of a two-process race, so a conditional write can be proved on a real
// MySQL instead of inferred from the SQL text.
//   php race-worker.php <action> <id> <value> <startFile> <outputFile>
//
//   coupon-redeem <couponUserId> <uid>
//     -> {value: affectedRows} from StoreCouponUserServices::redeemCoupon()
//   refund-freeze <refundId> <amount>
//     -> {value: {out_refund_no, refund_price}} from the refund service's freeze step

require dirname(__DIR__) . '/bootstrap.php';

[, $action, $id, $value, $startFile, $outputFile] = $argv;
$deadline = microtime(true) + 10;
while (!file_exists($startFile)) {
    if (microtime(true) >= $deadline) {
        exit(2);
    }
    usleep(1000);
}

$ok = false;
$result = null;
$error = '';
try {
    if ($action === 'coupon-redeem') {
        $result = app()->make(app\services\activity\coupon\StoreCouponUserServices::class)
            ->redeemCoupon((int)$id, (int)$value);
    } elseif ($action === 'refund-freeze') {
        $service = new class(app()->make(app\dao\order\StoreOrderRefundDao::class), app()->make(app\services\order\StoreOrderServices::class)) extends app\services\order\StoreOrderRefundServices {
            public function freeze(int $id, array $refundData): array
            {
                return $this->freezeRefundRequest($id, $refundData);
            }
        };
        $result = $service->freeze((int)$id, ['refund_price' => $value, 'pay_price' => $value]);
    } else {
        throw new RuntimeException('unknown action ' . $action);
    }
    $ok = true;
} catch (Throwable $throwable) {
    $error = get_class($throwable) . ': ' . $throwable->getMessage();
}

file_put_contents($outputFile, json_encode(['ok' => $ok, 'value' => $result, 'error' => $error]));
