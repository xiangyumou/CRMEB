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

namespace app\jobs;

use app\services\activity\combination\StoreCombinationServices;
use app\services\kefu\service\StoreServiceServices;
use app\services\order\StoreOrderCartInfoServices;
use app\services\order\StoreOrderServices;
use app\services\product\product\StoreProductServices;
use app\services\user\UserLabelRelationServices;
use app\services\user\UserServices;
use app\services\wechat\WechatUserServices;
use crmeb\basic\BaseJobs;
use crmeb\services\app\WechatService;
use crmeb\services\workerman\ChannelService;
use crmeb\traits\QueueTrait;
use think\exception\ValidateException;
use think\facade\Log;

/**
 * 订单消息队列
 * Class OrderJob
 * @package crmeb\jobs
 */
class OrderJob extends BaseJobs
{
    use QueueTrait;

    /**
     * 执行订单支付成功发送消息
     * @param $order
     * @return bool
     */
    public function doJob($order)
    {
        //更新用户支付订单数量
        try {
            $this->setUserPayCount($order);
        } catch (\Throwable $e) {
            Log::error('更新用户订单数失败,失败原因:' . $e->getMessage());
        }
        //增加用户标签
        try {
            $this->setUserLabel($order);
        } catch (\Throwable $e) {
            Log::error('用户标签添加失败,失败原因:' . $e->getMessage());
        }
        try {
            if (in_array($order['is_channel'], [0, 2])) {//公众号发送模板消息
                $this->sendOrderPaySuccessCustomerService($order, 1);
            } else if (in_array($order['is_channel'], [1, 2])) {//小程序发送模板消息
                $this->sendOrderPaySuccessCustomerService($order, 0);
            }
        } catch (\Exception $e) {
            throw new ValidateException('发送客服消息,短信消息失败,失败原因:' . $e->getMessage());
        }


        //打印小票
//        $switch = sys_config('pay_success_printing_switch') ? true : false;
//        if ($switch) {
//            try {
//                /** @var StoreOrderServices $orderServices */
//                $orderServices = app()->make(StoreOrderServices::class);
//                $orderServices->orderPrint($order, $order['cart_id']);
//            } catch (\Throwable $e) {
//                Log::error('打印小票发生错误,错误原因:' . $e->getMessage());
//            }
//        }

        //向后台发送新订单消息
        try {
            ChannelService::instance()->send('NEW_ORDER', ['order_id' => $order['order_id']]);
        } catch (\Throwable $e) {
            Log::error('向后台发送新订单消息失败,失败原因:' . $e->getMessage());
        }
        return true;
    }

    /**
     * 设置用户购买次数
     * @param $order
     */
    public function setUserPayCount($order)
    {
        /** @var UserServices $userServices */
        $userServices = app()->make(UserServices::class);
        $userInfo = $userServices->get($order['uid']);
        if ($userInfo) {
            $userInfo->pay_count = $userInfo->pay_count + 1;
            $userInfo->save();
        }
    }

    /**
     * 设置用户购买的标签
     * @param $order
     */
    public function setUserLabel($order)
    {
        /** @var StoreOrderCartInfoServices $cartInfoServices */
        $cartInfoServices = app()->make(StoreOrderCartInfoServices::class);
        $productIds = $cartInfoServices->getCartColunm(['oid' => $order['id']], 'product_id', '');
        /** @var StoreProductServices $productServices */
        $productServices = app()->make(StoreProductServices::class);
        $label = $productServices->getColumn([['id', 'in', $productIds]], 'label_id');
        $labelIds = array_unique(explode(',', implode(',', $label)));
        /** @var UserLabelRelationServices $labelServices */
        $labelServices = app()->make(UserLabelRelationServices::class);
        $where = [
            ['label_id', 'in', $labelIds],
            ['uid', '=', $order['uid']]
        ];
        $data = [];
        $userLabel = $labelServices->getColumn($where, 'label_id');
        foreach ($labelIds as $item) {
            if (!in_array($item, $userLabel)) {
                $data[] = ['uid' => $order['uid'], 'label_id' => $item];
            }
        }
        $re = true;
        if ($data) {
            $re = $labelServices->saveAll($data);
        }
        return $re;
    }


    /**
     * 订单支付成功后给客服发送客服消息
     * @param $order
     * @param int $type 1 公众号 0 小程序
     * @return string
     */
    public function sendOrderPaySuccessCustomerService($order, $type = 0)
    {
        /** @var StoreServiceServices $services */
        $services = app()->make(StoreServiceServices::class);
        /** @var WechatUserServices $wechatUserServices */
        $wechatUserServices = app()->make(WechatUserServices::class);
        $serviceOrderNotice = $services->getStoreServiceOrderNotice();
        if (count($serviceOrderNotice)) {
            /** @var StoreProductServices $services */
            $services = app()->make(StoreProductServices::class);
            /** @var StoreCombinationServices $pinkServices */
            $pinkServices = app()->make(StoreCombinationServices::class);
            /** @var StoreOrderCartInfoServices $cartInfoServices */
            $cartInfoServices = app()->make(StoreOrderCartInfoServices::class);
            foreach ($serviceOrderNotice as $item) {
                $userInfo = $wechatUserServices->getOne(['uid' => $item['uid'], 'user_type' => 'wechat']);
                if ($userInfo) {
                    $userInfo = $userInfo->toArray();
                    if ($userInfo['subscribe'] && $userInfo['openid']) {
                        if ($item['customer']) {
                            // 统计管理开启  推送图文消息
                            $head = '订单提醒 订单号：' . $order['order_id'];
                            $url = sys_config('site_url') . '/pages/admin/orderDetail/index?id=' . $order['order_id'];
                            $description = '';
                            $image = sys_config('site_logo');
                            if (isset($order['combination_id']) && $order['combination_id'] > 0) {
                                $description .= '拼团商品：' . $pinkServices->value(['id' => $order['combination_id']], 'title');
                                $image = $pinkServices->value(['id' => $order['combination_id']], 'image');
                            } else {
                                $productIds = $cartInfoServices->getCartIdsProduct($order['id']);
                                $storeProduct = $services->getProductArray([['id', 'in', $productIds]], 'image,store_name', 'id');
                                if (count($storeProduct)) {
                                    foreach ($storeProduct as $value) {
                                        $description .= $value['store_name'] . '  ';
                                        $image = $value['image'];
                                    }
                                }
                            }
                            $message = WechatService::newsMessage($head, $description, $url, $image);
                            try {
                                WechatService::staffService()->message($message)->to($userInfo['openid'])->send();
                            } catch (\Exception $e) {
                                Log::error($userInfo['nickname'] . '发送失败' . $e->getMessage());
                            }
                        } else {
                            // 推送文字消息
                            $head = "客服提醒：亲,您有一个新订单 \r\n订单单号:{$order['order_id']}\r\n支付金额：￥{$order['pay_price']}\r\n备注信息：{$order['mark']}\r\n订单来源：小程序";
                            if ($type) $head = "客服提醒：亲,您有一个新订单 \r\n订单单号:{$order['order_id']}\r\n支付金额：￥{$order['pay_price']}\r\n备注信息：{$order['mark']}\r\n订单来源：公众号";
                            try {
                                WechatService::staffService()->message($head)->to($userInfo['openid'])->send();
                            } catch (\Exception $e) {
                                Log::error($userInfo['nickname'] . '发送失败' . $e->getMessage());
                            }
                        }
                    }
                }

            }
        }
    }

}
