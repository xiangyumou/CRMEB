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


use app\dao\order\StoreOrderDao;
use app\services\BaseServices;
use app\services\user\UserServices;
use crmeb\exceptions\ApiException;
use crmeb\utils\Str;
use think\facade\Log;

/**
 * 订单收货
 * Class StoreOrderTakeServices
 * @package app\services\order
 * @method get(int $id, ?array $field = []) 获取一条
 */
class StoreOrderTakeServices extends BaseServices
{
    /**
     * 构造方法
     * StoreOrderTakeServices constructor.
     * @param StoreOrderDao $dao
     */
    public function __construct(StoreOrderDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 小程序订单服务收货
     * @param $merchant_trade_no
     * @return bool
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     *
     * @date 2023/05/18
     * @author yyw
     */
    public function miniOrderTakeOrder($merchant_trade_no)
    {
        //查找订单信息
        $order = $this->dao->getOne(['order_id' => $merchant_trade_no]);
        if (!$order) {
            return true;
        }
        if ($order['pid'] == -1) {  // 有子订单
            // 查找待收货的子订单
            $son_order_list = $this->dao->getSubOrderNotSendList((int)$order['id']);
            foreach ($son_order_list as $son_order) {
                $this->takeOrder($son_order['order_id'], $son_order['uid']);
            }
        } else {
            $this->takeOrder($merchant_trade_no, $order['uid']);
        }

        return true;
    }

    /**
     * 用户订单收货
     * @param $uni
     * @param $uid
     * @return bool
     */
    public function takeOrder(string $uni, int $uid)
    {
        $order = $this->dao->getUserOrderDetail($uni, $uid);
        if (!$order) {
            throw new ApiException('订单不存在');
        }
        $refundServices = app()->make(StoreOrderRefundServices::class);
        $orderIsRefund = $refundServices->orderIsRefund((int)$order['id']);
        if($orderIsRefund){
            throw new ApiException('订单退款中，不能收货');
        }
        /** @var StoreOrderServices $orderServices */
        $orderServices = app()->make(StoreOrderServices::class);
        $order = $orderServices->tidyOrder($order);
        if ($order['_status']['_type'] != 2) {
            throw new ApiException('订单状态错误');
        }
        //存在拆分发货 需要分开收货
        if ($this->dao->count(['pid' => $order['id']])) {
            throw new ApiException('订单状态错误');
        }
        $order->status = 2;
        $res = $order->save() && $this->storeProductOrderUserTakeDelivery($order);
        if (!$res) {
            throw new ApiException('收货失败');
        }
        return $order;
    }

    /**
     * 订单确认收货
     * @param $order
     * @return bool
     */
    public function storeProductOrderUserTakeDelivery($order, bool $isTran = true)
    {
        /** @var UserServices $userServices */
        $userServices = app()->make(UserServices::class);
        $userInfo = $userServices->get((int)$order['uid']);
        //获取购物车内的商品标题
        /** @var StoreOrderCartInfoServices $orderInfoServices */
        $orderInfoServices = app()->make(StoreOrderCartInfoServices::class);
        $storeName = $orderInfoServices->getCarIdByProductTitle((int)$order['id']);
        $storeTitle = Str::substrUTf8($storeName, 20, 'UTF-8', '');

        // Taking delivery only notifies and queues follow-up work now: the points,
        // commission and experience rewards left no database work behind.
        try {
            // 收货成功后置队列
            event('OrderTakeListener', [$order, $userInfo, $storeTitle]);
            //收货给用户发送消息
            event('NoticeListener', [['order' => $order, 'storeTitle' => $storeTitle], 'order_take']);
            //收货给客服发送消息
            event('NoticeListener', [['order' => $order, 'storeTitle' => $storeTitle], 'send_admin_confirm_take_over']);
            //自定义消息-订单收货
            $order['storeTitle'] = $storeTitle;
            $order['time'] = date('Y-m-d H:i:s');
            $order['phone'] = $order['user_phone'];
            event('CustomNoticeListener', [$order['uid'], $order, 'order_take']);

            //自定义事件-订单收货/核销
            event('CustomEventListener', ['order_take', [
                'uid' => $order['uid'],
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
                'store_name' => $storeTitle,
                'add_time' => date('Y-m-d H:i:s', $order['add_time']),
            ]]);
        } catch (\Throwable $exception) {

        }
        return true;
    }

    /**
     * 自动收货
     * @return bool
     */
    public function autoTakeOrder()
    {
        //7天前时间戳
        $systemDeliveryTime = sys_config('system_delivery_time', 0);
        //0为取消自动收货功能
        if ($systemDeliveryTime == 0) {
            return true;
        }
        $sevenDay = bcsub((string)time(), bcmul((string)$systemDeliveryTime, '86400'));
        /** @var StoreOrderStoreOrderStatusServices $service */
        $service = app()->make(StoreOrderStoreOrderStatusServices::class);
        $orderList = $service->getTakeOrderIds([
            'change_time' => $sevenDay,
            'is_del' => 0,
            'paid' => 1,
            'status' => 1,
            'change_type' => ['delivery_goods', 'delivery_fictitious', 'delivery']
        ]);
        foreach ($orderList as $order) {
            if ($order['status'] == 2) {
                continue;
            }
            if ($order['paid'] == 1 && $order['status'] == 1) {
                $data['status'] = 2;
            } else {
                continue;
            }
            try {
                $this->transaction(function () use ($order, $data) {
                    /** @var StoreOrderStatusServices $statusService */
                    $statusService = app()->make(StoreOrderStatusServices::class);
                    $res = $this->dao->update($order['id'], $data) && $statusService->save([
                            'oid' => $order['id'],
                            'change_type' => 'take_delivery',
                            'change_message' => '已收货[自动收货]',
                            'change_time' => time()
                        ]);
                    $res = $res && $this->storeProductOrderUserTakeDelivery($order, false);
                    if (!$res) {
                        Log::error('订单号' . $order['order_id'] . '自动收货失败');
                    }
                });
            } catch (\Throwable $e) {
                Log::error('自动收货失败,失败原因：' . $e->getMessage() . '|' . $e->getFile() . '|' . $e->getLine());
            }

        }
    }

    /**
     * 检查主订单是否需要修改状态
     * @param $pid
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function checkMaster($pid)
    {
        $p_order = $this->dao->get((int)$pid, ['id,pid,status']);
        //主订单全部发货 且子订单没有待收货 有待评价
        if ($p_order['status'] == 1 && !$this->dao->count(['pid' => $pid, 'status' => 2]) && $this->dao->count(['pid' => $pid, 'status' => 3])) {
            $this->dao->update($p_order['id'], ['status' => 2]);
            /** @var StoreOrderStatusServices $statusService */
            $statusService = app()->make(StoreOrderStatusServices::class);
            $statusService->save([
                'oid' => $p_order['id'],
                'change_type' => 'take_delivery',
                'change_message' => '已收货',
                'change_time' => time()
            ]);
        }
    }
}
