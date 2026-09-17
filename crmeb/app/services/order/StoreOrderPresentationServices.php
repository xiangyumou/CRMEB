<?php
namespace app\services\order;

use app\services\activity\combination\StorePinkServices;
use app\services\user\UserServices;
use app\services\product\product\StoreProductReplyServices;
use crmeb\services\SystemConfigService;
use crmeb\utils\Arr;

final class StoreOrderPresentationServices
{
    private $deliveryType;

    public function __construct(array $deliveryType)
    {
        $this->deliveryType = $deliveryType;
    }

    public function tidyOrder($order, bool $detail = false, $isPic = false)
    {
        if ($detail == true && isset($order['id'])) {
            /** @var StoreOrderCartInfoServices $cartServices */
            $cartServices = app()->make(StoreOrderCartInfoServices::class);
            $cartInfos = $cartServices->getCartColunm(['oid' => $order['id']], 'cart_num,surplus_num,cart_info,refund_num', 'unique');
            $info = [];
            /** @var StoreProductReplyServices $replyServices */
            $replyServices = app()->make(StoreProductReplyServices::class);
            foreach ($cartInfos as $k => $cartInfo) {
                $cart = json_decode($cartInfo['cart_info'], true);
                $cart['cart_num'] = $cartInfo['cart_num'];
                $cart['surplus_num'] = $cartInfo['surplus_num'];
                $cart['refund_num'] = $cartInfo['refund_num'];
                $cart['surplus_refund_num'] = $cartInfo['surplus_num'] - $cartInfo['refund_num'];
                $cart['unique'] = $k;
                //新增是否评价字段
                $cart['is_reply'] = $replyServices->count(['unique' => $k]);
                if (isset($cart['productInfo']['attrInfo'])) {
                    $cart['productInfo']['attrInfo'] = get_thumb_water($cart['productInfo']['attrInfo']);
                }
                $cart['productInfo'] = get_thumb_water($cart['productInfo']);
                //一种商品买多件  计算总优惠（历史订单可能保留会员价优惠）
                $cart['vip_sum_truePrice'] = bcmul($cart['vip_truePrice'] ?? 0, $cart['cart_num'] ? $cart['cart_num'] : 1, 2);
                $cart['is_valid'] = 1;
                array_push($info, $cart);
                unset($cart);
            }
            $order['cartInfo'] = $info;
        }
        /** @var StoreOrderStatusServices $statusServices */
        $statusServices = app()->make(StoreOrderStatusServices::class);
        $status = [];
        if ($order['is_cancel']) {
            $status['_type'] = 4;
            $status['_title'] = '已取消';
            $status['_msg'] = '您已取消订单,感谢您的使用';
            $status['_class'] = 'nobuy';
        } else {
            if (!$order['paid']) {
                $status['_type'] = 0;
                $status['_title'] = '未支付';
                //系统预设取消订单时间段
                $keyValue = ['order_cancel_time', 'order_activity_time', 'order_pink_time'];
                //获取配置
                $systemValue = SystemConfigService::more($keyValue);
                //格式化数据
                $systemValue = Arr::setValeTime($keyValue, is_array($systemValue) ? $systemValue : []);
                if ($order['pink_id'] || $order['combination_id']) {
                    $order_pink_time = $systemValue['order_pink_time'] ?: $systemValue['order_activity_time'];
                    $time = $order['add_time'] + $order_pink_time * 3600;
                    $status['_msg'] = '请在' . date('m-d H:i:s', $time) . '前完成支付!';
                } else {
                    $time = $order['add_time'] + $systemValue['order_cancel_time'] * 3600;
                    $status['_msg'] = '请在' . date('m-d H:i:s', (int)$time) . '前完成支付!';
                }
                $status['_class'] = 'nobuy';
            } else if ($order['status'] == 4) {
                if ($order['delivery_type'] == 'send') {//TODO 送货
                    $status['_type'] = 1;
                    $status['_title'] = '待收货';
                    $status['_msg'] = date('m月d日H时i分', $statusServices->value(['oid' => $order['id'], 'change_type' => 'delivery'], 'change_time')) . '服务商已送货';
                    $status['_class'] = 'state-ysh';
                } elseif ($order['delivery_type'] == 'express') {//TODO  发货
                    $status['_type'] = 1;
                    $status['_title'] = '待收货';
                    $status['_msg'] = date('m月d日H时i分', $statusServices->value(['oid' => $order['id'], 'change_type' => 'delivery_goods'], 'change_time')) . '服务商已发货';
                    $status['_class'] = 'state-ysh';
                } elseif ($order['delivery_type'] == 'split') {//拆分发货
                    $status['_type'] = 1;
                    $status['_title'] = '待收货';
                    $status['_msg'] = date('m月d日H时i分', $statusServices->value(['oid' => $order['id'], 'change_type' => 'delivery_part_split'], 'change_time')) . '服务商已拆分多个包裹发货';
                    $status['_class'] = 'state-ysh';
                } else {
                    $status['_type'] = 1;
                    $status['_title'] = '待收货';
                    $status['_msg'] = date('m月d日H时i分', $statusServices->value(['oid' => $order['id'], 'change_type' => 'delivery_fictitious'], 'change_time')) . '服务商已虚拟发货';
                    $status['_class'] = 'state-ysh';
                }
            } else if ($order['refund_status'] == 1) {
                if (in_array($order['refund_type'], [0, 1, 2])) {
                    $status['_type'] = -1;
                    $status['_title'] = '申请退款中';
                    $status['_msg'] = '商家审核中,请耐心等待';
                    $status['_class'] = 'state-sqtk';
                } elseif ($order['refund_type'] == 4) {
                    $status['_type'] = -1;
                    $status['_title'] = '申请退款中';
                    $status['_msg'] = '商家同意退款,请填写退货订单号';
                    $status['_class'] = 'state-sqtk';
                    $status['refund_name'] = sys_config('refund_name', '');
                    $status['refund_phone'] = sys_config('refund_phone', '');
                    $status['refund_address'] = sys_config('refund_address', '');
                } elseif ($order['refund_type'] == 5) {
                    $status['_type'] = -1;
                    $status['_title'] = '申请退款中';
                    $status['_msg'] = '等待商家收货';
                    $status['_class'] = 'state-sqtk';
                    $status['refund_name'] = sys_config('refund_name', '');
                    $status['refund_phone'] = sys_config('refund_phone', '');
                    $status['refund_address'] = sys_config('refund_address', '');
                }
            } else if ($order['refund_status'] == 2 || $order['refund_type'] == 6) {
                $status['_type'] = -2;
                $status['_title'] = '已退款';
                $status['_msg'] = '已为您退款,感谢您的支持';
                $status['_class'] = 'state-sqtk';
            } else if ($order['refund_status'] == 3) {
                $status['_type'] = -1;
                $status['_title'] = '部分退款（子订单）';
                $status['_msg'] = '拆分发货，部分退款';
                $status['_class'] = 'state-sqtk';
            } else if ($order['refund_status'] == 4) {
                $status['_type'] = -1;
                $status['_title'] = '子订单已全部申请退款中';
                $status['_msg'] = '拆分发货，全部退款';
                $status['_class'] = 'state-sqtk';
            } else if (!$order['status']) {
                if ($order['pink_id']) {
                    /** @var StorePinkServices $pinkServices */
                    $pinkServices = app()->make(StorePinkServices::class);
                    if ($pinkServices->getCount(['id' => $order['pink_id'], 'status' => 1])) {
                        $status['_type'] = 1;
                        $status['_title'] = '拼团中';
                        $status['_msg'] = '等待其他人参加拼团';
                        $status['_class'] = 'state-nfh';
                    } else {
                        $status['_type'] = 1;
                        $status['_title'] = '未发货';
                        $status['_msg'] = '商家未发货,请耐心等待';
                        $status['_class'] = 'state-nfh';
                    }
                } else {
                    if ($order['shipping_type'] === 1) {
                        $status['_type'] = 1;
                        $status['_title'] = '未发货';
                        if ($order['advance_id']) {
                            $status['_msg'] = date('Y-m-d', $order['cartInfo'][0]['productInfo']['presale_end_time']) . '预售结束后' . $order['cartInfo'][0]['productInfo']['presale_day'] . '天内发货,请耐心等待';
                        } else {
                            $status['_msg'] = '商家未发货,请耐心等待';
                        }
                        $status['_class'] = 'state-nfh';
                    } else {
                        $status['_type'] = 1;
                        $status['_title'] = '待领取';
                        $status['_msg'] = '待领取，将礼品转赠给好友吧!';
                        $status['_class'] = 'state-nfh';
                    }
                }
            } else if ($order['status'] == 1) {
                if ($order['delivery_type'] == 'send') {//TODO 送货
                    $status['_type'] = 2;
                    $status['_title'] = '待收货';
                    $status['_msg'] = date('m月d日H时i分', $statusServices->value(['oid' => $order['id'], 'change_type' => 'delivery'], 'change_time')) . '服务商已送货';
                    $status['_class'] = 'state-ysh';
                } elseif ($order['delivery_type'] == 'express') {//TODO  发货
                    $status['_type'] = 2;
                    $status['_title'] = '待收货';
                    $status['_msg'] = date('m月d日H时i分', $statusServices->value(['oid' => $order['id'], 'change_type' => 'delivery_goods'], 'change_time')) . '服务商已发货';
                    $status['_class'] = 'state-ysh';
                } elseif ($order['delivery_type'] == 'split') {//拆分发货
                    $status['_type'] = 2;
                    $status['_title'] = '待收货';
                    $status['_msg'] = date('m月d日H时i分', $statusServices->value(['oid' => $order['id'], 'change_type' => 'delivery_split'], 'change_time')) . '服务商已拆分多个包裹发货';
                    $status['_class'] = 'state-ysh';
                } else {
                    $status['_type'] = 2;
                    $status['_title'] = '待收货';
                    $status['_msg'] = date('m月d日H时i分', $statusServices->value(['oid' => $order['id'], 'change_type' => 'delivery_fictitious'], 'change_time')) . '服务商已虚拟发货';
                    $status['_class'] = 'state-ysh';
                }
            } else if ($order['status'] == 2) {
                $status['_type'] = 3;
                $status['_title'] = '待评价';
                $status['_msg'] = '已收货,快去评价一下吧';
                $status['_class'] = 'state-ypj';
            } else if ($order['status'] == 3) {
                $status['_type'] = 4;
                $status['_title'] = '交易完成';
                $status['_msg'] = '交易完成,感谢您的支持';
                $status['_class'] = 'state-ytk';
            }
        }
        if (isset($order['pay_type']))
            $status['_payType'] = $status['_type'] == 0 ? '' : \app\services\CoreStore::historicalPayTypeLabel($order['pay_type']);
        if (isset($order['delivery_type']))
            $status['_deliveryType'] = $this->deliveryType[$order['delivery_type']] ?? '其他方式';
        $order['_status'] = $status;
        $order['_pay_time'] = isset($order['pay_time']) && $order['pay_time'] != null ? date('Y-m-d H:i:s', $order['pay_time']) : '';
        $order['_add_time'] = isset($order['add_time']) ? (strstr((string)$order['add_time'], '-') === false ? date('Y-m-d H:i:s', $order['add_time']) : $order['add_time']) : '';

        //系统预设取消订单时间段
        $keyValue = ['order_cancel_time', 'order_activity_time', 'order_pink_time'];
        //获取配置
        $systemValue = SystemConfigService::more($keyValue);
        //格式化数据
        $systemValue = Arr::setValeTime($keyValue, is_array($systemValue) ? $systemValue : []);
        if ($order['combination_id']) {
            $secs = $systemValue['order_pink_time'] ? $systemValue['order_pink_time'] : $systemValue['order_activity_time'];
        } else {
            $secs = $systemValue['order_cancel_time'];
        }
        $order['stop_time'] = $secs * 3600 + $order['add_time'];
        $order['status_pic'] = '';
        //获取商品状态图片
        if ($isPic) {
            $order_details_images = sys_data('order_details_images') ?: [];
            foreach ($order_details_images as $image) {
                if (isset($image['order_status']) && $image['order_status'] == $order['_status']['_type']) {
                    $order['status_pic'] = $image['pic'];
                    break;
                }
            }
        }
        if ($order['combination_id'] || $order['advance_id']) {
            if ($order['combination_id']) $order['type'] = 3;
            if ($order['advance_id']) $order['type'] = 4;
        }
        $log = $statusServices->getColumn(['oid' => $order['id']], 'change_time', 'change_type');
        if (isset($log['delivery'])) {
            $delivery = date('Y-m-d', $log['delivery']);
        } elseif (isset($log['delivery_goods'])) {
            $delivery = date('Y-m-d', $log['delivery_goods']);
        } elseif (isset($log['delivery_fictitious'])) {
            $delivery = date('Y-m-d', $log['delivery_fictitious']);
        } else {
            $delivery = '';
        }
        $order['order_log'] = [
            'create' => isset($log['cache_key_create_order']) ? date('Y-m-d', $log['cache_key_create_order']) : '',
            'pay' => isset($log['pay_success']) ? date('Y-m-d', $log['pay_success']) : '',
            'delivery' => $delivery,
            'take' => isset($log['take_delivery']) ? date('Y-m-d', $log['take_delivery']) : '',
            'complete' => isset($log['check_order_over']) ? date('Y-m-d', $log['check_order_over']) : '',
        ];

        $order['gift_user_info'] = [
            'gift_uid' => $order['gift_uid'],
            'gift_nickname' => '',
            'gift_avatar' => '',
        ];
        if ($order['gift_uid'] != 0) {
            /** @var UserServices $userServices */
            $userServices = app()->make(UserServices::class);
            $giftUser = $userServices->get($order['gift_uid'], ['nickname', 'avatar']);
            $order['gift_user_info'] = [
                'gift_uid' => $order['gift_uid'],
                'gift_nickname' => $giftUser['nickname'],
                'gift_avatar' => $giftUser['avatar'],
            ];
        }
        return $order;
    }

