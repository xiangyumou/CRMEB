<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

use think\facade\Db;

/**
 * Read the real database state a business step left behind.
 *
 * Tests assert on these snapshots instead of trusting return values: orders,
 * cart infos, every stock ledger, coupons, attempts, refunds, effects, capital
 * flows, groups, virtual cards, exception payments and the gateway request log.
 * All readers are read-only.
 */
final class BusinessSnapshot
{
    /**
     * The store_order row (by primary key or merchant order number).
     * @param int|string $idOrOrderId
     */
    public static function order($idOrOrderId): ?array
    {
        $row = is_int($idOrOrderId)
            ? Db::name('store_order')->where('id', $idOrOrderId)->find()
            : Db::name('store_order')->where('order_id', $idOrOrderId)->find();
        return $row ?: null;
    }

    /**
     * Cart info rows of an order (cart_info JSON decoded).
     */
    public static function cartInfos(int $orderId): array
    {
        $rows = Db::name('store_order_cart_info')->where('oid', $orderId)->select()->toArray();
        foreach ($rows as &$row) {
            $row['cart_info'] = json_decode((string)$row['cart_info'], true);
        }
        return $rows;
    }

    /**
     * The four stock ledgers a product may have touched: the product row, its
     * SKU row, and (when a presale fixture is given) the presale activity row
     * and its type-6 SKU row.
     */
    public static function stockLayers(array $product, ?array $advance = null): array
    {
        $read = static function (string $table, int $id): array {
            $row = Db::name($table)->where('id', $id)->find();
            return [
                'stock' => (int)($row['stock'] ?? 0),
                'sales' => (int)($row['sales'] ?? 0),
                'quota' => (int)($row['quota'] ?? 0),
                'quota_show' => (int)($row['quota_show'] ?? 0),
            ];
        };
        $layers = [
            'product' => $read('store_product', (int)$product['id']),
            'product_sku' => $read('store_product_attr_value', (int)$product['sku_id']),
        ];
        if ($advance) {
            $layers['advance'] = $read('store_advance', (int)$advance['id']);
            $layers['advance_sku'] = $read('store_product_attr_value', (int)$advance['sku_id']);
        }
        return $layers;
    }

    /**
     * Payment attempts of one order, oldest first.
     */
    public static function attempts(int $orderId): array
    {
        return Db::name('store_order_payment_attempt')
            ->where('store_order_id', $orderId)
            ->order('id')
            ->select()->toArray();
    }

    /**
     * One attempt by merchant order number.
     */
    public static function attemptByOutTradeNo(string $outTradeNo): ?array
    {
        $row = Db::name('store_order_payment_attempt')->where('out_trade_no', $outTradeNo)->find();
        return $row ?: null;
    }

    /**
     * Effect records of one order.
     */
    public static function effects(int $orderId): array
    {
        return Db::name('store_order_effect')->where('store_order_id', $orderId)->order('id')->select()->toArray();
    }

    /**
     * After-sale rows of one order.
     */
    public static function refunds(int $orderId): array
    {
        return Db::name('store_order_refund')->where('store_order_id', $orderId)->order('id')->select()->toArray();
    }

    /**
     * One after-sale row by id.
     */
    public static function refund(int $id): ?array
    {
        $row = Db::name('store_order_refund')->where('id', $id)->find();
        return $row ?: null;
    }

    /**
     * Held user coupons of one uid.
     */
    public static function userCoupons(int $uid): array
    {
        return Db::name('store_coupon_user')->where('uid', $uid)->order('id')->select()->toArray();
    }

    /**
     * One user coupon row.
     */
    public static function userCoupon(int $id): ?array
    {
        $row = Db::name('store_coupon_user')->where('id', $id)->find();
        return $row ?: null;
    }

    /**
     * Capital flows linked to a merchant order number (the table has no id
     * column, so rows are ordered by their own flow id).
     */
    public static function capitalFlows(string $orderId): array
    {
        return Db::name('capital_flow')->where('order_id', $orderId)->order('flow_id')->select()->toArray();
    }

    /**
     * Group-buy rows joined to an order id.
     */
    public static function pinks(string $orderId): array
    {
        return Db::name('store_pink')->where('order_id', $orderId)->order('id')->select()->toArray();
    }

    /**
     * Virtual cards of one SKU, with their claim state.
     */
    public static function virtualCards(string $attrUnique): array
    {
        return Db::name('store_product_virtual')->where('attr_unique', $attrUnique)->order('id')->select()->toArray();
    }

    /**
     * Exception payments recorded for one order id.
     */
    public static function paymentExceptions(int $orderId): array
    {
        return Db::name('store_order_payment_exception')->where('store_order_id', $orderId)->order('id')->select()->toArray();
    }

    /**
     * Every exception payment row (for cross-order trade dedupe checks).
     */
    public static function allPaymentExceptions(): array
    {
        return Db::name('store_order_payment_exception')->order('id')->select()->toArray();
    }

    /**
     * Order status history rows (pay_success, refund_price, coupon_back, …).
     * The table has no id column, so rows are ordered by their own time.
     */
    public static function orderStatusRows(int $orderId, ?string $changeType = null): array
    {
        $query = Db::name('store_order_status')->where('oid', $orderId);
        if ($changeType !== null) {
            $query->where('change_type', $changeType);
        }
        return $query->order('change_time')->select()->toArray();
    }

    /**
     * Delivery rows of one order.
     */
    public static function deliveries(int $orderId): array
    {
        return Db::name('store_order_delivery')->where('oid', $orderId)->order('id')->select()->toArray();
    }

    /**
     * Offline gateway state: every gateway order of one merchant order number.
     * Read through the gateway's own connection.
     */
    public static function gatewayOrder(string $outTradeNo): ?array
    {
        return TestConnection::one(
            sprintf('SELECT * FROM %s WHERE out_trade_no = ?', TestConnection::table('regression_gateway_order')),
            [$outTradeNo]
        );
    }

    /**
     * Offline gateway refund row. Read through the gateway's own connection.
     */
    public static function gatewayRefund(string $outRefundNo): ?array
    {
        return TestConnection::one(
            sprintf('SELECT * FROM %s WHERE out_refund_no = ?', TestConnection::table('regression_gateway_refund')),
            [$outRefundNo]
        );
    }
}
