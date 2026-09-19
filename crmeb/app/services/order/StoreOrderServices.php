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
use app\jobs\AutoCommentJob;
use app\model\order\StoreOrderPaymentAttempt;
use app\services\activity\combination\StorePinkServices;
use app\services\activity\coupon\StoreCouponUserServices;
use app\services\BaseServices;
use app\services\other\QrcodeServices;
use app\services\pay\PayServices;
use app\services\pay\PayTradeServices;
use app\services\serve\ServeServices;
use app\services\system\SystemTicketServices;
use app\services\user\UserInvoiceServices;
use app\services\user\UserServices;
use app\services\product\product\StoreProductReplyServices;
use app\services\user\UserAddressServices;
use app\services\wechat\WechatUserServices;
use crmeb\exceptions\AdminException;
use crmeb\exceptions\ApiException;
use crmeb\exceptions\PayException;
use crmeb\services\CacheService;
use crmeb\services\easywechat\orderShipping\MiniOrderService;
use crmeb\services\FormBuilder as Form;
use crmeb\services\printer\Printer;
use crmeb\services\SystemConfigService;
use crmeb\utils\Arr;
use think\facade\Log;

/**
 * Class StoreOrderServices
 * @package app\services\order
 * @method getOrderIdsCount(array $ids) 获取订单id下没有删除的订单数量
 * @method StoreOrderDao getUserOrderDetail(string $key, int $uid, array $with) 获取订单详情
 * @method chartTimePrice($start, $stop) 获取当前时间到指定时间的支付金额 管理员
 * @method chartTimeNumber($start, $stop) 获取当前时间到指定时间的支付订单数 管理员
 * @method together(array $where, string $field, string $together = 'sum') 聚合查询
 * @method getBuyCount($uid, $type, $typeId) 获取用户已购买此活动商品的个数
 * @method getDistinctCount(array $where, $field, ?bool $search = true)
 * @method getTrendData($time, $type, $timeType, $str) 用户趋势
 * @method getRegion($time, $channelType) 地域统计
 * @method getProductTrend($time, $timeType, $field, $str) 商品趋势
 * @method getList(array $where, array $field, int $page = 0, int $limit = 0, array $with = [])
 */
class StoreOrderServices extends BaseServices
{

    /**
     * 发货类型
     * @var string[]
     */
    public $deliveryType = [
        'send' => '商家配送',
        'express' => '快递配送',
        'fictitious' => '虚拟发货',
        'delivery_part_split' => '拆分部分发货',
        'delivery_split' => '拆分发货完成'
    ];

    /**
     * StoreOrderProductServices constructor.
     * @param StoreOrderDao $dao
     */
    public function __construct(StoreOrderDao $dao)
    {
        $this->dao = $dao;
    }

    /**
     * 获取列表
     * @param array $where
     * @param array $field
     * @param array $with
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getOrderList(array $where, array $field = ['*'], array $with = [])
    {
        [$page, $limit] = $this->getPageValue();
        $data = $this->dao->getOrderList($where, $field, $page, $limit, $with);
        $count = $this->dao->count($where, false);
        $data = $this->tidyOrderList($data);
        foreach ($data as &$item) {
            $refund_num = array_sum(array_column($item['refund'], 'refund_num'));
            $cart_num = 0;
            $vipTruePrice = 0;
            foreach ($item['_info'] as $items) {
                $cart_num += $items['cart_info']['cart_num'];
                // Member pricing is retired, but orders placed before then keep
                // their discount in cart_info; read it when it is there.
                $vipTruePrice = bcadd((string)$vipTruePrice, bcmul((string)($items['cart_info']['vip_truePrice'] ?? 0), (string)$items['cart_info']['cart_num'], 2), 2);
            }
            $item['total_price'] = bcadd($item['total_price'], $vipTruePrice, 2);
            $item['is_all_refund'] = $refund_num == $cart_num;
            $item['pay_price'] = (float)$item['pay_price'];
        }
        return compact('data', 'count');
    }

    /**
     * 前端订单列表
     * @param array $where
     * @param array|string[] $field
     * @param array $with
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getOrderApiList(array $where, array $field = ['*'], array $with = [])
    {
        [$page, $limit] = $this->getPageValue();
        $data = $this->dao->getOrderList($where, $field, $page, $limit, $with);
        foreach ($data as &$item) {
            $item = $this->tidyOrder($item, true);
            foreach ($item['cartInfo'] ?: [] as $key => $product) {
                if ($item['_status']['_type'] == 3) {
                    $item['cartInfo'][$key]['add_time'] = isset($product['add_time']) ? date('Y-m-d H:i', (int)$product['add_time']) : '时间错误';
                }
                $item['cartInfo'][$key]['productInfo']['price'] = $product['truePrice'] ?? 0;
            }
            if (count($item['refund'])) {
                $refund_num = array_sum(array_column($item['refund'], 'refund_num'));
                $cart_num = array_sum(array_column($item['cartInfo'], 'cart_num'));
                $item['is_all_refund'] = $refund_num == $cart_num ? true : false;
            } else {
                $item['is_all_refund'] = false;
            }
        }
        return $data;
    }

    /**
     * 获取订单数量
     * @param int $uid
     * @return array
     * @throws \ReflectionException
     */
    public function getOrderData(int $uid = 0)
    {
        $data['order_count'] = (string)$this->dao->count(['uid' => $uid, 'refund_status' => [0, 3], 'pid' => 0, 'is_del' => 0, 'is_system_del' => 0]);
        $data['sum_price'] = (string)$this->dao->sum([
            ['uid', '=', $uid],
            ['paid', '=', 1],
            ['refund_status', '=', 0],
            ['pid', '>=', 0]
        ], 'pay_price', false);
        $countWhere = ['is_del' => 0, 'is_system_del' => 0];
        if ($uid) {
            $countWhere['uid'] = $uid;
        }
        $data['unpaid_count'] = (string)$this->dao->count(['status' => 0] + $countWhere);
        $data['unshipped_count'] = (string)$this->dao->count(['status' => 1] + $countWhere + ['pid' => 0]);
        $data['received_count'] = (string)$this->dao->count(['status' => 2] + $countWhere + ['pid' => 0]);
        $data['evaluated_count'] = (string)$this->dao->count(['status' => 3] + $countWhere + ['pid' => 0]);
        $data['complete_count'] = (string)$this->dao->count(['status' => 4] + $countWhere + ['pid' => 0]);

        /** @var StoreOrderRefundServices $storeOrderRefundServices */
        $storeOrderRefundServices = app()->make(StoreOrderRefundServices::class);
        $refund_where = ['is_cancel' => 0];
        if ($uid) $refund_where['uid'] = $uid;
        $data['refunding_count'] = (string)$storeOrderRefundServices->count($refund_where + ['refund_type' => [1, 2, 4, 5]]);
        $data['no_refund_count'] = (string)$storeOrderRefundServices->count($refund_where + ['refund_type' => 3]);
        $data['refunded_count'] = (string)$storeOrderRefundServices->count($refund_where + ['refund_type' => 6]);
        $data['refund_count'] = bcadd(bcadd($data['refunding_count'], $data['refunded_count'], 0), $data['no_refund_count'], 0);
        $data['pc_order_count'] = $data['order_count'] + $data['refunding_count'] + $data['refunded_count'];
        $data['pay_weixin_open'] = sys_config('pay_weixin_open', '0') != '0';//微信支付 1 开启 0 关闭
        $data['friend_pay_status'] = (int)sys_config('friend_pay_status') ?? 0;//好友代付 1 开启 0 关闭
        return $data;
    }

