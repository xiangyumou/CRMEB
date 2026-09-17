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

namespace app\listener\notice;

use app\services\message\notice\{
    EnterpriseWechatService,
    RoutineTemplateListService,
    SmsService,
    SystemMsgService,
    WechatTemplateListService
};
use app\services\order\StoreOrderCartInfoServices;
use app\services\user\UserServices;
use crmeb\interfaces\ListenerInterface;
use crmeb\utils\Str;

/**
 * 消息类
 * @author: 吴汐
 * @email: 442384644@qq.com
 * @date: 2023/8/29
 */
class NoticeListener implements ListenerInterface
{
    /**
     * @var array
     */
    protected $services = [];

    /**
     * 方法
     * @var string[]
     */
    protected $eventMethods = [
        'order_pay_success' => 'handleOrderPaySuccess',
        'order_deliver_success' => 'handleOrderDeliverSuccess',
        'order_postage_success' => 'handleOrderPostageSuccess',
        'order_take' => 'handleOrderTake',
        'price_revision' => 'handlePriceRevision',
        'order_refund' => 'handleOrderRefund',
        'send_order_refund_no_status' => 'handleSendOrderRefundNoStatus',
        'can_pink_success' => 'handlePinkSuccess',
        'open_pink_success' => 'handlePinkSuccess',
        'order_user_groups_success' => 'handleGroupsSuccess',
        'send_order_pink_fial' => 'handlePinkFail',
        'send_order_pink_clone' => 'handlePinkFail',
        'order_pay_false' => 'handleOrderPayFalse',
        'admin_pay_success_code' => 'handleAdminPaySuccessCode',
        'send_admin_confirm_take_over' => 'handleSendAdminConfirmTakeOver',
        'send_order_apply_refund' => 'handleSendOrderApplyRefund',
        'revenue_received' => 'handleRevenueReceived',
        // add more event-method mappings here...
    ];

    /**
     * 启动加载
     */
    public function __construct()
    {
        $this->services = [
            'Wechat' => app()->make(WechatTemplateListService::class),
            'Routine' => app()->make(RoutineTemplateListService::class),
            'SysMsg' => app()->make(SystemMsgService::class),
            'WeWork' => app()->make(EnterpriseWechatService::class),
            'Sms' => app()->make(SmsService::class)
        ];
    }

