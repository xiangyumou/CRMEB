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


use app\services\activity\advance\StoreAdvanceServices;
use app\services\activity\combination\StorePinkServices;
use app\services\agent\AgentLevelServices;
use app\services\activity\coupon\StoreCouponUserServices;
use app\services\product\product\StoreCategoryServices;
use app\services\shipping\ShippingTemplatesFreeServices;
use app\services\shipping\ShippingTemplatesRegionServices;
use app\services\shipping\ShippingTemplatesServices;
use app\services\user\UserInvoiceServices;
use app\services\wechat\WechatUserServices;
use app\services\BaseServices;
use crmeb\exceptions\ApiException;
use crmeb\exceptions\ApiStatusException;
use crmeb\services\CacheService;
use app\dao\order\StoreOrderDao;
use app\services\user\UserServices;
use app\services\user\UserAddressServices;
use app\services\activity\combination\StoreCombinationServices;
use app\services\product\product\StoreProductServices;
use think\facade\Cache;
use think\facade\Config;
use think\facade\Log;

/**
 * 订单创建
 * Class StoreOrderCreateServices
 * @package app\services\order
 */
class StoreOrderCreateServices extends BaseServices
{
    /**
     * StoreOrderCreateServices constructor.
     * @param StoreOrderDao $dao
     */
    public function __construct(StoreOrderDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 使用雪花算法生成订单ID
     * @return string
     * @throws \Exception
     */
    public function getNewOrderId(string $prefix = 'wx')
    {
        $snowflake = new \Godruoyi\Snowflake\Snowflake();

        if (Config::get('cache.default') == 'file') {
            //32位
            if (PHP_INT_SIZE == 4) {
                $id = abs($snowflake->id());
            } else {
                $id = $snowflake->setStartTimeStamp(strtotime('2022-01-01') * 1000)->id();
            }
            $replace = '';
            $chars = '0123456789';
            for ($i = 0; $i < 6; $i++) {
                $replace .= $chars[mt_rand(0, strlen($chars) - 1)];
            }
            $id = substr_replace($id, $replace, -6);
        } else {
            $is_callable = function ($currentTime) {
                $redis = Cache::store('redis');
                $swooleSequenceResolver = new \Godruoyi\Snowflake\RedisSequenceResolver($redis->handler());
                return $swooleSequenceResolver->sequence($currentTime);
            };
            //32位
            if (PHP_INT_SIZE == 4) {
                $id = abs($snowflake->setSequenceResolver($is_callable)->id());
            } else {
                $id = $snowflake->setStartTimeStamp(strtotime('2022-01-01') * 1000)->setSequenceResolver($is_callable)->id();
            }
        }

        return $prefix . $id;
    }

    /**
     * 核销订单生成核销码
     * @return false|string
     */
    public function getStoreCode()
    {
        list($msec, $sec) = explode(' ', microtime());
        $num = time() + mt_rand(10, 999999) . '' . substr($msec, 2, 3);//生成随机数
        if (strlen($num) < 12)
            $num = str_pad((string)$num, 12, 0, STR_PAD_RIGHT);
        else
            $num = substr($num, 0, 12);
        if ($this->dao->count(['verify_code' => $num])) {
            return $this->getStoreCode();
        }
        return $num;
    }

    /**
     * 创建订单
     * @param $uid
     * @param $key
     * @param $userInfo
     * @param $addressId
     * @param $payType
     * @param false $useIntegral
     * @param int $couponId
     * @param string $mark
     * @param int $combinationId
     * @param int $pinkId
     * @param int $shippingType
     * @param string $real_name
     * @param string $phone
     * @param false $news
     * @param int $advanceId
     * @param array $customForm
     * @param int $invoice_id
     * @return mixed
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author 吴汐
     * @email 442384644@qq.com
     * @date 2023/03/01
     */
    public function createOrder($uid, $key, $userInfo, $addressId, $payType, $useIntegral = false, $couponId = 0, $mark = '', $combinationId = 0, $pinkId = 0, $shippingType = 1, $real_name = '', $phone = '', $news = false, $advanceId = 0, $customForm = [], $invoice_id = 0, $is_gift = 0, $gift_mark = '')
    {
        \app\services\CoreStore::assertOrder(compact('payType', 'useIntegral', 'shippingType'));
        /** @var StoreOrderServices $orderService */
        $storeOrderServices = app()->make(StoreOrderServices::class);
        $cartGroup = $storeOrderServices->getCacheOrderInfo($uid, $key);
        if (!$cartGroup) {
            throw new ApiException('订单已过期,请刷新当前页面');
        }

        if ($pinkId) {
            $pinkId = (int)$pinkId;
            /** @var StorePinkServices $pinkServices */
            $pinkServices = app()->make(StorePinkServices::class);
            if ($pinkServices->isPink($pinkId, $uid))
                throw new ApiStatusException('ORDER_EXIST', '订单生成失败，你已经在该团内不能再参加了', ['orderId' => $storeOrderServices->getStoreIdPink($pinkId, $uid)]);
            if ($storeOrderServices->getIsOrderPink($pinkId, $uid))
                throw new ApiStatusException('ORDER_EXIST', '订单生成失败，你已经参加该团了，请先支付订单', ['orderId' => $storeOrderServices->getStoreIdPink($pinkId, $uid)]);
        }
        $virtual_type = $cartGroup['cartInfo'][0]['productInfo']['virtual_type'] ?? 0;

        //下单前发票验证
        if ($invoice_id) {
            app()->make(UserInvoiceServices::class)->checkInvoice((int)$invoice_id, $uid);
        }

        /** @var StoreOrderComputedServices $computedServices */
        $computedServices = app()->make(StoreOrderComputedServices::class);
        $priceData = $computedServices->computedOrder($uid, $userInfo, $cartGroup, $addressId, $payType, $useIntegral, $couponId, true, $shippingType, $is_gift);
        /** @var WechatUserServices $wechatServices */
        $wechatServices = app()->make(WechatUserServices::class);
        /** @var UserAddressServices $addressServices */
        $addressServices = app()->make(UserAddressServices::class);
        if ($is_gift == 0) {
            if ($shippingType == 1 && $virtual_type == 0) {
                if (!$addressId) {
                    throw new ApiException('请选择收货地址');
                }
                if (!$addressInfo = $addressServices->getOne(['uid' => $uid, 'id' => $addressId, 'is_del' => 0]))
                    throw new ApiException('地址选择有误');
                $addressInfo = $addressInfo->toArray();
            } else {
                if ((!$real_name || !$phone) && $virtual_type == 0) {
                    throw new ApiException('请填写姓名和电话');
                }
                $addressInfo['real_name'] = $real_name;
                $addressInfo['phone'] = $phone;
                $addressInfo['province'] = '';
                $addressInfo['city'] = '';
                $addressInfo['district'] = '';
                $addressInfo['detail'] = '';
            }
        } else {
            $addressInfo['real_name'] = '';
            $addressInfo['phone'] = '';
            $addressInfo['province'] = '';
            $addressInfo['city'] = '';
            $addressInfo['district'] = '';
            $addressInfo['detail'] = '';
        }

        $cartInfo = $cartGroup['cartInfo'];
        $priceGroup = $cartGroup['priceGroup'];
        $cartIds = [];
        $totalNum = 0;
        foreach ($cartInfo as $cart) {
            $cartIds[] = $cart['id'];
            $totalNum += $cart['cart_num'];
            if (!$combinationId) $combinationId = $cart['combination_id'];
            if (!$advanceId) $advanceId = $cart['advance_id'];
        }
        if (count($cartInfo) == 1 && isset($cartInfo[0]['productInfo']['presale']) && $cartInfo[0]['productInfo']['presale'] == 1) {
            $advance_id = $cartInfo[0]['product_id'];
        } else {
            $advance_id = 0;
        }
        if ($combinationId) {
            $couponId = 0;
            $useIntegral = false;
        }
        if ($is_gift == 1) $shippingType = 0;

        $orderInfo = [
            'uid' => $uid,
            'order_id' => $this->getNewOrderId('cp'),
            'real_name' => $addressInfo['real_name'],
            'user_phone' => $addressInfo['phone'],
            'user_address' => $addressInfo['province'] . ' ' . $addressInfo['city'] . ' ' . $addressInfo['district'] . ' ' . $addressInfo['detail'],
            'cart_id' => $cartIds,
            'total_num' => $totalNum,
            'total_price' => $priceGroup['totalPrice'],
            'total_postage' => $shippingType == 1 ? $priceGroup['storePostage'] : 0,
            'coupon_id' => $couponId,
            'coupon_price' => $priceData['coupon_price'],
            'pay_price' => $priceData['pay_price'],
            'pay_postage' => $priceData['pay_postage'],
            'deduction_price' => $priceData['deduction_price'],
            'gift_price' => $priceData['gift_price'],
            'paid' => 0,
            'pay_type' => $payType,
            'use_integral' => 0,
            'gain_integral' => 0,
            'mark' => htmlspecialchars($mark),
            'combination_id' => $combinationId,
            'pink_id' => $pinkId,
            'seckill_id' => 0,
            'bargain_id' => 0,
            'advance_id' => $advance_id,
            'cost' => $priceGroup['costPrice'],
            'add_time' => time(),
            'unique' => $key,
            'shipping_type' => $shippingType,
            'channel_type' => $userInfo['user_type'],
            'province' => strval($userInfo['user_type'] == 'wechat' || $userInfo['user_type'] == 'routine' ? $wechatServices->value(['uid' => $uid, 'user_type' => $userInfo['user_type']], 'province') : ''),
            'spread_uid' => 0,
            'spread_two_uid' => 0,
            'virtual_type' => $virtual_type,
            'is_gift' => $is_gift,
            'gift_mark' => $gift_mark,
            'pay_uid' => $uid,
            'custom_form' => json_encode($customForm),
            'division_id' => 0,
            'agent_id' => 0,
            'staff_id' => 0,
        ];

        /** @var StoreOrderCartInfoServices $cartServices */
        $cartServices = app()->make(StoreOrderCartInfoServices::class);
        $priceData['coupon_id'] = $couponId;
        $order = $this->transaction(function () use ($cartIds, $orderInfo, $cartInfo, $key, $userInfo, $useIntegral, $priceData, $combinationId, $cartServices, $uid, $addressId, $advanceId) {
            //创建订单
            $order = $this->dao->save($orderInfo);
            if (!$order) {
                throw new ApiException('订单生成失败');
            }
            //记录自提人电话和姓名
            /** @var UserServices $userService */
            $userService = app()->make(UserServices::class);
            $realName = $userService->value(['uid' => $uid], 'real_name');
            if ($realName == '') $userService->update(['uid' => $uid], ['real_name' => $orderInfo['real_name'], 'record_phone' => $orderInfo['user_phone']]);
            //扣库存
            $this->decGoodsStock($cartInfo, $combinationId, $advanceId);
            //保存购物车商品信息
            $cartServices->setCartInfo($order['id'], $uid, $cartInfo);
            return $order;
        });

        //创建开票数据
        if ($invoice_id) {
            app()->make(StoreOrderInvoiceServices::class)->makeUp($uid, $order['order_id'], (int)$invoice_id);
        }

        // 订单创建成功后置事件
        event('OrderCreateAfterListener', [$order, compact('cartInfo', 'priceData', 'addressId', 'cartIds', 'news'), $uid, $key, $combinationId]);
        // 推送订单
        event('OutPushListener', ['order_create_push', ['order_id' => (int)$order['id']]]);

        //自定义事件-订单创建事件
        event('CustomEventListener', ['order_create', [
            'uid' => $uid,
            'id' => (int)$order['id'],
            'order_id' => $order['order_id'],
            'real_name' => $order['real_name'],
            'user_phone' => $order['user_phone'],
            'user_address' => $order['user_address'],
            'total_num' => $order['total_num'],
            'pay_price' => $order['pay_price'],
            'pay_postage' => $order['pay_postage'],
            'deduction_price' => $order['deduction_price'],
            'coupon_price' => $order['coupon_price'],
            'store_name' => app()->make(StoreOrderCartInfoServices::class)->getCarIdByProductTitle((int)$order['id']),
            'add_time' => date('Y-m-d H:i:s', $order['add_time']),
        ]]);

        return $order;
    }


    /**
     * 扣库存
     * @param array $cartInfo
     * @param int $combinationId
     */
    public function decGoodsStock(array $cartInfo, int $combinationId, int $advanceId)
    {
        $res5 = true;
        /** @var StoreProductServices $services */
        $services = app()->make(StoreProductServices::class);
        /** @var StoreCombinationServices $pinkServices */
        $pinkServices = app()->make(StoreCombinationServices::class);
        /** @var StoreAdvanceServices $advanceServices */
        $advanceServices = app()->make(StoreAdvanceServices::class);
        try {
            foreach ($cartInfo as $cart) {
                //减库存加销量
                if ($combinationId) $res5 = $res5 && $pinkServices->decCombinationStock((int)$cart['cart_num'], $combinationId, isset($cart['productInfo']['attrInfo']) ? $cart['productInfo']['attrInfo']['unique'] : '');
                else if ($advanceId) $res5 = $res5 && $advanceServices->decAdvanceStock((int)$cart['cart_num'], $advanceId, isset($cart['productInfo']['attrInfo']) ? $cart['productInfo']['attrInfo']['unique'] : '');
                else $res5 = $res5 && $services->decProductStock((int)$cart['cart_num'], (int)$cart['productInfo']['id'], isset($cart['productInfo']['attrInfo']) ? $cart['productInfo']['attrInfo']['unique'] : '');
            }
            if (!$res5) {
                throw new ApiException('选择的规格库存不足');
            }
        } catch (\Throwable $e) {
            throw new ApiException('选择的规格库存不足');
        }
    }

    /**
     * 订单数据创建之后的商品实际金额计算，佣金计算，优惠折扣计算，设置默认地址，清理购物车
     * @param $order
     * @param array $group
     * @param $activity
     */
    public function orderCreateAfter($order, array $group, $activity)
    {
        /** @var UserAddressServices $addressServices */
        $addressServices = app()->make(UserAddressServices::class);
        //设置用户默认地址
        if (!$addressServices->be(['is_default' => 1, 'uid' => $order['uid']])) {
            $addressServices->setDefaultAddress($group['addressId'], $order['uid']);
            $province = $addressServices->value(['id' => $group['addressId']], 'province') ?? '';
            app()->make(WechatUserServices::class)->update(['uid' => $order['uid']], ['province' => $province]);
        }
        //删除购物车
        if ($group['news']) {
            array_map(function ($key) {
                CacheService::delete($key);
            }, $group['cartIds']);
        } else {
            /** @var StoreCartServices $cartServices */
            $cartServices = app()->make(StoreCartServices::class);
            $cartServices->deleteCartStatus($group['cartIds']);
        }
        $uid = (int)$order['uid'];
        $orderId = (int)$order['id'];
        try {
            $cartInfo = $group['cartInfo'] ?? [];
            $priceData = $group['priceData'] ?? [];
            $addressId = $group['addressId'] ?? 0;
            /** @var StoreOrderCreateServices $createService */
            $createService = app()->make(StoreOrderCreateServices::class);
            if ($cartInfo && $priceData) {
                /** @var StoreOrderCartInfoServices $cartServices */
                $cartServices = app()->make(StoreOrderCartInfoServices::class);
                $cartInfo = $createService->computeOrderProductTruePrice($cartInfo, $priceData, $addressId, $uid, $order);
                $cartServices->updateCartInfo($orderId, $cartInfo);
            }
        } catch (\Throwable $e) {
            throw new ApiException('计算订单实际优惠、邮费失败，原因：' . $e->getMessage());
        }
    }

    /**
     * 计算订单每个商品真实付款价格
     * @param array $cartInfo
     * @param array $priceData
     * @param $addressId
     * @param int $uid
     * @return array
     */
    public function computeOrderProductTruePrice(array $cartInfo, array $priceData, $addressId, int $uid, $orderInfo)
    {
        //统一放入默认数据
        foreach ($cartInfo as &$cart) {
            $cart['use_integral'] = 0;
            $cart['integral_price'] = 0.00;
            $cart['coupon_price'] = 0.00;
        }
        try {
            $cartInfo = $this->computeOrderProductCoupon($cartInfo, $priceData);
        } catch (\Throwable $e) {
            Log::error('订单商品结算失败,File：' . $e->getFile() . ',Line：' . $e->getLine() . ',Message：' . $e->getMessage());
            throw new ApiException('订单商品结算失败');
        }
        //truePice实际支付单价（存在）
        foreach ($cartInfo as &$cart) {
            $coupon_price = $cart['coupon_price'] ?? 0;
            $cart['sum_true_price'] = bcmul((string)$cart['truePrice'], (string)$cart['cart_num'], 2);
            if ($coupon_price) {
                $cart['sum_true_price'] = bcsub((string)$cart['sum_true_price'], (string)$coupon_price, 2);
                $uni_coupon_price = (string)bcdiv((string)$coupon_price, (string)$cart['cart_num'], 4);
                $cart['truePrice'] = $cart['truePrice'] > $uni_coupon_price ? bcsub((string)$cart['truePrice'], $uni_coupon_price, 2) : 0;
            }
            if ($cart['sum_true_price'] < 0) $cart['sum_true_price'] = '0.00';
        }
        return $cartInfo;
    }

    /**
     * 计算每个商品实际支付运费
     * @param array $cartInfo
     * @param array $priceData
     * @return array
     */
    public function computeOrderProductPostage(array $cartInfo, array $priceData, $addressId)
    {
        $storePostage = $priceData['pay_postage'] ?? 0;
        if ($storePostage) {
            /** @var UserAddressServices $addressServices */
            $addressServices = app()->make(UserAddressServices::class);
            $addr = $addressServices->getAddress($addressId);
            if ($addr) {
                $addr = $addr->toArray();
                //按照运费模板计算每个运费模板下商品的件数/重量/体积以及总金额 按照首重倒序排列
                $cityId = $addr['city_id'] ?? 0;
                $tempIds[] = 1;
                foreach ($cartInfo as $key_c => $item_c) {
                    $tempIds[] = $item_c['productInfo']['temp_id'];
                }
                $tempIds = array_unique($tempIds);
                /** @var ShippingTemplatesServices $shippServices */
                $shippServices = app()->make(ShippingTemplatesServices::class);
                $temp = $shippServices->getShippingColumn(['id' => $tempIds], 'type,appoint', 'id');
                /** @var ShippingTemplatesRegionServices $regionServices */
                $regionServices = app()->make(ShippingTemplatesRegionServices::class);
                $regions = $regionServices->getTempRegionList($tempIds, [$cityId, 0], 'temp_id,first,first_price,continue,continue_price', 'temp_id');
                $temp_num = [];
                foreach ($cartInfo as $cart) {
                    $tempId = $cart['productInfo']['temp_id'] ?? 1;
                    $type = $temp[$tempId]['type'] ?? $temp[1]['type'];
                    if ($type == 1) {
                        $num = $cart['cart_num'];
                    } elseif ($type == 2) {
                        $num = $cart['cart_num'] * $cart['productInfo']['attrInfo']['weight'];
                    } else {
                        $num = $cart['cart_num'] * $cart['productInfo']['attrInfo']['volume'];
                    }
                    $region = $regions[$tempId] ?? $regions[1];
                    if (!isset($temp_num[$cart['productInfo']['temp_id']])) {
                        $temp_num[$cart['productInfo']['temp_id']]['cart_id'][] = $cart['id'];
                        $temp_num[$cart['productInfo']['temp_id']]['number'] = $num;
                        $temp_num[$cart['productInfo']['temp_id']]['type'] = $type;
                        $temp_num[$cart['productInfo']['temp_id']]['price'] = bcmul($cart['cart_num'], $cart['truePrice'], 2);
                        $temp_num[$cart['productInfo']['temp_id']]['first'] = $region['first'];
                        $temp_num[$cart['productInfo']['temp_id']]['first_price'] = $region['first_price'];
                        $temp_num[$cart['productInfo']['temp_id']]['continue'] = $region['continue'];
                        $temp_num[$cart['productInfo']['temp_id']]['continue_price'] = $region['continue_price'];
                        $temp_num[$cart['productInfo']['temp_id']]['temp_id'] = $cart['productInfo']['temp_id'];
                        $temp_num[$cart['productInfo']['temp_id']]['city_id'] = $addr['city_id'];
                    } else {
                        $temp_num[$cart['productInfo']['temp_id']]['cart_id'][] = $cart['id'];
                        $temp_num[$cart['productInfo']['temp_id']]['number'] += $num;
                        $temp_num[$cart['productInfo']['temp_id']]['price'] += bcmul($cart['cart_num'], $cart['truePrice'], 2);
                    }
                }
                $cartInfo = array_combine(array_column($cartInfo, 'id'), $cartInfo);
                /** @var ShippingTemplatesFreeServices $freeServices */
                $freeServices = app()->make(ShippingTemplatesFreeServices::class);
                foreach ($temp_num as $k => $v) {
                    if (isset($temp[$v['temp_id']]['appoint']) && $temp[$v['temp_id']]['appoint']) {
                        if ($freeServices->isFree($v['temp_id'], $v['city_id'], $v['number'], $v['price'], $v['type'])) {
                            //免运费
                            foreach ($v['cart_id'] as $c_id) {
                                if (isset($cartInfo[$c_id])) $cartInfo[$c_id]['postage_price'] = 0.00;
                            }
                        }
                    }
                }
                $count = 0;
                $compute_price = 0.00;
                $total_price = 0;
                $postage_price = 0.00;
                foreach ($cartInfo as &$cart) {
                    if (isset($cart['postage_price'])) {//免运费
                        continue;
                    }
                    $total_price = bcadd((string)$total_price, (string)bcmul((string)$cart['truePrice'], (string)$cart['cart_num'], 4), 2);
                    $count++;
                }
                foreach ($cartInfo as &$cart) {
                    if (isset($cart['postage_price'])) {//免运费
                        continue;
                    }
                    if ($count > 1) {
                        $postage_price = bcmul((string)bcdiv((string)bcmul((string)$cart['cart_num'], (string)$cart['truePrice'], 4), (string)$total_price, 4), (string)$storePostage, 2);
                        $compute_price = bcadd((string)$compute_price, (string)$postage_price, 2);
                    } else {
                        $postage_price = bcsub((string)$storePostage, $compute_price, 2);
                    }
                    $cart['postage_price'] = $postage_price;
                    $count--;
                }
                $cartInfo = array_merge($cartInfo);
            }
        }
        //保证不进运费模版计算的购物车商品postage_price字段有值
        foreach ($cartInfo as &$item) {
            if (!isset($item['postage_price'])) $item['postage_price'] = 0.00;
        }
        return $cartInfo;
    }

    /**
     * 计算订单商品优惠券实际抵扣金额
     * @param array $cartInfo
     * @param array $priceData
     * @return array
     */
    public function computeOrderProductCoupon(array $cartInfo, array $priceData)
    {
        if ($priceData['coupon_id'] && $priceData['coupon_price'] ?? 0) {
            $count = 0;
            $total_price = 0.00;
            $compute_price = 0.00;
            $coupon_price = 0.00;
            /** @var StoreCouponUserServices $couponServices */
            $couponServices = app()->make(StoreCouponUserServices::class);
            $couponInfo = $couponServices->getOne(['id' => $priceData['coupon_id']], '*', ['issue']);
            if ($couponInfo) {
                $type = $couponInfo['applicable_type'] ?? 0;
                $counpon_id = $couponInfo['id'];
                switch ($type) {
                    case 0:
                    case 3:
                        foreach ($cartInfo as $cart) {
                            $total_price = bcadd((string)$total_price, (string)bcmul((string)$cart['truePrice'], (string)$cart['cart_num'], 4), 2);
                            $count++;
                        }
                        foreach ($cartInfo as &$cart) {
                            if ($count > 1) {
                                $coupon_price = bcmul((string)bcdiv((string)bcmul((string)$cart['cart_num'], (string)$cart['truePrice'], 4), (string)$total_price, 4), (string)$couponInfo['coupon_price'], 2);
                                $compute_price = bcadd((string)$compute_price, (string)$coupon_price, 2);
                            } else {
                                $coupon_price = bcsub((string)$couponInfo['coupon_price'], $compute_price, 2);
                            }
                            $cart['coupon_price'] = $coupon_price;
                            $cart['coupon_id'] = $counpon_id;
                            $count--;
                        }
                        break;
                    case 1://品类券
                        /** @var StoreCategoryServices $storeCategoryServices */
                        $storeCategoryServices = app()->make(StoreCategoryServices::class);
                        $coupon_category = explode(',', (string)$couponInfo['category_id']);
                        $category_ids = $storeCategoryServices->getAllById($coupon_category);
                        if ($category_ids) {
                            $cateIds = array_column($category_ids, 'id');
                            foreach ($cartInfo as $cart) {
                                if (isset($cart['productInfo']['cate_id']) && array_intersect(explode(',', $cart['productInfo']['cate_id']), $cateIds)) {
                                    $total_price = bcadd((string)$total_price, (string)bcmul((string)$cart['truePrice'], (string)$cart['cart_num'], 4), 2);
                                    $count++;
                                }
                            }
                            foreach ($cartInfo as &$cart) {
                                $cart['coupon_id'] = 0;
                                $cart['coupon_price'] = 0;
                                if (isset($cart['productInfo']['cate_id']) && array_intersect(explode(',', $cart['productInfo']['cate_id']), $cateIds)) {
                                    if ($count > 1) {
                                        $coupon_price = bcmul((string)bcdiv((string)bcmul((string)$cart['cart_num'], (string)$cart['truePrice'], 4), (string)$total_price, 4), (string)$couponInfo['coupon_price'], 2);
                                        $compute_price = bcadd((string)$compute_price, (string)$coupon_price, 2);
                                    } else {
                                        $coupon_price = bcsub((string)$couponInfo['coupon_price'], $compute_price, 2);
                                    }
                                    $cart['coupon_id'] = $counpon_id;
                                    $cart['coupon_price'] = $coupon_price;
                                    $count--;
                                }
                            }
                        }
                        break;
                    case 2://商品劵
                        foreach ($cartInfo as $cart) {
                            if (isset($cart['product_id']) && in_array($cart['product_id'], explode(',', $couponInfo['product_id']))) {
                                $total_price = bcadd((string)$total_price, (string)bcmul((string)$cart['truePrice'], (string)$cart['cart_num'], 4), 2);
                                $count++;
                            }
                        }
                        foreach ($cartInfo as &$cart) {
                            $cart['coupon_id'] = 0;
                            $cart['coupon_price'] = 0;
                            if (isset($cart['product_id']) && in_array($cart['product_id'], explode(',', $couponInfo['product_id']))) {
                                if ($count > 1) {
                                    $coupon_price = bcmul((string)bcdiv((string)bcmul((string)$cart['cart_num'], (string)$cart['truePrice'], 4), (string)$total_price, 4), (string)$couponInfo['coupon_price'], 2);
                                    $compute_price = bcadd((string)$compute_price, (string)$coupon_price, 2);
                                } else {
                                    $coupon_price = bcsub((string)$couponInfo['coupon_price'], $compute_price, 2);
                                }
                                $cart['coupon_id'] = $counpon_id;
                                $cart['coupon_price'] = $coupon_price;
                                $count--;
                            }
                        }
                        break;
                }
            }
        }
        return $cartInfo;
    }
}