    /**
     * 订单详情数据格式化
     * @param $order
     * @param bool $detail 是否需要订单商品详情
     * @param bool $isPic 是否需要订单状态图片
     * @return mixed
     */
    public function tidyOrder($order, bool $detail = false, $isPic = false)
    {
        return (new StoreOrderPresentationServices($this->deliveryType))->tidyOrder($order, $detail, $isPic);
    }
    /**
     * 数据转换
     * @param array $data
     * @return array
     */
    public function tidyOrderList(array $data)
    {
        return (new StoreOrderPresentationServices($this->deliveryType))->tidyOrderList($data);
    }
    /**
     * 处理订单金额
     * @param $where
     * @return array
     */
    public function getOrderPrice($where)
    {
        if (isset($where['refund_type']) && $where['refund_type']) unset($where['refund_type']);
        $where['is_del'] = 0;//删除订单不统计
        $price['today_pay_price'] = 0;//今日支付金额
        $price['pay_price'] = 0;//支付金额
        $price['refund_price'] = 0;//退款金额
        $price['pay_price_wx'] = 0;//微信支付金额
        $price['pay_price_other'] = 0;//其他支付金额
        $price['deduction_price'] = 0;//抵扣金额
        $price['total_num'] = 0; //商品总数
        $price['today_count_sum'] = 0; //今日订单总数
        $price['count_sum'] = 0; //订单总数
        $price['pay_postage'] = 0;
        $whereData = ['is_del' => 0];
        if ($where['status'] == '') {
            $whereData['paid'] = 1;
        }
        $price['refund_price'] = $this->dao->together($where + ['is_del' => 0, 'paid' => 1, 'refund_status' => 2], 'refund_price');
        $sumNumber = $this->dao->search($where + $whereData)->field([
            'sum(total_num) as sum_total_num',
            'count(id) as count_sum',
            'sum(pay_price) as sum_pay_price',
            'sum(pay_postage) as sum_pay_postage',
            'sum(deduction_price) as sum_deduction_price'
        ])->find();
        if ($sumNumber) {
            $price['count_sum'] = $sumNumber['count_sum'];
            $price['total_num'] = $sumNumber['sum_total_num'];
            $price['pay_price'] = $sumNumber['sum_pay_price'];
            $price['pay_postage'] = $sumNumber['sum_pay_postage'];
            $price['deduction_price'] = $sumNumber['sum_deduction_price'];
        }
        $list = $this->dao->column($where + $whereData, 'sum(pay_price) as sum_pay_price,pay_type', 'id', 'pay_type');
        foreach ($list as $v) {
            if ($v['pay_type'] == 'weixin') {
                $price['pay_price_wx'] = $v['sum_pay_price'];
            } else {
                $price['pay_price_other'] = $v['sum_pay_price'];
            }
        }
        $where['time'] = 'today';
        $sumNumber = $this->dao->search($where + $whereData)->field([
            'count(id) as today_count_sum',
            'sum(pay_price) as today_pay_price',
        ])->find();
        if ($sumNumber) {
            $price['today_count_sum'] = $sumNumber['today_count_sum'];
            $price['today_pay_price'] = $where['status'] !== 0 ? $sumNumber['today_pay_price'] : 0;
        }
        return $price;
    }

    /**
     * 获取订单列表页面统计数据
     * @param $where
     * @return array
     */
    public function getBadge($where)
    {
        $price = $this->getOrderPrice($where);
        return [
            [
                'name' => '订单数量',
                'field' => '件',
                'count' => $price['count_sum'],
                'className' => 'md-basket',
                'col' => 6
            ],
            [
                'name' => '订单金额',
                'field' => '元',
                'count' => $price['pay_price'],
                'className' => 'md-pricetags',
                'col' => 6
            ],
            [
                'name' => '今日订单数量',
                'field' => '件',
                'count' => $price['today_count_sum'],
                'className' => 'ios-chatbubbles',
                'col' => 6
            ],
            [
                'name' => '今日支付金额',
                'field' => '元',
                'count' => $price['today_pay_price'],
                'className' => 'ios-cash',
                'col' => 6
            ],
        ];
    }

    /**
     *
     * @param array $where
     * @return mixed
     */
    /**
     * @param array $where
     * @return array
     * @throws \ReflectionException
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2024/3/14
     */
    public function orderCount(array $where)
    {
        $where['is_system_del'] = 0;
        $where['pid'] = 0;
        $data['un_paid'] = $this->dao->count($where + ['status' => 0], false);
        $data['un_send'] = $this->dao->count($where + ['status' => 1, 'shipping_type' => 1], false);
        return $data;
    }

    /**
     * 创建修改订单表单
     * @param int $id
     * @return array
     * @throws \FormBuilder\Exception\FormBuilderException
     */
    public function updateForm(int $id)
    {
        $product = $this->dao->get($id);
        if (!$product) {
            throw new AdminException('数据不存在');
        }
        $f = [];
        $f[] = Form::input('order_id', '订单编号', $product->getData('order_id'))->disabled(true);
        $f[] = Form::hidden('total_price', (float)$product->getData('total_price'));
        $f[] = Form::hidden('pay_postage', (float)$product->getData('pay_postage') ?: 0);
        $f[] = Form::number('pay_price', '实际支付金额', (float)$product->getData('pay_price'))->min(0);
        return create_form('修改订单', $f, $this->url('/order/update/' . $id), 'PUT');
    }

    /**
     * 修改订单
     * @param int $id
     * @param array $data
     * @return mixed
     * @throws \Exception
     */
    public function updateOrder(int $id, array $data)
    {
        $order = $this->dao->getOne(['id' => $id, 'is_del' => 0]);
        if (!$order) {
            throw new AdminException('订单不存在');
        }
        /** @var StoreOrderCreateServices $createServices */
        $createServices = app()->make(StoreOrderCreateServices::class);
        $data['order_id'] = $createServices->getNewOrderId('cp');
        /** @var StoreOrderStatusServices $services */
        $services = app()->make(StoreOrderStatusServices::class);
        return $this->transaction(function () use ($id, $data, $services) {
            $res = $this->dao->update($id, $data);
            $res = $res && $services->save([
                    'oid' => $id,
                    'change_type' => 'order_edit',
                    'change_time' => time(),
                    'change_message' => '修改商品总价为：' . $data['total_price'] . ' 实际支付金额' . $data['pay_price']
                ]);
            if ($res) {
                $order = $this->dao->getOne(['id' => $id, 'is_del' => 0]);
                //改价短信提醒
                event('NoticeListener', [['order' => $order, 'pay_price' => $data['pay_price']], 'price_revision']);
                //自定义消息-订单改价
                $order['change_price'] = $data['pay_price'];
                event('NoticeListener', [$order['uid'], $order, 'price_change_price']);

                //自定义事件-订单改价
                event('CustomEventListener', ['admin_order_change', [
                    'uid' => $order['uid'],
                    'order_id' => $data['order_id'],
                    'pay_price' => $data['pay_price'],
                    'change_time' => date('Y-m-d H:i:s'),
                ]]);

                return $data['order_id'];
            } else {
                throw new AdminException('修改失败');
            }
        });
    }

    /**
     * 订单图表
     * @param $cycle
     * @return array
     */
    public function orderCharts($cycle)
    {
        return (new StoreOrderStatisticsServices($this->dao))->orderCharts($cycle);
    }
    /**
     * 获取订单数量
     * @return int
     */
    public function storeOrderCount()
    {
        return $this->dao->storeOrderCount();
    }

    /**
     * 新订单ID
     * @param $status
     * @return array
     */
    public function newOrderId($status)
    {
        return $this->dao->search(['status' => $status, 'is_remind' => 0])->column('order_id', 'id');
    }

