<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

use app\Request;
use app\api\controller\v1\order\StoreOrderController;
use app\adminapi\controller\v1\order\RefundOrder as AdminRefundOrder;
use app\services\order\StoreOrderServices;
use think\Container;

/**
 * Drives the real business entries in-process: the same controller methods the
 * routes target, with a prepared Request standing in for the middleware work
 * (authenticated uid, terminal header, POST body). Used by race workers and by
 * tests that need the full entry without HTTP round trips; HTTP round trips
 * stay covered by the HttpTestClient cases.
 */
final class BusinessDriver
{
    /**
     * Run the pay entry (`StoreOrderController::pay()`) for one order.
     * @return array{status:string, payInfo:mixed, http:array}
     */
    public static function payEntry(int $orderId, string $paytype = 'weixin', int $payerSwap = 0): array
    {
        $order = BusinessSnapshot::order($orderId);
        if (!$order) {
            throw new \RuntimeException('order not found: ' . $orderId);
        }
        $uid = (int)$order['uid'];
        $post = ['uni' => (string)$order['order_id'], 'paytype' => $paytype, 'type' => $payerSwap];
        $response = self::withApiRequest($uid, $post, static function (Request $request) {
            /** @var StoreOrderController $controller */
            $controller = app()->make(StoreOrderController::class);
            return $controller->pay(
                $request,
                app()->make(\app\services\activity\combination\StorePinkServices::class),
                app()->make(\app\services\pay\OrderPayServices::class)
            );
        });
        return self::jsonBody($response);
    }

    /**
     * Run the full admin refund entry (`RefundOrder::refundPrice()`) for one
     * after-sale row, exactly as the admin route would.
     */
    public static function agreeRefund(int $refundId, string $refundPrice, int $type = 1): array
    {
        $post = ['refund_price' => $refundPrice, 'type' => $type];
        $response = self::withAdminRequest($post, static function (Request $request) use ($refundId) {
            /** @var AdminRefundOrder $controller */
            $controller = app()->make(AdminRefundOrder::class);
            return $controller->refundPrice(
                $request,
                app()->make(StoreOrderServices::class),
                $refundId
            );
        });
        return self::jsonBody($response);
    }

    /**
     * Swap in a prepared API request for the duration of $fn and restore the
     * original one afterwards.
     */
    public static function withApiRequest(int $uid, array $post, callable $fn)
    {
        return self::withPreparedRequest($uid, $post, $fn);
    }

    /**
     * Same swap for an admin request (no uid; admin entries read nothing from
     * the request beyond the POST body in the paths under test).
     */
    public static function withAdminRequest(array $post, callable $fn)
    {
        return self::withPreparedRequest(0, $post, $fn);
    }

    private static function withPreparedRequest(int $uid, array $post, callable $fn)
    {
        $container = Container::getInstance();
        $original = null;
        try {
            $original = $container->make('request', []);
        } catch (\Throwable $e) {
            $original = null;
        }
        $request = new Request();
        // h5 terminal: a real retained channel that needs no openid lookup and
        // reaches the gateway create exactly like the other terminals do.
        $request->withHeader(['Form-type' => 'h5']);
        $request->withServer(['REQUEST_METHOD' => 'POST']);
        $request->withPost($post);
        $request->withGet([]);
        if ($uid > 0) {
            // Note: the macro closures must NOT be static — Macroable binds
            // them to the request instance.
            $request->macro('uid', function () use ($uid) {
                return $uid;
            });
            $request->macro('user', function (?string $key = null) use ($uid) {
                return $key === null ? ['uid' => $uid] : ['uid' => $uid][$key] ?? '';
            });
        }
        $container->instance('request', $request);
        try {
            return $fn($request);
        } finally {
            if ($original !== null) {
                $container->instance('request', $original);
            }
        }
    }

    /**
     * Normalize the `app('json')` return value into the array the client sees.
     */
    private static function jsonBody($response): array
    {
        if (is_array($response)) {
            return $response;
        }
        if (is_object($response) && method_exists($response, 'getData')) {
            $data = $response->getData();
            if (is_string($data)) {
                $decoded = json_decode($data, true);
                return is_array($decoded) ? $decoded : ['raw' => $data];
            }
            return is_array($data) ? $data : ['value' => $data];
        }
        return ['value' => $response];
    }
}
