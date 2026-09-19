<?php
declare(strict_types=1);

namespace Tests\Regression\Support;

use think\facade\Db;

final class FixtureFactory
{
    /** @var RegressionTestCase */
    private $test;

    /** @var string */
    private $prefix;

    /** @var int */
    private $sequence = 0;

    public function __construct(RegressionTestCase $test, string $testName)
    {
        $this->test = $test;
        $slug = strtolower((string)preg_replace('/[^a-z0-9]+/i', '_', $testName));
        $this->prefix = 'regression_' . substr(trim($slug, '_'), 0, 8) . '_' . bin2hex(random_bytes(2));
    }

    public function createUser(array $overrides = []): array
    {
        $data = array_merge([
            'account' => substr($this->unique('user'), 0, 32),
            'nickname' => $this->unique('user'),
            'phone' => '',
            'now_money' => '0.00',
            'integral' => 0,
            'add_time' => time(),
            'status' => 1,
        ], $overrides);
        $id = (int)Db::name('user')->insertGetId($data);
        $this->test->registerCleanup(static function () use ($id): void {
            // The ledger tables were dropped with the retired features; user_bill remains.
            Db::name('user_bill')->where('uid', $id)->delete();
            Db::name('user')->where('uid', $id)->delete();
        });
        return array_merge($data, ['uid' => $id]);
    }

    public function createProduct(array $overrides = [], array $skuOverrides = []): array
    {
        $data = array_merge([
            'store_name' => $this->unique('product'),
            'price' => '10.00',
            'vip_price' => '9.00',
            'stock' => 10,
            'sales' => 0,
            'is_show' => 1,
            'add_time' => time(),
            'spu' => substr(bin2hex(random_bytes(7)), 0, 13),
        ], $overrides);
        $id = (int)Db::name('store_product')->insertGetId($data);
        $sku = array_merge([
            'product_id' => $id,
            'suk' => 'default',
            'stock' => $data['stock'],
            'sales' => 0,
            'price' => $data['price'],
            'vip_price' => $data['vip_price'],
            'unique' => bin2hex(random_bytes(4)),
            'type' => 0,
            'quota' => 0,
            'quota_show' => 0,
        ], $skuOverrides);
        $skuId = (int)Db::name('store_product_attr_value')->insertGetId($sku);
        $this->test->registerCleanup(static function () use ($id): void {
            Db::name('store_product_attr_value')->where('product_id', $id)->delete();
            Db::name('store_product')->where('id', $id)->delete();
        });
        return ['id' => $id, 'sku_id' => $skuId, 'product' => $data, 'sku' => $sku];
    }

    public function createOrder(int $uid, array $overrides = []): array
    {
        $orderId = substr($this->unique('order'), 0, 32);
        $data = array_merge([
            'order_id' => $orderId,
            'uid' => $uid,
            'pay_uid' => $uid,
            'unique' => md5($this->unique('key')),
            'total_num' => 1,
            'total_price' => '10.00',
            'pay_price' => '10.00',
            'paid' => 0,
            'status' => 0,
            'add_time' => time(),
        ], $overrides);
        $id = (int)Db::name('store_order')->insertGetId($data);
        $this->test->registerCleanup(static function () use ($id): void {
            Db::name('store_order_status')->where('oid', $id)->delete();
            Db::name('store_order_cart_info')->where('oid', $id)->delete();
            Db::name('store_order')->where('id', $id)->delete();
        });
        return array_merge($data, ['id' => $id]);
    }

    /**
     * Write the cart row an order needs to be listed and refunded. The embedded
     * cart_info must carry the same id as the cart_id column, the way
     * StoreOrderCartInfoServices::setCartInfo writes it.
     */
    public function createOrderCart(int $orderId, int $uid, array $overrides = []): array
    {
        $cartId = $overrides['cart_id'] ?? random_int(100000, 999999);
        $cartInfo = array_merge([
            'id' => $cartId,
            'product_id' => 1,
            'cart_num' => 1,
            'productInfo' => ['id' => 1, 'store_name' => $this->unique('cart'), 'price' => '10.00', 'image' => ''],
        ], $overrides['cart_info'] ?? []);
        $data = array_merge([
            'oid' => $orderId,
            'uid' => $uid,
            'cart_id' => $cartId,
            'product_id' => 1,
            'old_cart_id' => 0,
            'cart_num' => 1,
            'refund_num' => 0,
            'surplus_num' => 1,
            'split_status' => 0,
            'unique' => md5($cartId . '_' . $orderId),
            'cart_info' => json_encode($cartInfo),
        ], array_diff_key($overrides, ['cart_info' => null]));
        $id = (int)Db::name('store_order_cart_info')->insertGetId($data);
        $this->test->registerCleanup(static function () use ($id): void {
            Db::name('store_order_cart_info')->where('id', $id)->delete();
        });
        return array_merge($data, ['id' => $id]);
    }