    /**
     * 新订单修改
     * @param $newOrderId
     * @return \crmeb\basic\BaseModel
     */
    public function newOrderUpdate($newOrderId)
    {
        return $this->dao->newOrderUpdates($newOrderId);
    }

    /**
     * 增长率
     * @param $left
     * @param $right
     * @return int|string
     */
    public function growth($nowValue, $lastValue)
    {
        return (new StoreOrderStatisticsServices($this->dao))->growth($nowValue, $lastValue);
    }

    /**
     * 后台首页顶部统计
     * @return array
     * @author 吴汐
     * @email 442384644@qq.com
     * @date 2023/04/03
     */
    public function homeStatics()
    {
        return (new StoreOrderStatisticsServices($this->dao))->homeStatics();
    }
    /**
     * 订单小票打印
     * @param int $id
     * @param bool $start
     * @return bool|void
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @throws \Exception
     */
    public function orderPrintTicket(int $id, $print_type)
    {
        $order = $this->get($id);
        if (!$order) {
            throw new AdminException('订单不存在');
        }
        /** @var StoreOrderCartInfoServices $cartServices */
        $cartServices = app()->make(StoreOrderCartInfoServices::class);
        $product = $cartServices->getCartInfoPrintProduct($order['id']);
        if (!$product) {
            throw new AdminException('订单商品获取失败,无法打印');
        }
//        $switch = (bool)sys_config('pay_success_printing_switch');
//        if (!$switch) {
//            throw new AdminException('小票打印未开启');
//        }

        app()->make(SystemTicketServices::class)->startPrint(
            is_object($order) ? $order->toArray() : $order,
            $product,
            $print_type
        );
        return true;

//        if (sys_config('print_type', 1) == 1) {
//            $name = 'yi_lian_yun';
//            $configData = [
//                'clientId' => sys_config('printing_client_id', ''),
//                'apiKey' => sys_config('printing_api_key', ''),
//                'partner' => sys_config('develop_id', ''),
//                'terminal' => sys_config('terminal_number', '')
//            ];
//            if (!$configData['clientId'] || !$configData['apiKey'] || !$configData['partner'] || !$configData['terminal']) {
//                throw new AdminException('请先配置小票打印开发者');
//            }
//        } else {
//            $name = 'fei_e_yun';
//            $configData = [
//                'feyUser' => sys_config('fey_user', ''),
//                'feyUkey' => sys_config('fey_ukey', ''),
//                'feySn' => sys_config('fey_sn', '')
//            ];
//            if (!$configData['feyUser'] || !$configData['feyUkey'] || !$configData['feySn']) {
//                throw new AdminException('请先配置小票打印开发者');
//            }
//        }
//        $printer = new Printer($name, $configData);
//        $res = $printer->setPrinterContent([
//            'name' => sys_config('site_name'),
//            'url' => sys_config('site_url'),
//            'orderInfo' => is_object($order) ? $order->toArray() : $order,
//            'product' => $product
//        ])->startPrinter();
//        if (!$res) {
//            throw new AdminException($printer->getError());
//        }
//        return true;
    }

    /**
     * 获取订单确认数据
     * @param array $user
     * @param $cartId
     * @param bool $new
     * @param int $addressId
     * @param int $shipping_type
     * @return array
     * @throws \Psr\SimpleCache\InvalidArgumentException
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getOrderConfirmData(array $user, $cartId, bool $new, int $addressId, int $shipping_type = 1, int $is_gift = 0)
    {
        $addr = [];
        /** @var UserAddressServices $addressServices */
        $addressServices = app()->make(UserAddressServices::class);
        if ($addressId) {
            $addr = $addressServices->getAddress($addressId);
        }
        //没传地址id或地址已删除未找到 ||获取默认地址
        if (!$addr) {
            $addr = $addressServices->getUserDefaultAddress((int)$user['uid']);
        }
        if ($addr) {
            $addr = $addr->toArray();
        } else {
            $addr = [];
        }
        if ($shipping_type == 2) $addr = [];
        if ($is_gift == 1) {
            $addr = [];
            $shipping_type = 0;
        }
        /** @var StoreCartServices $cartServices */
        $cartServices = app()->make(StoreCartServices::class);
        $cartGroup = $cartServices->getUserProductCartListV1($user['uid'], $cartId, $new, $addr, $shipping_type, $is_gift);
        $data = [];
        $data['storeFreePostage'] = $storeFreePostage = floatval(sys_config('store_free_postage')) ?: 0;//满额包邮金额
        $validCartInfo = $cartGroup['valid'];
        /** @var StoreOrderComputedServices $computedServices */
        $computedServices = app()->make(StoreOrderComputedServices::class);
        $priceGroup = $computedServices->getOrderPriceGroup($storeFreePostage, $validCartInfo, $addr, $user, $shipping_type, $is_gift);
        $validCartInfo = $priceGroup['cartInfo'] ?? $validCartInfo;
        $other = [];
        $cartIdA = explode(',', $cartId);
        $combination_id = 0;
        $advance_id = 0;
        if (count($cartIdA) == 1) {
            $combination_id = $cartGroup['deduction']['combination_id'] ?? 0;
            $advance_id = $cartGroup['deduction']['advance_id'] ?? 0;
        }
        $data['valid_count'] = count($validCartInfo);
        $data['virtual_type'] = $data['valid_count'] ? (int)$validCartInfo[0]['productInfo']['virtual_type'] > 0 : 0;
        $data['deduction'] = $combination_id || $advance_id;
        $data['addressInfo'] = $addr;
        $data['combination_id'] = $combination_id;
        $data['advance_id'] = $advance_id;
        $data['cartInfo'] = $cartGroup['cartInfo'];
        $data['custom_form'] = json_decode($cartGroup['cartInfo'][0]['productInfo']['custom_form'], true) ?? [];
        if (!is_array($data['custom_form'])) $data['custom_form'] = [];
        $data['priceGroup'] = $priceGroup;
        $data['orderKey'] = $this->cacheOrderInfo($user['uid'], $validCartInfo, $priceGroup, $other);
        if (isset($user['pwd'])) unset($user['pwd']);
        $data['userInfo'] = $user;
        $data['pay_weixin_open'] = sys_config('pay_weixin_open', '0') != '0';//微信支付 1 开启 0 关闭
        $data['friend_pay_status'] = (int)sys_config('friend_pay_status') ?? 0;//好友代付 1 开启 0 关闭
        /** @var UserInvoiceServices $userInvoice */
        $userInvoice = app()->make(UserInvoiceServices::class);
        $invoice_func = $userInvoice->invoiceFuncStatus();
        $data['invoice_func'] = $invoice_func['invoice_func'];
        $data['special_invoice'] = $invoice_func['special_invoice'];