    /**
     * 获取对象
     * @param $mark
     * @return NoticeService
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    private function getNoticeService($mark)
    {
        return $this->services[$mark];
    }

    /**
     * 执行方法
     * @param $event
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    public function handle($event): void
    {
        try {
            [$data, $mark] = $event;
            if ($mark) {
                $this->getNoticeService('SysMsg')->setEvent($mark);     //站内信
                $this->getNoticeService('Sms')->setEvent($mark);        //短信
                $this->getNoticeService('Wechat')->setEvent($mark);     //模版消息
                $this->getNoticeService('Routine')->setEvent($mark);    //订阅消息
                $this->getNoticeService('WeWork')->setEvent($mark);     //企业微信消息
                if (isset($this->eventMethods[$mark])) {
                    $method = $this->eventMethods[$mark];
                    call_user_func([$this, $method], $data);
                }
            }
        } catch (\Throwable $e) {
        }
    }

    /**
     * 支付成功给用户发送消息
     * @param $data
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleOrderPaySuccess($data)
    {
        $pay_price = $data['pay_price'];
        $order_id = $data['order_id'];
        $data['is_channel'] = $data['is_channel'] ?? 2;
        $data['total_num'] = $data['total_num'] ?? 1;
        $data['storeName'] = Str::substrUTf8($data['storeName'], 20, 'UTF-8', '');

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($data['uid'], ['order_id' => $data['order_id'], 'total_num' => $data['total_num'], 'pay_price' => $data['pay_price']]);
        //短信
        $this->getNoticeService('Sms')->sendSms($data['user_phone'], compact('order_id', 'pay_price'));
        //模板消息公众号模版消息
        $this->getNoticeService('Wechat')->sendOrderPaySuccess($data['uid'], $data);
        //模板消息小程序订阅消息
        $this->getNoticeService('Routine')->sendOrderSuccess($data['uid'], $data['pay_price'], $data['order_id']);
        return true;
    }

    /**
     * 送货给用户发送消息
     * @param $data
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleOrderDeliverSuccess($data)
    {
        $orderInfo = $data['orderInfo'];
        $storeTitle = $data['storeName'];
        $order_id = $orderInfo->order_id;
        $store_name = $storeTitle;
        $storeTitle = Str::substrUTf8($storeTitle, 20, 'UTF-8', '');
        $nickname = app()->make(UserServices::class)->value(['uid' => $orderInfo->uid], 'nickname');

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($orderInfo['uid'], ['nickname' => $nickname, 'store_name' => $storeTitle, 'order_id' => $orderInfo['order_id'], 'delivery_name' => $orderInfo['delivery_name'], 'delivery_id' => $orderInfo['delivery_id'], 'user_address' => $orderInfo['user_address']]);
        //短信
        $this->getNoticeService('Sms')->sendSms($orderInfo->user_phone, compact('order_id', 'store_name', 'nickname'));
        //模板消息公众号模版消息
        $this->getNoticeService('Wechat')->sendOrderDeliver($orderInfo['uid'], $storeTitle, $orderInfo->toArray());
        //模板消息小程序订阅消息
        $this->getNoticeService('Routine')->sendOrderPostage($orderInfo['uid'], $orderInfo->toArray(), $storeTitle, 0);
        return true;
    }

    /**
     * 发快递给用户发送消息
     * @param $data
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleOrderPostageSuccess($data)
    {
        $orderInfo = $data['orderInfo'];
        $storeTitle = $data['storeName'];
        $order_id = $orderInfo->order_id;
        $store_name = $storeTitle;
        $storeTitle = Str::substrUTf8($storeTitle, 20, 'UTF-8', '');
        $nickname = app()->make(UserServices::class)->value(['uid' => $orderInfo->uid], 'nickname');

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($orderInfo['uid'], ['nickname' => $nickname, 'store_name' => $storeTitle, 'order_id' => $orderInfo['order_id'], 'delivery_name' => $orderInfo['delivery_name'], 'delivery_id' => $orderInfo['delivery_id'], 'user_address' => $orderInfo['user_address']]);
        //短信
        $this->getNoticeService('Sms')->sendSms($orderInfo->user_phone, compact('order_id', 'store_name', 'nickname'));
        //模板消息公众号模版消息
        $this->getNoticeService('Wechat')->sendOrderPostage($orderInfo['uid'], $orderInfo->toArray(), $storeTitle);
        //模板消息小程序订阅消息
        $this->getNoticeService('Routine')->sendOrderPostage($orderInfo['uid'], $orderInfo->toArray(), $storeTitle, 1);
        return true;
    }

    /**
     * 确认收货给用户发送消息
     * @param $data
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleOrderTake($data)
    {
        $order = is_object($data['order']) ? $data['order']->toArray() : $data['order'];
        $store_name = Str::substrUTf8($data['storeTitle'], 20, 'UTF-8', '');
        $order_id = $order['order_id'];

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($order['uid'], ['order_id' => $order['order_id'], 'store_name' => $store_name]);
        //短信
        $this->getNoticeService('Sms')->sendSms($order['user_phone'], compact('store_name', 'order_id'));
        //模板消息公众号模版消息
        $this->getNoticeService('Wechat')->sendOrderTakeSuccess($order['uid'], $order, $store_name);
        //模板消息小程序订阅消息
        $this->getNoticeService('Routine')->sendOrderTakeOver($order['uid'], $order, $store_name);
        return true;
    }

    /**
     * 改价给用户发送消息
     * @param $data
     * @return bool
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handlePriceRevision($data)
    {
        $order = $data['order'];
        $pay_price = $data['pay_price'];
        $order['storeName'] = app()->make(StoreOrderCartInfoServices::class)->getCarIdByProductTitle((int)$order['id']);

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($order['uid'], ['order_id' => $order['order_id'], 'pay_price' => $pay_price]);
        //短信
        $this->getNoticeService('Sms')->sendSms($order['user_phone'], ['order_id' => $order['order_id'], 'pay_price' => $pay_price]);
        return true;
    }

    /**
     * 退款成功给用户发送消息
     * @param $data
     * @return bool
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleOrderRefund($data)
    {
        $datas = $data['data'];
        $order = $data['order'];
        $order['refund_price'] = $datas['refund_price'];
        $order['refund_no'] = $datas['refund_no'];
        $storeName = app()->make(StoreOrderCartInfoServices::class)->getCarIdByProductTitle((int)$order['id']);
        $storeTitle = Str::substrUTf8($storeName, 20, 'UTF-8', '');

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($order['uid'], ['order_id' => $order['order_id'], 'pay_price' => $order['pay_price'], 'refund_price' => $datas['refund_price']]);
        //短信
        $this->getNoticeService('Sms')->sendSms($order['user_phone'], ['order_id' => $order['order_id'], 'refund_price' => $order['refund_price']]);
        //模板消息公众号模版消息
        $this->getNoticeService('Wechat')->sendOrderRefund($order['uid'], $order, $storeTitle);
        //模板消息小程序订阅消息
        $this->getNoticeService('Routine')->sendOrderRefundSuccess($order['uid'], $order, $storeTitle, $datas);
        return true;
    }

    /**
     * 退款未通过给用户发送消息
     * @param $data
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleSendOrderRefundNoStatus($data)
    {
        $order = $data['orderInfo'];
        $order['pay_price'] = $order['refund_price'];
        $order['refund_no'] = $order['order_id'];
        $storeTitle = Str::substrUTf8($order['cart_info'][0]['productInfo']['store_name'], 20, 'UTF-8', '');

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($order['uid'], ['order_id' => $order['order_id'], 'pay_price' => $order['refund_price'], 'store_name' => $storeTitle]);
        //模板消息
        $this->getNoticeService('Wechat')->sendOrderNoRefund($order['uid'], $order, $storeTitle);
        //小程序订阅消息
        $this->getNoticeService('Routine')->sendOrderRefundFail($order['uid'], $order, $storeTitle);
        return true;
    }

    /**
     * 开团成功,参团成功给用户发消息
     * @param $data
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handlePinkSuccess($data)
    {
        $orderInfo = $data['orderInfo'];
        $title = $data['title'];
        $pink = $data['pink'];
        $nickname = app()->make(UserServices::class)->value(['uid' => $orderInfo['uid']], 'nickname');

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($orderInfo['uid'], ['title' => $title, 'nickname' => $nickname, 'count' => $pink['people'], 'pink_time' => date('Y-m-d H:i:s', $pink['add_time'])]);
        return true;
    }

    /**
     * 拼团成功给用户发消息
     * @param $data
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleGroupsSuccess($data)
    {
        $list = $data['list'];
        $title = $data['title'];
        $url = '/pages/goods/order_details/index?order_id=' . $list['order_id'];
        $title = Str::substrUTf8($title, 20, 'UTF-8', '');

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($list['uid'], ['title' => $title, 'nickname' => $list['nickname'], 'count' => $list['people'], 'pink_time' => date('Y-m-d H:i:s', $list['add_time'])]);
        //模板消息小程序订阅消息
        $this->getNoticeService('Routine')->sendPinkSuccess($list['uid'], $title, $list['nickname'], $list['add_time'], $list['people'], $url);
        return true;
    }

    /**
     * 拼团失败，拼团取消给用户发消息
     * @param $data
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handlePinkFail($data)
    {
        $uid = $data['uid'];
        $pink = $data['pink'];

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($uid, ['title' => $pink->title, 'count' => $pink->people]);
        return true;
    }

    /**
     * 提醒付款给用户发消息
     * @param $data
     * @return bool
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleOrderPayFalse($data)
    {
        $order = $data['order'];
        $order_id = $order['order_id'];
        $order['storeName'] = app()->make(StoreOrderCartInfoServices::class)->getCarIdByProductTitle((int)$order['id']);

        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($order['uid'], ['order_id' => $order_id]);
        //短信
        $this->getNoticeService('Sms')->sendSms($order['user_phone'], compact('order_id'));
        return true;
    }

    /**
     * 新订单给客服发消息
     * @param $data
     * @return bool
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleAdminPaySuccessCode($data)
    {
        $order = $data;
        $storeName = app()->make(StoreOrderCartInfoServices::class)->getCarIdByProductTitle((int)$order['id']);
        $title = '亲，来新订单啦！';
        $status = '新订单';
        $link = '/pages/admin/orderDetail/index?id=' . $order['order_id'];

        //站内信
        $this->getNoticeService('SysMsg')->kefuSystemSend(['order_id' => $order['order_id']]);
        //短信
        $this->getNoticeService('Sms')->sendAdminPaySuccess($order);
        //模版消息
        $this->getNoticeService('Wechat')->sendAdminOrder($order['order_id'], $storeName, $title, $status, $link);
        //企业微信通知
        $this->getNoticeService('WeWork')->weComSend(['order_id' => $order['order_id']]);
        return true;
    }

    /**
     * 确认收货给客服发消息
     * @param $data
     * @return bool
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleSendAdminConfirmTakeOver($data)
    {
        $order = $data['order'];
        $storeTitle = $data['storeTitle'];
        $storeName = app()->make(StoreOrderCartInfoServices::class)->getCarIdByProductTitle((int)$order['id']);
        $title = '亲，用户已经收到货物啦！';
        $status = '订单收货';
        $link = '/pages/admin/orderDetail/index?id=' . $order['order_id'];

        //站内信
        $this->getNoticeService('SysMsg')->kefuSystemSend(['storeTitle' => $storeTitle, 'order_id' => $order['order_id']]);
        //短信
        $this->getNoticeService('Sms')->sendAdminConfirmTakeOver($order);
        //公众号
        $this->getNoticeService('Wechat')->sendAdminOrder($order['order_id'], $storeName, $title, $status, $link);
        //企业微信通知
        $this->getNoticeService('WeWork')->weComSend(['storeTitle' => $storeTitle, 'order_id' => $order['order_id']]);
        return true;
    }

    /**
     * 申请退款给客服发消息
     * @param $data
     * @return bool
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/29
     */
    protected function handleSendOrderApplyRefund($data)
    {
        $order = $data['order'];
        $storeName = app()->make(StoreOrderCartInfoServices::class)->getCarIdByProductTitle((int)$order['id']);
        $title = '亲，您有个退款订单待处理！';
        $status = '订单退款';
        $link = '/pages/admin/orderDetail/index?id=' . $order['refund_no'] . '&types=-3';

        //站内信
        $this->getNoticeService('SysMsg')->kefuSystemSend(['order_id' => $order['order_id']]);
        //短信
        $this->getNoticeService('Sms')->sendAdminRefund($order);
        //公众号
        $this->getNoticeService('Wechat')->sendAdminOrder($order['refund_no'], $storeName, $title, $status, $link);
        //企业微信通知
        $this->getNoticeService('WeWork')->weComSend(['order_id' => $order['order_id']]);
        return true;
    }

    /**
     * 签到提醒
     * @param $data
     * @return bool
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2023/9/30
     */
    public function handleSignRemind($data)
    {
        //站内信
        $this->getNoticeService('SysMsg')->sendMsg($data['uid'], ['site_name' => sys_config('site_name')]);
        //短信
        if ($data['phone']) {
            $this->getNoticeService('Sms')->sendSms($data['phone'], ['site_name' => sys_config('site_name')]);
        }
        return true;
    }

    protected function handleRevenueReceived($data)
    {
        $extractNumber = $data['extractNumber'];
        $uid = $data['uid'];
        $order_id = $data['order_id'];
        $type = $data['type'];

        //模板消息公众号模版消息
        $this->getNoticeService('Wechat')->sendRevenueReceived($uid, $extractNumber, $order_id, $type);
        //模板消息小程序订阅消息
        $this->getNoticeService('Routine')->sendRevenueReceived($uid, $extractNumber, $order_id, $type);
        return true;
    }
}
