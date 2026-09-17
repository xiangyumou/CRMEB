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

namespace app\services\message\notice;

use app\jobs\TemplateJob;
use app\services\message\NoticeService;
use app\services\user\UserServices;
use app\services\wechat\WechatUserServices;
use think\facade\Log;


/**
 * 小程序模板消息消息队列
 * Class RoutineTemplateJob
 * @package crmeb\jobs
 */
class RoutineTemplateListService extends NoticeService
{
    /**
     * 根据UID获取openid
     * @param int $uid
     * @return mixed
     */
    public function getOpenidByUid(int $uid)
    {
        $isDel = app()->make(UserServices::class)->value(['uid' => $uid], 'is_del');
        if ($isDel) {
            $openid = '';
        } else {
            $openid = app()->make(WechatUserServices::class)->uidToOpenid($uid, 'routine');
        }
        return $openid;
    }

    /**
     * 发送模板消息
     * @param int $uid
     * @param array $data
     * @param string|null $link
     * @param string|null $color
     * @return bool|void
     */
    public function sendTemplate(int $uid, array $data, string $link = null, string $color = null)
    {
        try {
            if ($this->noticeInfo['is_routine'] == 1) {
                $openid = $this->getOpenidByUid($uid);
                //放入队列执行
                TemplateJob::dispatch('doJob', ['subscribe', $openid, $this->noticeInfo['routine_tempid'], $data, $link, $color]);
            }
        } catch (\Exception $e) {
            Log::error($e->getMessage());
            return true;
        }
    }

    /**
     * 确认收货
     * @param $uid
     * @param $order
     * @param $title
     * @return bool|void
     */
    public function sendOrderTakeOver($uid, $order, $title)
    {
        return $this->sendTemplate((int)$uid, [
            'thing1' => $order['order_id'],
            'thing2' => $title,
            'date5' => date('Y-m-d H:i:s', time()),
        ], '/pages/goods/order_details/index?order_id=' . $order['order_id']);
    }

    /**
     * 发货订阅消息
     * @param $uid
     * @param $order
     * @param $storeTitle
     * @param int $isGive
     * @return bool|void
     */
    public function sendOrderPostage($uid, $order, $storeTitle, int $isGive = 0)
    {
        if ($isGive) {//快递发货
            return $this->sendTemplate((int)$uid, [
                'character_string2' => $order['delivery_id'],
                'thing1' => $order['delivery_name'],
                'time3' => date('Y-m-d H:i:s', time()),
                'thing5' => $storeTitle,
            ], '/pages/goods/order_details/index?order_id=' . $order['order_id']);
        } else {//同城配送
            return $this->sendTemplate((int)$uid, [
                'thing8' => $storeTitle,
                'character_string1' => $order['order_id'],
                'name4' => $order['delivery_name'],
                'phone_number10' => $order['delivery_id']
            ], '/pages/goods/order_details/index?order_id=' . $order['order_id']);
        }
    }

    /**
     * 订单退款成功发送消息
     * @param $uid
     * @param $order
     * @param $storeTitle
     * @param $data
     * @return bool|void
     */
    public function sendOrderRefundSuccess($uid, $order, $storeTitle, $data)
    {
        return $this->sendTemplate((int)$uid, [
            'thing1' => '已成功退款',
            'thing2' => $storeTitle,
            'amount3' => $order['pay_price'],
            'character_string6' => $data['order_id']
        ], '/pages/goods/order_details/index?order_id=' . $data['order_id'] . '&isReturn=1');
    }

    /**
     * 订单退款失败
     * @param $uid
     * @param $order
     * @param $storeTitle
     * @return bool|void
     */
    public function sendOrderRefundFail($uid, $order, $storeTitle)
    {
        return $this->sendTemplate((int)$uid, [
            'thing1' => '退款失败',
            'thing2' => $storeTitle,
            'amount3' => $order['pay_price'],
            'character_string6' => $order['order_id']
        ], '/pages/goods/order_details/index?order_id=' . $order['order_id'] . '&isReturn=1');
    }

    /**
     * 用户申请退款给管理员发送消息
     * @param $uid
     * @param $order
     * @return bool|void
     */
    public function sendOrderRefundStatus($uid, $order)
    {
        $data['character_string4'] = $order['order_id'];
        $data['date5'] = date('Y-m-d H:i:s', time());
        $data['amount2'] = $order['pay_price'];
        $data['phrase7'] = '申请退款中';
        $data['thing8'] = '请及时处理';
        return $this->sendTemplate((int)$uid, $data);
    }

    /**
     * 订单支付成功发送模板消息
     * @param $uid
     * @param $pay_price
     * @param $orderId
     * @return bool|void
     */
    public function sendOrderSuccess($uid, $pay_price, $orderId)
    {
        if ($orderId == '') return true;
        $data['character_string1'] = $orderId;
        $data['amount2'] = $pay_price . '元';
        $data['date3'] = date('Y-m-d H:i:s', time());
        return $this->sendTemplate((int)$uid, $data, '/pages/goods/order_details/index?order_id=' . $orderId);
    }

    /**
     * 用户发起提现，后台同意之后给用户发送
     * @param $uid
     * @param $extract_number
     * @param $order_id
     * @param $type
     * @return bool|void
     */
    public function sendRevenueReceived($uid, $extract_number, $order_id, $type)
    {
        return $this->sendTemplate((int)$uid, [
            'character_string1' => $order_id,
            'thing7' => '平台发放佣金',
            'amount3' => $extract_number,
            'time10' => date('Y-m-d H:i:s', time())
        ], '/pages/users/user_spread_money/receiving?id=' . $order_id . '&type=' . $type);
    }

    /**
     * 拼团成功通知
     * @param $uid
     * @param $pinkTitle
     * @param $nickname
     * @param $pinkTime
     * @param $count
     * @param string $link
     * @return bool|void
     */
    public function sendPinkSuccess($uid, $pinkTitle, $nickname, $pinkTime, $count, string $link = '')
    {
        return $this->sendTemplate((int)$uid, [
            'thing1' => $pinkTitle,
            'thing12' => $nickname,
            'date5' => date('Y-m-d H:i:s', $pinkTime),
            'number2' => $count
        ], $link);
    }

    /**
     * 拼团状态通知
     * @param $uid
     * @param $pinkTitle
     * @param $count
     * @param $remarks
     * @param $link
     * @return bool|void
     */
    public function sendPinkFail($uid, $pinkTitle, $count, $remarks, $link)
    {
        return $this->sendTemplate((int)$uid, [
            'thing2' => $pinkTitle,
            'thing1' => $count,
            'thing3' => $remarks
        ], $link);
    }

}