        //自动领取优惠券
        app()->make(StoreCouponUserServices::class)->autoReceiveCoupon($user['uid'], $cartGroup);
        return $data;
    }

    /**
     * 缓存订单信息
     * @param $uid
     * @param $cartInfo
     * @param $priceGroup
     * @param array $other
     * @param int $cacheTime
     * @return string
     * @throws \Psr\SimpleCache\InvalidArgumentException
     */
    public function cacheOrderInfo($uid, $cartInfo, $priceGroup, $other = [], $cacheTime = 600)
    {
        $key = $this->getCacheKey();
        CacheService::set('user_order_' . $uid . $key, compact('cartInfo', 'priceGroup', 'other'), $cacheTime);
        return $key;
    }

    /**
     * 使用雪花算法生成订单ID
     * @return string
     * @throws \Exception
     */
    public function getCacheKey(string $prefix = '')
    {
        $snowflake = new \Godruoyi\Snowflake\Snowflake();
        //32位
        if (PHP_INT_SIZE == 4) {
            $id = abs($snowflake->id());
        } else {
            $id = $snowflake->setStartTimeStamp(strtotime('2020-06-05') * 1000)->id();
        }
        return $prefix . $id;
    }

    /**
     * 获取订单缓存信息
     * @param int $uid
     * @param string $key
     * @return |null
     */
    public function getCacheOrderInfo(int $uid, string $key)
    {
        $cacheName = 'user_order_' . $uid . $key;
        if (!CacheService::has($cacheName)) return null;
        return CacheService::get($cacheName);
    }

    /**
     * 获取拼团的订单id
     * @param int $pid
     * @param int $uid
     * @return mixed
     */
    public function getStoreIdPink(int $pid, int $uid)
    {
        return $this->dao->value(['uid' => $uid, 'pink_id' => $pid, 'is_del' => 0], 'order_id');
    }

    /**
     * 判断当前订单中是否有拼团
     * @param int $pid
     * @param int $uid
     * @return int
     */
    public function getIsOrderPink($pid = 0, $uid = 0)
    {
        return $this->dao->count(['uid' => $uid, 'pink_id' => $pid, 'refund_status' => 0, 'is_del' => 0]);
    }

    /**
     * 删除订单
     *
     * Only an order the user can no longer act on may be hidden: unpaid ones can
     * still be cancelled, in-flight ones still received, and refunding ones still
     * resolved. The status codes come from the presentation layer (`_type`).
     *
     * @param string $uni
     * @param int $uid
     * @return bool
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function removeOrder(string $uni, int $uid)
    {
        $order = $this->dao->getUserOrderDetail($uni, $uid);
        if (!$order) {
            throw new ApiException('订单不存在');
        }
        $order = $this->tidyOrder($order);
        $type = $order['_status']['_type'] ?? null;
        if (!in_array($type, [0, -2, 4], true)) {
            throw new ApiException('该订单无法删除');
        }

        $order->is_del = 1;
        /** @var StoreOrderStatusServices $statusService */
        $statusService = app()->make(StoreOrderStatusServices::class);
        $res = $statusService->save([
            'oid' => $order['id'],
            'change_type' => 'remove_order',
            'change_message' => '删除订单',
            'change_time' => time()
        ]);
        if ($order->save() && $res) {
            return true;
        }
        throw new ApiException('取消失败');
    }

    /**
     * 取消订单
     * @param $order_id
     * @param $uid
     * @return bool|void
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function cancelOrder($order_id, int $uid)
    {
        $order = $this->dao->getOne(['order_id' => $order_id, 'uid' => $uid, 'is_del' => 0]);
        if (!$order) {
            throw new ApiException('订单不存在');
        }
        if ($order->is_cancel == 1) {
            throw new ApiException('订单已取消，请勿重复操作！');
        }
        if ($order->paid) {
            throw new ApiException('订单已经支付无法取消');
        }
        $orderInfo = $order->toArray();
        if (!$this->cancelUnpaidOrder((int)$orderInfo['id'])) {
            // 并发下订单可能已经被别的入口处理掉了，重新读取后给出准确原因
            $fresh = $this->dao->get((int)$orderInfo['id']);
            if ($fresh && $fresh['is_cancel']) throw new ApiException('订单已取消，请勿重复操作！');
            if ($fresh && $fresh['paid']) throw new ApiException('订单已经支付无法取消');
            throw new ApiException('取消失败');
        }

        //自定义事件-订单取消
        event('CustomEventListener', ['order_cancel', [
            'uid' => $uid,
            'id' => $orderInfo['id'],
            'order_id' => $order_id,
            'real_name' => $orderInfo['real_name'],
            'user_phone' => $orderInfo['user_phone'],
            'user_address' => $orderInfo['user_address'],
            'total_num' => $orderInfo['total_num'],
            'pay_price' => $orderInfo['pay_price'],
            'deduction_price' => $orderInfo['deduction_price'],
            'coupon_price' => $orderInfo['coupon_price'],
            'cancel_time' => date('Y-m-d H:i:s'),
        ]]);

        return true;
    }

    /**
     * 取消未支付订单（手动取消、队列取消、定时取消共用的唯一入口）
     *
     * 关键约束：
     * 1. 释放库存和优惠券之前，先确认网关侧没有仍然可以收款的支付单；
     * 2. 事务内重新加锁读订单，已支付或已取消直接放弃，不重复退券、回库；
     * 3. 退券、各层库存恢复、取消状态必须同时提交，任一失败整体回滚。
     *
     * @param int $orderId 订单表主键
     * @param string|null $mark 取消原因；传 null 表示不覆盖订单原有备注（手动取消沿用原行为）
     * @return bool 是否真的执行了取消
     * @throws \think\db\exception\DbException
     */
    public function cancelUnpaidOrder(int $orderId, ?string $mark = null): bool
    {
        /** @var StoreOrderPaymentAttemptServices $attemptServices */
        $attemptServices = app()->make(StoreOrderPaymentAttemptServices::class);
        //关单必须在事务之外完成：网关调用不能持有数据库锁
        $this->settlePaymentAttempts($orderId, $attemptServices);

        /** @var StoreOrderRefundServices $refundServices */
        $refundServices = app()->make(StoreOrderRefundServices::class);
        $cancelled = $this->transaction(function () use ($orderId, $mark, $refundServices, $attemptServices) {
            $order = $this->dao->getForUpdate($orderId);
            if (!$order) {
                return false;
            }
            if ($order['paid'] || $order['is_cancel'] || $order['is_del']) {
                return false;
            }
            if (!$refundServices->couponBack($order, 'cancel')) {
                throw new ApiException('回退优惠券失败');
            }
            if (!$refundServices->regressionStock($order)) {
                throw new ApiException('库存回退失败');
            }
            $cancelData = ['is_cancel' => 1];
            if ($mark !== null && $mark !== '') {
                $cancelData['mark'] = $mark;
            }
            if (!$this->dao->update($orderId, $cancelData)) {
                throw new ApiException('取消失败');
            }
            $attemptServices->closeRemaining($orderId);
            return true;
        });

        return (bool)$cancelled;
    }

    /**
     * 确认订单名下所有未决支付尝试都已经不可能再收款
     *
     * 查到已收款直接中断取消；无法确认则抛错，由调用方稍后重试，绝不在状态
     * 不明的情况下释放库存。
     *
     * @param int $orderId
     * @param StoreOrderPaymentAttemptServices $attemptServices
     * @return void
     * @throws ApiException
     */
    private function settlePaymentAttempts(int $orderId, StoreOrderPaymentAttemptServices $attemptServices): void
    {
        $attempts = $attemptServices->openAttempts($orderId);
        if (!$attempts) {
            return;
        }
        /** @var PayTradeServices $tradeServices */
        $tradeServices = app()->make(PayTradeServices::class);
        foreach ($attempts as $attempt) {
            $state = $tradeServices->settleAttempt($attempt);
            if ($state === PayTradeServices::STATE_CLOSED) {
                $attemptServices->mark((int)$attempt['id'], StoreOrderPaymentAttempt::STATUS_CLOSED, 'cancel:closed');
                continue;
            }
            if ($state === PayTradeServices::STATE_PAID) {
                $attemptServices->mark(
                    (int)$attempt['id'],
                    StoreOrderPaymentAttempt::STATUS_PAID,
                    'cancel:paid',
                    (string)($attempt['trade_no'] ?? '')
                );
                throw new ApiException('订单已支付，无法取消');
            }
            throw new ApiException('支付状态确认失败，请稍后重试');
        }
    }

    /**
     * 判断订单完成
     * @param StoreProductReplyServices $replyServices
     * @param array $uniqueList
     * @param $oid
     * @return mixed
     */
    public function checkOrderOver($replyServices, array $uniqueList, $oid)
    {
        //订单商品全部评价完成
        $replyServices->count(['unique' => $uniqueList, 'oid' => $oid]);
        if ($replyServices->count(['unique' => $uniqueList, 'oid' => $oid]) >= count($uniqueList)) {
            $res = $this->dao->update(['id' => $oid, 'status' => 2], ['status' => 3]);
            if (!$res) throw new ApiException('修改失败');
            /** @var StoreOrderStatusServices $statusService */
            $statusService = app()->make(StoreOrderStatusServices::class);
            $statusService->save([
                'oid' => $oid,
                'change_type' => 'check_order_over',
                'change_message' => '用户评价',
                'change_time' => time()
            ]);
            $order = $this->dao->get((int)$oid, ['id,pid,status']);
            if ($order && $order['pid'] > 0) {
                $p_order = $this->dao->get((int)$order['pid'], ['id,pid,status']);
                //主订单全部收货 且子订单没有待评价 有已完成
                if ($p_order['status'] == 2 && !$this->dao->count(['pid' => $order['pid'], 'status' => 3]) && $this->dao->count(['pid' => $order['pid'], 'status' => 4])) {
                    $this->dao->update($p_order['id'], ['status' => 3]);
                    $statusService->save([
                        'oid' => $p_order['id'],
                        'change_type' => 'check_order_over',
                        'change_message' => '用户评价',
                        'change_time' => time()
                    ]);
                }
            }
        }
    }

    /**
     * 某个用户订单
     * @param int $uid
     * @param UserServices $userServices
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getUserOrderList(int $uid)
    {
        /** @var UserServices $userServices */
        $userServices = app()->make(UserServices::class);
        $user = $userServices->getUserInfo($uid, 'uid');
        if (!$user) {
            throw new AdminException('数据不存在');
        }
        [$page, $limit] = $this->getPageValue();
        $where = ['uid' => $uid, 'paid' => 1, 'refund_status' => 0, 'pid' => 0];
        $list = $this->dao->getStairOrderList($where, 'order_id,real_name,total_num,total_price,pay_price,FROM_UNIXTIME(pay_time,"%Y-%m-%d") as pay_time,paid,pay_type,pink_id', $page, $limit);
        $count = $this->dao->count($where);
        return compact('list', 'count');
    }


    /**
     * 订单导出
     * @param array $where
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getExportList(array $where)
    {
        $list = $this->dao->search($where)->order('id desc')->select()->toArray();
        foreach ($list as &$item) {
            /** @var StoreOrderCartInfoServices $orderCart */
            $orderCart = app()->make(StoreOrderCartInfoServices::class);
            $_info = $orderCart->getCartColunm(['oid' => $item['id']], 'cart_info', 'unique');
            foreach ($_info as $k => $v) {
                $cart_info = is_string($v) ? json_decode($v, true) : $v;
                if (!isset($cart_info['productInfo'])) $cart_info['productInfo'] = [];
                $_info[$k] = $cart_info;
                unset($cart_info);
            }
            $item['_info'] = $_info;
            /** @var WechatUserServices $wechatUserService */
            $wechatUserService = app()->make(WechatUserServices::class);
            $item['sex'] = $wechatUserService->value(['uid' => $item['uid']], 'sex');
            if ($item['pink_id'] || $item['combination_id']) {
                /** @var StorePinkServices $pinkService */
                $pinkService = app()->make(StorePinkServices::class);
                $pinkStatus = $pinkService->value(['order_id_key' => $item['id']], 'status');
                switch ($pinkStatus) {
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
                        $item['color'] = '#457856';
                        break;
                }
            } else {
                $item['pink_name'] = '[普通订单]';
                $item['color'] = '#895612';
            }
        }
        return $list;
    }

    /**
     * 自动取消订单
     * @return bool
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function orderUnpaidCancel()
    {
        //系统预设取消订单时间段
        $keyValue = ['order_cancel_time', 'order_activity_time', 'order_pink_time'];
        //获取配置
        $systemValue = SystemConfigService::more($keyValue);
        //格式化数据
        $systemValue = Arr::setValeTime($keyValue, is_array($systemValue) ? $systemValue : []);
        $list = $this->dao->getOrderUnPaidList();
        foreach ($list as $order) {
            if ($order['pink_id'] || $order['combination_id']) {
                $secs = $systemValue['order_pink_time'] ?: $systemValue['order_activity_time'];
            } else {
                $secs = $systemValue['order_cancel_time'];
            }
            //时间为 0 表示该类订单不自动取消，跳过这一条而不是中断整个列表
            if ($secs == 0) {
                continue;
            }
            if (($order['add_time'] + bcmul($secs, '3600', 0)) < time()) {
                try {
                    //与手动、队列取消共用同一个入口，失败时抛出并保留订单原状
                    $this->cancelUnpaidOrder((int)$order['id'], '订单未支付已超过系统预设时间');
                } catch (\Throwable $e) {
                    Log::error('订单号' . $order['order_id'] . '自动取消订单失败,失败原因:' . $e->getMessage());
                }
            }
        }
        return true;
    }

    /**根据时间获取当天或昨天订单营业额
     * @param array $where
     * @return float|int
     */
    public function getOrderMoneyByWhere(array $where, string $sum_field, string $selectType, string $group = "")
    {

        switch ($selectType) {
            case "sum" :
                return $this->dao->getDayTotalMoney($where, $sum_field);
            case "group" :
                return $this->dao->getDayGroupMoney($where, $sum_field, $group);
        }
    }

    /**统计时间段订单数
     * @param array $where
     * @param string $sum_field
     */
    public function getOrderCountByWhere(array $where)
    {
        return $this->dao->getDayOrderCount($where);
    }

    /**分组统计时间段订单数
     * @param $where
     * @return mixed
     */
    public function getOrderGroupCountByWhere($where)
    {
        return $this->dao->getOrderGroupCount($where);
    }

    /** 时间段支付订单人数
     * @param $where
     * @return mixed
     */
    public function getPayOrderPeopleByWhere($where)
    {
        return $this->dao->getPayOrderPeople($where);
    }

    /**时间段分组统计支付订单人数
     * @param $where
     * @return mixed
     */
    public function getPayOrderGroupPeopleByWhere($where)
    {
        return $this->dao->getPayOrderGroupPeople($where);
    }

    /**
     * 退款订单列表
     * @param array $where
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function refundList(array $where)
    {
        [$page, $limit] = $this->getPageValue();
        if ($where['refund_reason_time'] != '') $where['refund_reason_time'] = explode('-', $where['refund_reason_time']);
        $data = $this->dao->getRefundList($where, $page, $limit);
        if ($data['list']) $data['list'] = $this->tidyOrderList($data['list']);
        $data['num'] = [
            0 => ['name' => '全部', 'num' => $this->dao->count(['refund_type' => 0, 'is_system_del' => 0])],
            1 => ['name' => '仅退款', 'num' => $this->dao->count(['refund_type' => 1, 'is_system_del' => 0])],
            2 => ['name' => '退货退款', 'num' => $this->dao->count(['refund_type' => 2, 'is_system_del' => 0])],
            3 => ['name' => '拒绝退款', 'num' => $this->dao->count(['refund_type' => 3, 'is_system_del' => 0])],
            4 => ['name' => '商品待退货', 'num' => $this->dao->count(['refund_type' => 4, 'is_system_del' => 0])],
            5 => ['name' => '退货待收货', 'num' => $this->dao->count(['refund_type' => 5, 'is_system_del' => 0])],
            6 => ['name' => '已退款', 'num' => $this->dao->count(['refund_type' => 6, 'is_system_del' => 0])]
        ];
        return $data;
    }

    /**
     * 商家同意退款，等待客户退货
     * @param $order_id
     * @return bool
     */
    public function agreeRefund($order_id)
    {
        $res = $this->dao->update(['id' => $order_id], ['refund_type' => 4]);
        /** @var StoreOrderStatusServices $statusService */
        $statusService = app()->make(StoreOrderStatusServices::class);
        $statusService->save([
            'oid' => $order_id,
            'change_type' => 'refund_express',
            'change_message' => '等待用户退货',
            'change_time' => time()
        ]);
        if ($res) return true;
        throw new AdminException('操作失败');
    }

    /**
     * @param array $where
     * @param array|string[] $field
     * @param array $with
     * @param int $page
     * @param int $limit
     * @param string $order
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getSplitOrderList(array $where, array $field = ['*'], array $with = [], $page = 0, $limit = 0, $order = 'pay_time DESC,id DESC')
    {
        $data = $this->dao->getOrderList($where, $field, $page, $limit, $with, $order);
        if ($data) {
            $data = $this->tidyOrderList($data);
        }
        return $data;
    }

    /**
     * 代付详情
     * @param $orderId
     * @param $uid
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getFriendDetail($orderId, $uid)
    {
        $orderInfo = $this->dao->getOne(['id' => $orderId, 'is_del' => 0]);
        if ($orderInfo) {
            $orderInfo = $orderInfo->toArray();
        } else {
            throw new ApiException('订单不存在');
        }
        $orderInfo = $this->tidyOrder($orderInfo, true);
        /** @var UserServices $userServices */
        $userServices = app()->make(UserServices::class);
        $userInfo = $userServices->get($orderInfo['uid']);
        $friendInfo = $userServices->get($orderInfo['pay_uid']);
        $info = [
            'id' => $orderInfo['id'],
            'order_id' => $orderInfo['order_id'],
            'uid' => $orderInfo['uid'],
            'avatar' => $userInfo['avatar'],
            'nickname' => $userInfo['nickname'],
            'cartInfo' => $orderInfo['cartInfo'],
            'paid' => $orderInfo['paid'],
            'total_num' => $orderInfo['total_num'],
            'pay_price' => $orderInfo['pay_price'],
            'type' => $uid == $orderInfo['uid'] ? 0 : 1,
            'pay_uid' => isset($friendInfo) ? $friendInfo['uid'] : 0,
            'pay_nickname' => isset($friendInfo) ? $friendInfo['nickname'] : '',
            'pay_avatar' => isset($friendInfo) ? $friendInfo['avatar'] : '',
        ];
        return $info;
    }

    /**
     * 获取退货商品列表
     * @param array $cart_ids
     * @param int $id
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function refundCartInfoList(array $cart_ids = [], int $id = 0)
    {
        $orderInfo = $this->dao->get($id);
        if (!$orderInfo) {
            throw new ApiException('订单不存在');
        }
        $orderInfo = $this->tidyOrder($orderInfo, true);
        $cartInfo = $orderInfo['cartInfo'] ?? [];
        $data = [];
        if ($cart_ids) {
            foreach ($cart_ids as $cart) {
                if (!isset($cart['cart_id']) || !$cart['cart_id'] || !isset($cart['cart_num']) || !$cart['cart_num'] || $cart['cart_num'] <= 0) {
                    throw new ApiException('请重新选择退款商品或件数');
                }
            }
            $cart_ids = array_combine(array_column($cart_ids, 'cart_id'), $cart_ids);
            $i = 0;
            foreach ($cartInfo as $item) {
                if (isset($cart_ids[$item['id']])) {
                    $data['cartInfo'][$i] = $item;
                    if (isset($cart_ids[$item['id']]['cart_num'])) $data['cartInfo'][$i]['cart_num'] = $cart_ids[$item['id']]['cart_num'];
                    $i++;
                }
            }
        }
        $data['_status'] = $orderInfo['_status'] ?? [];
        $data['_status']['_is_back'] = $orderInfo['delivery_type'] != 'fictitious' && $orderInfo['virtual_type'] == 0;
        $data['cartInfo'] = $data['cartInfo'] ?? $cartInfo;
        return $data;
    }

    /**
     * 再次下单
     * @param string $uni
     * @param int $uid
     * @return array
     */
    public function againOrder(StoreCartServices $services, string $uni, int $uid): array
    {
        if (!$uni) throw new ApiException('参数错误');
        $order = $this->getUserOrderDetail($uni, $uid);
        if (!$order) throw new ApiException('订单不存在');
        $order = $this->tidyOrder($order, true);
        $cateId = [];

        foreach ($order['cartInfo'] as $v) {
            if ($v['combination_id']) throw new ApiException('拼团商品不能再来一单，请在拼团商品内自行下单');
            elseif ($v['advance_id']) throw new ApiException('预售商品不能再来一单，请在预售商品内自行下单');
            else $cateId[] = $services->setCart($uid, (int)$v['product_id'], (int)$v['cart_num'], $v['productInfo']['attrInfo']['unique'] ?? '', '0', true);
        }
        if (!$cateId) throw new ApiException('再来一单失败，请重新下单');
        return $cateId;
    }

    /**
     * 用户订单信息
     * @param string $uni
     * @param int $uid
     * @return void
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     */
    public function getUserOrderByKey(string $uni, int $uid): array
    {
        $order = $this->getUserOrderDetail($uni, $uid, ['split', 'invoice', 'user']);
        if (!$order) throw new ApiException('订单不存在');
        $order = $order->toArray();
        $splitNum = [];
        $order['mapKey'] = sys_config('tengxun_map_key');
        $order['pay_weixin_open'] = sys_config('pay_weixin_open') != '0';//微信支付 1 开启 0 关闭
        $order['friend_pay_status'] = (int)sys_config('friend_pay_status') ?? 0;//好友代付 1 开启 0 关闭
        $orderData = $this->tidyOrder($order, true, true);
        foreach ($orderData['cartInfo'] ?? [] as $key => $cart) {
            if (isset($splitNum[$cart['id']])) {
                $orderData['cartInfo'][$key]['cart_num'] = $cart['cart_num'] - $splitNum[$cart['id']];
                if ($orderData['cartInfo'][$key]['cart_num'] == 0) unset($orderData['cartInfo'][$key]);
            }
        }
        $orderData['cartInfo'] = array_merge($orderData['cartInfo']);
        $orderData['vip_true_price'] = 0;
        $orderData['levelPrice'] = 0;
        $orderData['memberPrice'] = 0;
        $orderData['postage_price'] = 0;
        $orderData['member_price'] = 0;
        $orderData['routine_contact_type'] = sys_config('routine_contact_type', 0);
        /** @var UserInvoiceServices $userInvoice */
        $userInvoice = app()->make(UserInvoiceServices::class);
        $invoice_func = $userInvoice->invoiceFuncStatus();
        $orderData['invoice_func'] = $invoice_func['invoice_func'];
        $orderData['special_invoice'] = $invoice_func['special_invoice'];
        $orderData['refund_cartInfo'] = $orderData['cartInfo'];
        $orderData['refund_total_num'] = $orderData['total_num'];
        $orderData['refund_pay_price'] = $orderData['pay_price'];
        $orderData['is_apply_refund'] = true;
        $orderData['help_info'] = [
            'pay_uid' => $orderData['pay_uid'],
            'pay_nickname' => '',
            'pay_avatar' => '',
            'help_status' => 0
        ];
        $orderData['gift_user_info'] = [
            'gift_uid' => $orderData['gift_uid'],
            'gift_nickname' => '',
            'gift_avatar' => '',
        ];
        if ($orderData['uid'] != $orderData['pay_uid']) {
            /** @var UserServices $userServices */
            $userServices = app()->make(UserServices::class);
            $payUser = $userServices->get($orderData['pay_uid'], ['nickname', 'avatar']);
            $orderData['help_info'] = [
                'pay_uid' => $orderData['pay_uid'],
                'pay_nickname' => $payUser['nickname'],
                'pay_avatar' => $payUser['avatar'],
                'help_status' => 1
            ];
        }
        if ($orderData['gift_uid'] != 0) {
            /** @var UserServices $userServices */
            $userServices = app()->make(UserServices::class);
            $giftUser = $userServices->get($orderData['gift_uid'], ['nickname', 'avatar']);
            $orderData['gift_user_info'] = [
                'gift_uid' => $orderData['gift_uid'],
                'gift_nickname' => $giftUser['nickname'],
                'gift_avatar' => $giftUser['avatar'],
            ];
        }
        // 判断是否开启小程序订单管理
        $orderData['order_shipping_open'] = false;
        if (sys_config('order_shipping_open', 0) && $order['pay_price'] > 0 && $order['is_channel'] == 1 && $order['pay_type'] == 'weixin' && MiniOrderService::isManaged()) {
            // 判断是否存在子未收货子订单
            if ($order['pid'] > 0) {
                if ($this->checkSubOrderNotTake((int)$order['pid'], (int)$order['id'])) {
                    $orderData['order_shipping_open'] = true;
                }
            } else {
                $orderData['order_shipping_open'] = true;
            }

        }
        $orderData['is_refund_available'] = $this->isRefundAvailable((int)$order['id']);

        $orderData['gift_key'] = $orderData['gift_code'] = '';
        if ($order['is_gift'] == 1) {
            $orderData['gift_key'] = md5($order['id'] . '_' . $order['order_id'] . '_' . $order['uid']);
            /** @var QrcodeServices $qrcodeService */
            $qrcodeService = app()->make(QrcodeServices::class);
            $orderData['gift_code'] = $qrcodeService->getRoutineQrcodePath($order['id'], $order['uid'], 7, ['gift_key' => $orderData['gift_key']]);
        }
        $orderData['avatar'] = set_file_url($orderData['avatar']);
        return $orderData;
    }

    /**
     * 检测订单是否能退款
     * @param $oid
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/10/11
     */
    public function isRefundAvailable($oid)
    {
        $refundTimeAvailable = (int)sys_config('refund_time_available');
        if ($refundTimeAvailable == 0) return true;
        $statusInfo = app()->make(StoreOrderStatusServices::class)->get(['oid' => $oid, 'change_type' => 'take_delivery']);
        if (!$statusInfo) return true;
        $changeTime = preg_match('/^\d+$/', $statusInfo['change_time']) ? intval($statusInfo['change_time']) : strtotime($statusInfo['change_time']);
        if (($changeTime + ($refundTimeAvailable * 86400)) < time()) {
            return false;
        }
        return true;
    }

    /**
     * 获取确认订单页面是否展示快递配送和到店自提
     * @param $uid
     * @param $cartIds
     * @param $new
     * @return array
     * @throws \Psr\SimpleCache\InvalidArgumentException
     */
    public function checkShipping($uid, $cartIds, $new)
    {
        if ($new) {
            $cartIds = explode(',', $cartIds);
            $cartInfo = [];
            foreach ($cartIds as $key) {
                $info = CacheService::get($key);
                if ($info) {
                    $cartInfo[] = $info;
                }
            }
        } else {
            /** @var StoreCartServices $cartServices */
            $cartServices = app()->make(StoreCartServices::class);
            $cartInfo = $cartServices->getCartList(['uid' => $uid, 'status' => 1, 'id' => $cartIds], 0, 0, ['productInfo', 'attrInfo']);
        }
        if (!$cartInfo) {
            throw new ApiException('数据不存在');
        }
        $arr = [];
        foreach ($cartInfo as $item) {
            $arr[] = $item['productInfo']['logistics'];
        }
        $res = array_unique(explode(',', implode(',', $arr)));
        if (count($res) == 2) {
            return ['type' => 0];
        }
        return ['type' => 1];
    }

    /**
     * 自动评价
     * @return bool
     */
    public function autoComment()
    {
        //自动评价天数
        $systemCommentTime = sys_config('system_comment_time', 0);
        //0为取消自动默认好评功能
        if ($systemCommentTime == 0) {
            return true;
        }
        $sevenDay = bcsub((string)time(), bcmul((string)$systemCommentTime, '86400'));
        /** @var StoreOrderStoreOrderStatusServices $service */
        $service = app()->make(StoreOrderStoreOrderStatusServices::class);
        $orderList = $service->getTakeOrderIds([
            'change_time' => $sevenDay,
            'is_del' => 0,
            'paid' => 1,
            'status' => 2,
            'change_type' => ['take_delivery', 'user_take_delivery']
        ], 30);
        foreach ($orderList as $item) {
            AutoCommentJob::dispatch([$item['id'], $item['cart_id']]);
        }
        return true;
    }

    /**
     * @param int $uid
     * @param string $orderId
     * @param string $type
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author 等风来
     * @email 136327134@qq.com
     * @date 2023/2/13
     */
    public function getCashierInfo(int $uid, string $orderId, string $type)
    {
        //支付类型开关
        $data = [
            'wechat_pay_status' => sys_config('pay_weixin_open', '0') != '0',
            'friend_pay_status' => (int)sys_config('friend_pay_status') == 1,
        ];

        $data['order_id'] = $orderId;
        $data['pay_price'] = '0';

        switch ($type) {
            case 'order':
                $info = $this->dao->get(['order_id' => $orderId], ['id', 'pay_price', 'add_time', 'combination_id', 'pay_postage', 'is_gift']);
                if (!$info) {
                    throw new PayException('您支付的订单不存在');
                }
                $orderCancelTime = sys_config('order_cancel_time', 0);
                $orderActivityTime = sys_config('order_activity_time', 0);
                if ($info->combination_id) {
                    $time = (sys_config('order_pink_time', 0) ?: $orderActivityTime) * 60 * 60 + ((int)$info->add_time);
                } else {
                    $time = $orderCancelTime * 60 * 60 + ((int)$info->add_time);
                }

                if ($time < 0) {
                    $time = 0;
                }

                $data['pay_price'] = $info['pay_price'];
                $data['pay_postage'] = $info['pay_postage'];
                $data['invalid_time'] = $time;
                $data['oid'] = $info['id'];
                $data['is_gift'] = $info['is_gift'];

                break;
            default:
                throw new PayException('暂不支持其他类型订单支付');
        }

        return $data;
    }

    /**
     * 取消商家寄件
     * @param int $id
     * @param string $msg
     * @return array|mixed
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author 等风来
     * @email 136327134@qq.com
     * @date 2023/5/15
     */
    public function shipmentCancelOrder(int $id, string $msg)
    {
        $orderInfo = $this->dao->get($id);
        if (!$orderInfo) {
            throw new AdminException('取消的订单不存在');
        }
        if (!$orderInfo->kuaidi_task_id || !$orderInfo->kuaidi_order_id) {
            throw new AdminException('商家寄件订单信息不存在，无法取消');
        }
        if ($orderInfo->is_stock_up != 1) {
            throw new AdminException('订单状态不正确，无法取消寄件');
        }

        //发起取消商家寄件
        app()->make(ServeServices::class)->express()->shipmentCancelOrder([
            'task_id' => $orderInfo->kuaidi_task_id,
            'order_id' => $orderInfo->kuaidi_order_id,
            'cancel_msg' => $msg,
        ]);

        //订单返回原状态
        $this->transaction(function () use ($id, $msg, $orderInfo) {
            app()->make(StoreOrderStatusServices::class)->save([
                'oid' => $id,
                'change_time' => time(),
                'change_type' => 'delivery_goods_cancel',
                'change_message' => '已取消发货，取消原因：' . $msg
            ]);

            $orderInfo->status = 0;
            $orderInfo->is_stock_up = 0;
            $orderInfo->kuaidi_task_id = '';
            $orderInfo->kuaidi_order_id = '';
            $orderInfo->express_dump = '';
            $orderInfo->kuaidi_label = '';
            $orderInfo->delivery_id = '';
            $orderInfo->delivery_code = '';
            $orderInfo->delivery_name = '';
            $orderInfo->delivery_type = '';
            $orderInfo->save();
        });

        return true;
    }

    /**
     * 判断订单是否全部发货
     * @param int $pid
     * @param int $order_id
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/31
     */
    public function checkSubOrderNotSend(int $pid, int $order_id)
    {
        $order_count = $this->dao->getSubOrderNotSend($pid, $order_id);
        if ($order_count > 0) {
            return false;
        } else {
            return true;
        }
    }

    /**
     * 判断是否存在子未收货子订单
     * @param int $pid
     * @param int $order_id
     * @return bool
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/8/31
     */
    public function checkSubOrderNotTake(int $pid, int $order_id)
    {
        $order_count = $this->dao->getSubOrderNotTake($pid, $order_id);
        if ($order_count > 0) {
            return false;
        } else {
            return true;
        }
    }

    /**
     * 配货单数据
     * @param $oid
     * @return array
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author: 吴汐
     * @email: 442384644@qq.com
     * @date: 2023/10/11
     */
    public function printShippingData($order_id)
    {
        $orderInfo = $this->dao->get(['order_id' => $order_id]);
        if (!$orderInfo) {
            throw new AdminException('订单不存在');
        }
        $orderInfo = $this->tidyOrder($orderInfo->toArray(), true);
        $data['user_name'] = $orderInfo['real_name'];
        $data['user_phone'] = $orderInfo['user_phone'];
        $data['user_address'] = $orderInfo['user_address'];
        $data['order_id'] = $orderInfo['order_id'];
        $data['pay_time'] = $orderInfo['_pay_time'];
        $data['pay_type'] = $orderInfo['_status']['_payType'];
        $data['pay_price'] = $orderInfo['pay_price'];
        $data['pay_postage'] = $orderInfo['pay_postage'];
        $data['deduction_price'] = $orderInfo['deduction_price'];
        $data['coupon_price'] = $orderInfo['coupon_price'];
        $data['mark'] = $orderInfo['mark'];
        $data['product_info'] = [];
        $data['vip_price'] = 0;
        foreach ($orderInfo['cartInfo'] as $item) {
            $data['product_info'][] = [
                'name' => $item['productInfo']['store_name'],
                'sku' => $item['attrInfo']['suk'],
                'price' => $item['sum_price'],
                'num' => $item['cart_num'],
                'sum_price' => bcmul((string)$item['sum_price'], (string)$item['cart_num'], 2)
            ];
            $data['vip_price'] = bcadd((string)$data['vip_price'], $item['vip_sum_truePrice'] ?? 0, 2);
        }
        return $data;
    }

    public function giftDetail($oid)
    {
        $orderInfo = $this->dao->getOne(['id' => $oid, 'is_del' => 0]);
        if ($orderInfo) {
            $orderInfo = $orderInfo->toArray();
        } else {
            throw new ApiException('订单不存在');
        }
        $orderInfo = $this->tidyOrder($orderInfo, true);
        /** @var UserServices $userServices */
        $userServices = app()->make(UserServices::class);
        $userInfo = $userServices->get($orderInfo['uid']);
        $arr = [];
        foreach ($orderInfo['cartInfo'] as $cartInfo) {
            $arr[] = $cartInfo['productInfo']['logistics'];
        }
        $res = array_unique(explode(',', implode(',', $arr)));
        $type = count($res) == 2 ? 0 : 1;
        return [
            'id' => $orderInfo['id'],
            'order_id' => $orderInfo['order_id'],
            'uid' => $orderInfo['uid'],
            'avatar' => set_file_url($userInfo['avatar']),
            'nickname' => $userInfo['nickname'],
            'cartInfo' => $orderInfo['cartInfo'],
            'paid' => $orderInfo['paid'],
            'total_num' => $orderInfo['total_num'],
            'pay_price' => $orderInfo['pay_price'],
            'gift_key' => md5($orderInfo['id'] . '_' . $orderInfo['order_id'] . '_' . $orderInfo['uid']),
            'gift_mark' => $orderInfo['gift_mark'],
            'gift_uid' => $orderInfo['gift_uid'],
            'refund_status' => $orderInfo['refund_status'],
            'type' => $type,
        ];
    }

    public function receiveGift($uid, $oid, $gift_key, $shipping_type, $name, $phone, $address_id = 0)
    {
        $orderInfo = $this->dao->get($oid);
        if (!$orderInfo) {
            throw new AdminException('订单不存在');
        }
        if ($gift_key != md5($orderInfo['id'] . '_' . $orderInfo['order_id'] . '_' . $orderInfo['uid'])) {
            throw new AdminException('领取失败');
        }
        if ($orderInfo['refund_status'] != 0) {
            throw new AdminException('订单已退款');
        }
        if ($orderInfo['uid'] == $uid) {
            throw new AdminException('不能领取自己的礼物');
        }
        if ($orderInfo['gift_uid'] != 0 && $orderInfo['gift_uid'] != $uid) {
            return false;
        }
        $address = '';
        if ($shipping_type == 1 && $address_id) {
            $addressInfo = app()->make(UserAddressServices::class)->getOne(['uid' => $uid, 'id' => $address_id, 'is_del' => 0]);
            $name = $addressInfo['real_name'];
            $phone = $addressInfo['phone'];
            $address = $addressInfo['province'] . ' ' . $addressInfo['city'] . ' ' . $addressInfo['district'] . ' ' . $addressInfo['detail'];
        }
        $orderData = [
            'gift_uid' => $uid,
            'real_name' => $name,
            'user_phone' => $phone,
            'user_address' => $address,
            'shipping_type' => $shipping_type,
        ];
        $this->dao->update($oid, $orderData);
        return true;
    }

    /**
     * 修改订单地址
     * @param $id
     * @param $data
     * @return bool
     * @throws \think\db\exception\DataNotFoundException
     * @throws \think\db\exception\DbException
     * @throws \think\db\exception\ModelNotFoundException
     * @author wuhaotian
     * @email 442384644@qq.com
     * @date 2025/9/8
     */
    public function editAddress($id, $data)
    {
        $orderInfo = $this->dao->getOne(['id' => $id, 'is_del' => 0]);
        if (!$orderInfo) {
            throw new ApiException('订单不存在');
        }
        if ($orderInfo['status'] > 0) {
            throw new ApiException('订单已发货，不能修改地址');
        }
        $this->dao->update($id, [
            'real_name' => $data['real_name'],
            'user_phone' => $data['user_phone'],
            'user_address' => $data['user_address'],
        ]);
        return true;
    }
}
