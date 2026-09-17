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

namespace app\api\controller\v2\order;


use app\services\order\StoreOrderInvoiceServices;
use app\services\order\StoreOrderServices;
use app\services\serve\ServeServices;
use think\Request;

/**
 * Class StoreOrderInvoiceController
 * @package app\api\controller\v2\order
 */
class StoreOrderInvoiceController
{
    /**
     * @var StoreOrderInvoiceServices
     */
    protected $services;

    /**
     * StoreOrderInvoiceController constructor.
     * @param StoreOrderInvoiceServices $services
     */
    public function __construct(StoreOrderInvoiceServices $services)
    {
        $this->services = $services;
    }

    /**
     * 订单开票
     * @param Request $request
     * @return mixed
     */
    public function makeUp(Request $request)
    {
        [$order_id, $invoice_id] = $request->postMore([
            ['order_id', 0],
            ['invoice_id', 0]
        ], true);
        $uid = (int)$request->uid;
        return app('json')->success($this->services->makeUp($uid, $order_id, (int)$invoice_id));
    }

    /**
     * 开票记录
     * @param Request $request
     * @return mixed
     */
    public function list(Request $request)
    {
        $uid = (int)$request->uid();
        return app('json')->success($this->services->getOrderInvoiceList(['uid' => $uid]));
    }

    /**
     * 订单详情
     * @param \app\Request $request
     * @param $uni
     * @return mixed
     */
    public function detail(StoreOrderServices $services, Request $request, $uni)
    {
        if (!strlen(trim($uni))) return app('json')->fail('参数错误');
        $order = $services->getUserOrderDetail($uni, (int)$request->uid(), []);
        if (!$order) return app('json')->fail('订单不存在');
        $order = $order->toArray();
        $orderInvoice = $this->services->getOne(['order_id' => $order['id']]);
        $order['invoice'] = $orderInvoice;
        $order['add_time_y'] = date('Y-m-d', $order['add_time']);
        $order['add_time_h'] = date('H:i:s', $order['add_time']);
        $order['mapKey'] = sys_config('tengxun_map_key');
        $order['pay_weixin_open'] = (int)sys_config('pay_weixin_open') ?? 0;//微信支付 1 开启 0 关闭
        return app('json')->success($services->tidyOrder($order, true, true));
    }

    /**
     * 前端下载电子发票
     * @param $id
     * @return \think\Response
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2024/5/14
     */
    public function downInvoice($id)
    {
        $info = $this->services->getOne(['id' => $id]);
        $invoice = app()->make(ServeServices::class)->invoice();
        return app('json')->success($invoice->downloadInvoice($info['invoice_num']));
    }
}
