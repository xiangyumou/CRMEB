<?php
declare(strict_types=1);

// One side of a two-process race, so a conditional write can be proved on a real
// MySQL instead of inferred from the SQL text. Every action below drives a real
// business entry — the controller pay path, the shared cancellation entry, the
// full refund flow — never a bare DAO call.
//   php race-worker.php <action> <id> <value> <startFile> <outputFile>
//
//   coupon-redeem <couponUserId> <uid>
//     -> {value: affectedRows} from StoreCouponUserServices::redeemCoupon()
//   refund-freeze <refundId> <amount>
//     -> {value: {out_refund_no, refund_price}} from the refund service's freeze step
//   pay-entry <orderId> <uid> <paytype>   (env CRMEB_TEST_GATEWAY=1 binds the offline gateway)
//     -> {value: pay response} from the controller payment entry
//   cancel-entry <orderId> <uid>
//     -> {value: bool} from StoreOrderServices::cancelUnpaidOrder()
//   agree-refund <refundId> <amount>
//     -> {value: bool} from the full StoreOrderRefundServices::agreeRefund() flow
//
// Set CRMEB_TEST_GATEWAY=1 to rebind Pay::class onto the shared offline gateway
// before the action runs; the gateway state itself lives in the shared test
// database, so every process sees the same gateway.

require dirname(__DIR__) . '/bootstrap.php';
require dirname(__DIR__) . '/vendor/autoload.php';

if (getenv('CRMEB_TEST_GATEWAY') === '1') {
    \Tests\Regression\Support\StatefulGateway::install();
    \Tests\Regression\Support\StatefulGateway::bind();
}

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
    switch ($action) {
        case 'coupon-redeem':
            $result = app()->make(app\services\activity\coupon\StoreCouponUserServices::class)
                ->redeemCoupon((int)$id, (int)$value);
            break;
        case 'refund-freeze':
            $service = new class(app()->make(app\dao\order\StoreOrderRefundDao::class), app()->make(app\services\order\StoreOrderServices::class)) extends app\services\order\StoreOrderRefundServices {
                public function freeze(int $id, array $refundData): array
                {
                    return $this->freezeRefundRequest($id, $refundData);
                }
            };
            $result = $service->freeze((int)$id, ['refund_price' => $value, 'pay_price' => $value]);
            break;
        case 'pay-entry':
            $result = Tests\Regression\Support\BusinessDriver::payEntry((int)$id, (string)$value);
            break;
        case 'cancel-entry':
            $result = app()->make(app\services\order\StoreOrderServices::class)
                ->cancelUnpaidOrder((int)$id, 'race-worker cancel');
            break;
        case 'agree-refund':
            $result = Tests\Regression\Support\BusinessDriver::agreeRefund((int)$id, (string)$value);
            break;
        case 'refund-agree':
            // The full refund service entry (freeze + execute + complete), used
            // when the admin controller shape is not the point of the test.
            $service = app()->make(app\services\order\StoreOrderRefundServices::class);
            $result = $service->agreeRefund((int)$id, ['refund_price' => (string)$value, 'pay_price' => (string)$value], []);
            break;
        default:
            throw new RuntimeException('unknown action ' . $action);
    }
    $ok = true;
} catch (Throwable $throwable) {
    $error = get_class($throwable) . ': ' . $throwable->getMessage() . ' @ ' . $throwable->getFile() . ':' . $throwable->getLine();
}

file_put_contents($outputFile, json_encode(['ok' => $ok, 'value' => $result, 'error' => $error]));