    public function createRefundOrder(int $uid, int $storeOrderId, array $overrides = []): array
    {
        $data = array_merge([
            'store_order_id' => $storeOrderId,
            'order_id' => substr($this->unique('refund'), 0, 50),
            'uid' => $uid,
            'refund_type' => 4,
            'refund_num' => 1,
            'refund_price' => '10.00',
            'cart_info' => '[]',
            'add_time' => time(),
        ], $overrides);
        $id = (int)Db::name('store_order_refund')->insertGetId($data);
        $this->test->registerCleanup(static function () use ($id): void {
            Db::name('store_order_status')->where('oid', $id)->where('change_type', 'refund_express')->delete();
            Db::name('store_order_refund')->where('id', $id)->delete();
        });
        return array_merge($data, ['id' => $id]);
    }

    /**
     * Seed a presale activity the way the admin form writes one: the activity row
     * plus its own SKU layer (type 6). The presale SKU keeps the ordinary product
     * SKU's `suk`, which is how the stock restore finds the product SKU again.
     * A presale order therefore moves stock in the activity row, the type-6 SKU,
     * the product row and the type-0 SKU.
     */
    public function createAdvance(int $productId, array $overrides = [], array $skuOverrides = []): array
    {
        $data = array_merge([
            'product_id' => $productId,
            'title' => $this->unique('advance'),
            'price' => '10.00',
            'stock' => 5,
            'sales' => 3,
            'quota' => 5,
            'quota_show' => 5,
            'type' => 0,
            'num' => 5,
            'start_time' => (string)(time() - 60),
            'stop_time' => (string)(time() + 3600),
            'status' => 1,
            'is_del' => 0,
        ], $overrides);
        $id = (int)Db::name('store_advance')->insertGetId($data);
        $sku = array_merge([
            'product_id' => $id,
            // `unique` is char(8); the factory's readable names do not fit it.
            'unique' => bin2hex(random_bytes(4)),
            'suk' => 'default',
            'type' => 6,
            'stock' => $data['stock'],
            'sales' => $data['sales'],
            'quota' => $data['quota'],
            'quota_show' => $data['quota_show'],
            'price' => $data['price'],
        ], $skuOverrides);
        $skuId = (int)Db::name('store_product_attr_value')->insertGetId($sku);
        $this->test->registerCleanup(static function () use ($id, $skuId): void {
            Db::name('store_product_attr_value')->where('id', $skuId)->delete();
            Db::name('store_advance')->where('id', $id)->delete();
        });
        return ['id' => $id, 'sku_id' => $skuId, 'advance' => $data, 'sku' => $sku];
    }

    /**
     * Read back the stock ledgers a presale order moves, keyed so a failure names
     * the layer that was not restored instead of only reporting a mismatched count.
     *
     * @return array<string, array<string, int>>
     */
    public function stockLayers(array $product, ?array $advance = null): array
    {
        $layers = [
            'product' => $this->stockRow('store_product', ['id' => $product['id']]),
            'product_sku' => $this->stockRow('store_product_attr_value', ['id' => $product['sku_id']]),
        ];
        if ($advance !== null) {
            $layers['advance'] = $this->stockRow('store_advance', ['id' => $advance['id']]);
            $layers['advance_sku'] = $this->stockRow('store_product_attr_value', ['id' => $advance['sku_id']]);
        }
        return $layers;
    }

    /** @return array<string, int> */
    private function stockRow(string $table, array $where): array
    {
        $row = Db::name($table)->where($where)->field('stock,sales')->find();
        if (!$row) {
            throw new \RuntimeException('missing ' . $table . ' row: ' . json_encode($where));
        }
        return array_map('intval', $row);
    }

    private function unique(string $type): string
    {
        return $this->prefix . '_' . $type . '_' . (++$this->sequence);
    }
}
