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
namespace app\listener\order;


use app\jobs\notice\PrintJob;
use app\jobs\OrderJob;
use app\jobs\ProductLogJob;
use app\services\order\StoreOrderDeliveryServices;
use app\services\order\StoreOrderStatusServices;
use crmeb\interfaces\ListenerInterface;

/**
 * 订单支付成功后
 *
 * 本地履约（订单状态记录、商品赠券、支付流水、虚拟商品分配、开票状态）已经
 * 在 StoreOrderSuccessServices::paySuccess() 的事务里提交，本监听器只负责
 * 提交之后的本地尾巴动作：分销升级、虚拟商品发货通知、商品日志。它不再写
 * 支付状态记录、赠券、流水或开票，避免同一份逻辑执行两遍。
 *
 * Class OrderPaySuccessListener
 * @package app\listener\order
 */
class OrderPaySuccessListener implements ListenerInterface
{
    public function handle($event): void
    {
        [$orderInfo] = $event;

        //支付成功处理自己、上级分销等级升级
        OrderJob::dispatch([$orderInfo]);

        //商品日志记录支付记录
        ProductLogJob::dispatch(['pay', ['uid' => $orderInfo['uid'], 'order_id' => $orderInfo['id']]]);
    }
}
