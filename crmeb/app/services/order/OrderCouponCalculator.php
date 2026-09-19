<?php
namespace app\services\order;

use app\services\activity\coupon\StoreCouponUserServices;
use app\services\product\product\StoreCategoryServices;
use crmeb\exceptions\ApiException;

final class OrderCouponCalculator
{
    public function useCouponId(int $couponId, int $uid, $cartInfo, $payPrice, bool $isCreate)
    {
        if (!$couponId) return [$payPrice, 0];

        $couponServices = app()->make(StoreCouponUserServices::class);
        $couponInfo = $couponServices->getOne([['id', '=', $couponId], ['uid', '=', $uid], ['is_fail', '=', 0], ['status', '=', 0], ['start_time', '<', time()], ['end_time', '>', time()]], '*', ['issue']);
        if (!$couponInfo) throw new ApiException('选择的优惠劵无效');
        $type = $couponInfo['applicable_type'] ?? 0;
        $price = 0;
        $count = 0;
        switch ($type) {
            case 0:
            case 3:
                foreach ($cartInfo as $cart) {
                    $price = bcadd($price, bcmul((string)$cart['truePrice'], (string)$cart['cart_num'], 2), 2);
                    $count++;
                }
                break;
            case 1:
                $storeCategoryServices = app()->make(StoreCategoryServices::class);
                $coupon_category = explode(',', (string)$couponInfo['category_id']);
                $category_ids = $storeCategoryServices->getAllById($coupon_category);
                if ($category_ids) {
                    $cateIds = array_column($category_ids, 'id');
                    foreach ($cartInfo as $cart) {
                        if (isset($cart['productInfo']['cate_id']) && array_intersect(explode(',', $cart['productInfo']['cate_id']), $cateIds)) {
                            $price = bcadd($price, bcmul((string)$cart['truePrice'], (string)$cart['cart_num'], 2), 2);
                            $count++;
                        }
                    }
                }
                break;
            case 2:
                foreach ($cartInfo as $cart) {
                    if (isset($cart['product_id']) && in_array($cart['product_id'], explode(',', $couponInfo['product_id']))) {
                        $price = bcadd($price, bcmul((string)$cart['truePrice'], (string)$cart['cart_num'], 2), 2);
                        $count++;
                    }
                }
                break;
        }
        if (!$count || $couponInfo['use_min_price'] > $price) throw new ApiException('不满足优惠劵的使用条件');
        $couponPrice = $couponInfo['coupon_price'] > $price ? $price : $couponInfo['coupon_price'];
        $payPrice = (float)bcsub((string)$payPrice, (string)$couponPrice, 2);
        // 这里只做试算，绝不写库：核销必须发生在创建订单的同一事务里
        // （见 StoreOrderCreateServices::createOrder），否则下单失败会留下已核销的券。
        // $isCreate 保留在签名里，供调用方表达"这是一次真实下单"的意图。
        return [$payPrice, $couponPrice];
    }
}