    public function tidyOrderList(array $data)
    {
        /** @var StoreOrderCartInfoServices $services */
        $services = app()->make(StoreOrderCartInfoServices::class);
        foreach ($data as &$item) {
            $item['_info'] = $services->getOrderCartInfo((int)$item['id']);
            $item['add_time'] = date('Y-m-d H:i:s', $item['add_time']);
            $item['_refund_time'] = isset($item['refund_reason_time']) && $item['refund_reason_time'] ? date('Y-m-d H:i:s', $item['refund_reason_time']) : '';
            $item['_pay_time'] = isset($item['pay_time']) && $item['pay_time'] ? date('Y-m-d H:i:s', $item['pay_time']) : '';
            if (($item['pink_id'] || $item['combination_id']) && isset($item['pinkStatus'])) {
                switch ($item['pinkStatus']) {
                    case 1:
                        $item['pink_name'] = '[拼团订单]正在进行中';
                        $item['color'] = '#f00';
                        break;
                    case 2:
                        $item['pink_name'] = '[拼团订单]已完成';
                        $item['color'] = '#00f';
                        break;
                    case 3:
                        $item['pink_name'] = '[拼团订单]未完成';
                        $item['color'] = '#f0f';
                        break;
                    default:
                        $item['pink_name'] = '[拼团订单]历史订单';
                        $item['color'] = '#FF7D00';
                        break;
                }
            } elseif ($item['combination_id']) {
                $item['pink_name'] = '[拼团订单]';
                $item['color'] = '#FF7D00';
            } elseif ($item['advance_id']) {
                $item['pink_name'] = '[预售订单]';
                $item['color'] = '#B27FEB';
            } else {
                $item['pink_name'] = '[普通订单]';
                $item['color'] = '#333';
            }
            if ($item['paid'] == 1) {
                $item['pay_type_name'] = \app\services\CoreStore::historicalPayTypeLabel($item['pay_type']);
            } else {
                $item['pay_type_name'] = '';
            }
            $status_name = ['status_name' => '', 'pics' => []];
            if ($item['paid'] == 0 && $item['status'] == 0) {
                $status_name['status_name'] = $item['is_cancel'] == 0 ? '未支付' : '已取消';
            } else if ($item['paid'] == 1 && $item['status'] == 0 && $item['shipping_type'] == 1 && $item['refund_status'] == 0) {
                $status_name['status_name'] = $item['combination_id'] && isset($item['pinkStatus']) && $item['pinkStatus'] == 1 ? '未发货(拼团中)' : '未发货';
            } else if ($item['paid'] == 1 && $item['status'] == 4 && $item['shipping_type'] == 1 && $item['refund_status'] == 0) {
                $status_name['status_name'] = '部分发货';
            } else if ($item['paid'] == 1 && $item['status'] == 1 && $item['shipping_type'] == 1 && $item['refund_status'] == 0) {
                $status_name['status_name'] = '待收货';
            } else if ($item['paid'] == 1 && $item['status'] == 2 && $item['refund_status'] == 0) {
                $status_name['status_name'] = '待评价';
            } else if ($item['paid'] == 1 && $item['status'] == 3 && $item['refund_status'] == 0) {
                $status_name['status_name'] = '已完成';
            } else if ($item['paid'] == 1 && $item['refund_status'] == 1) {
                $refundReasonTime = date('Y-m-d H:i', $item['refund_reason_time']);
                $refundReasonWapImg = json_decode($item['refund_reason_wap_img'], true);
                $refundReasonWapImg = $refundReasonWapImg ?: [];
                $img = [];
                if (count($refundReasonWapImg)) {
                    foreach ($refundReasonWapImg as $itemImg) {
                        if (strlen(trim($itemImg)))
                            $img[] = $itemImg;
                    }
                }
                $status_name['status_name'] = '退款中';
                $status_name['pics'] = $img;
            } else if ($item['paid'] == 1 && $item['refund_status'] == 2) {
                $status_name['status_name'] = '已退款';
            } else if ($item['paid'] == 1 && $item['refund_status'] == 3) {
                $status_name['status_name'] = <<<HTML
<b style="color:#f124c7">部分退款</b><br/>
HTML;
            } else if ($item['paid'] == 1 && $item['refund_status'] == 4) {
                $status_name['status_name'] = <<<HTML
<b style="color:#f124c7">退款中</b><br/>
HTML;
            }
            $item['status_name'] = $status_name;
            if ($item['paid'] == 0 && $item['status'] == 0 && $item['refund_status'] == 0) {
                $item['_status'] = 1;//未支付
            } else if ($item['paid'] == 1 && $item['status'] == 0 && $item['refund_status'] == 0) {
                $item['_status'] = 2;//已支付 未发货
            } else if ($item['paid'] == 1 && $item['status'] == 4 && $item['refund_status'] == 0) {
                $item['_status'] = 8;//已支付 部分发货
            } else if ($item['paid'] == 1 && $item['refund_status'] == 1) {
                $item['_status'] = 3;//已支付 申请退款中
            } else if ($item['paid'] == 1 && $item['status'] == 1 && $item['refund_status'] == 0) {
                $item['_status'] = 4;//已支付 待收货
            } else if ($item['paid'] == 1 && $item['status'] == 2 && $item['refund_status'] == 0) {
                $item['_status'] = 5;//已支付 待评价
            } else if ($item['paid'] == 1 && $item['status'] == 3 && $item['refund_status'] == 0) {
                $item['_status'] = 6;//已支付 已完成
            } else if ($item['paid'] == 1 && $item['refund_status'] == 2) {
                $item['_status'] = 7;//已支付 已退款
            } else if ($item['paid'] == 1 && $item['refund_status'] == 3 && $item['status'] == 4) {
                $item['_status'] = 9;//拆单发货 部分申请退款
            } else if ($item['paid'] == 1 && $item['refund_status'] == 4) {
                $item['_status'] = 10;//拆单发货 已全部申请退款
            } else if ($item['paid'] == 1 && $item['refund_status'] == 3 && $item['status'] == 0) {
                $item['_status'] = 11;//拆单退款 未发货
            }
        }
        return $data;
    }
}
