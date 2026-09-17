<?php
// +----------------------------------------------------------------------
// | CRMEB [ CRMEB赋能开发者，助力企业发展 ]
// +----------------------------------------------------------------------
// | Copyright (c) 2016~2026 https://www.crmeb.com All rights reserved.
// +----------------------------------------------------------------------
// | Licensed CRMEB并不是自由软件，未经许可不能去掉CRMEB相关版权
// +----------------------------------------------------------------------
// | Author: CRMEB Team <admin@crmeb.com>
// +----------------------------------------------------------------------

namespace app\services\order;

use app\services\BaseServices;
use app\dao\order\StoreOrderDao;
use app\services\user\UserServices;
use crmeb\exceptions\ApiException;
use app\services\user\UserAddressServices;

/**
 * 订单计算金额
 * Class StoreOrderComputedServices
 * @package app\services\order
 */
class StoreOrderComputedServices extends BaseServices
{
    /**
     * 额外参数
     * @var array
     */
    protected $paramData = [];

    /**
     * StoreOrderComputedServices constructor.
     * @param StoreOrderDao $dao
     */
    public function __construct(StoreOrderDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 设置额外参数
     * @param array $paramData
     * @return $this
     */
    public function setParamData(array $paramData)
    {
        $this->paramData = $paramData;
        return $this;
    }

    /**
     * 计算订单金额
     * @param int $uid
     * @param string $key
     * @param array $cartGroup
     * @param int $addressId
     * @param bool $useIntegral
     * @param int $couponId
     * @param bool $is_create
     * @param int $shipping_type
     * @return array
     */
    public function computedOrder(int $uid, array $userInfo = [], array $cartGroup, int $addressId, string $payType, bool $useIntegral = false, int $couponId = 0, bool $isCreate = false, int $shippingType = 1, int $is_gift = 0)
    {
        \app\services\CoreStore::assertOrder($this->paramData + compact('payType', 'useIntegral', 'shippingType'));
        if (!$userInfo) {
            /** @var UserServices $userServices */
            $userServices = app()->make(UserServices::class);
            $userInfo = $userServices->getUserInfo($uid);
            if (!$userInfo) {
                throw new ApiException('用户不存在');
            }
        }
        $cartInfo = $cartGroup['cartInfo'];
        $priceGroup = $cartGroup['priceGroup'];
        $other = $cartGroup['other'];
        $payPrice = (float)$priceGroup['totalPrice'];
        $addr = $cartGroup['addr'] ?? [];
        $postage = $priceGroup;
        if (!$addr || $addr['id'] != $addressId) {
            /** @var UserAddressServices $addressServices */
            $addressServices = app()->make(UserAddressServices::class);
            $addr = $addressServices->getAddress($addressId) ?? [];
            if ($addr) {
                $addr = $addr->toArray();
            }
            //改变地址重新计算邮费
            $postage = [];
        }
        $combinationId = $this->paramData['combinationId'] ?? 0;
        if (!$combinationId) {
            //使用优惠劵
            [$payPrice, $couponPrice] = $this->useCouponId($couponId, $uid, $cartInfo, $payPrice, $isCreate);
        }

        //计算邮费
        [$payPrice, $payPostage, $storePostageDiscount, $storeFreePostage, $isStoreFreePostage] = $this->computedPayPostage($shippingType, $cartInfo, $addr, $payPrice, $postage, $other, $userInfo, $is_gift);

        //赠送商品计算
        $payPrice = bcadd($payPrice, $priceGroup['giftPrice'], 2);

        $result = [
            'total_price' => $priceGroup['totalPrice'],
            'gift_price' => $priceGroup['giftPrice'],
            'pay_price' => $payPrice > 0 ? $payPrice : 0,
            'pay_postage' => $payPostage,
            'coupon_price' => $couponPrice ?? 0,
            'deduction_price' => 0,
            'usedIntegral' => 0,
            'SurplusIntegral' => 0,
            'storePostageDiscount' => $storePostageDiscount ?? 0,
            'isStoreFreePostage' => $isStoreFreePostage ?? false,
            'storeFreePostage' => $storeFreePostage ?? 0
        ];
        $this->paramData = [];
        return $result;
    }

    /**
     * 使用优惠卷
     * @param int $couponId
     * @param int $uid
     * @param $cartInfo
     * @param $payPrice
     * @param bool $is_create
     */
    public function useCouponId(int $couponId, int $uid, $cartInfo, $payPrice, bool $isCreate)
    {
        return app()->make(OrderCouponCalculator::class)->useCouponId($couponId, $uid, $cartInfo, $payPrice, $isCreate);
    }

    /**
     * 计算邮费
     * @param int $shipping_type
     * @param array $cartInfo
     * @param array $addr
     * @param string $payPrice
     * @param array $other
     * @return array
     */
    public function computedPayPostage(int $shipping_type, array $cartInfo, array $addr, string $payPrice, array $postage = [], array $other, $userInfo = [], $is_gift = 0)
    {
        return (new OrderFreightCalculator())->computedPayPostage($shipping_type, $payType, $cartInfo, $addr, $payPrice, $postage, $other, $userInfo, $is_gift);
    }
    /**
     * 运费计算,总金额计算
     * @param $cartInfo
     * @param $addr
     * @param array $userInfo
     * @return array
     */
    public function getOrderPriceGroup($storeFreePostage, $cartInfo, $addr, $userInfo = [], $shipping_type = 1, $is_gift = 0)
    {
        return (new OrderFreightCalculator())->getOrderPriceGroup($storeFreePostage, $cartInfo, $addr, $userInfo, $shipping_type, $is_gift);
    }
    /**
     * 获取某个字段总金额
     * @param $cartInfo
     * @param string $key
     * @param bool $is_unit
     * @return int|string
     */
    public function getOrderSumPrice($cartInfo, $key = 'truePrice', $is_unit = true)
    {
        return app()->make(OrderFreightCalculator::class)->sumPrice($cartInfo, $key, $is_unit);
    }
}
