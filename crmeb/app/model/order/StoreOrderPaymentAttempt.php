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

namespace app\model\order;

use crmeb\basic\BaseModel;
use crmeb\traits\ModelTrait;

/**
 * 订单支付尝试记录
 *
 * 每一次向支付网关提交的商户订单号都单独落一行。订单表的 order_id 会随付款人
 * 变化被改写，异步回调不能只靠它定位订单，必须回查这里的尝试记录。
 *
 * Class StoreOrderPaymentAttempt
 * @package app\model\order
 */
class StoreOrderPaymentAttempt extends BaseModel
{
    use ModelTrait;

    /** 已提交，网关结果未知 */
    const STATUS_SUBMITTED = 0;
    /** 网关已支付 */
    const STATUS_PAID = 1;
    /** 已确认关闭或确定不存在 */
    const STATUS_CLOSED = 2;
    /** 查询结果无法识别，禁止据此释放资源 */
    const STATUS_UNKNOWN = 3;

    /**
     * 模型名称
     * @var string
     */
    protected $name = 'store_order_payment_attempt';

    /**
     * 时间字段由业务显式写入
     * @var bool
     */
    protected $autoWriteTimestamp = false;

    /**
     * 订单表ID搜索器
     * @param $query
     * @param $value
     */
    public function searchStoreOrderIdAttr($query, $value)
    {
        if ($value !== '' && !is_null($value)) $query->where('store_order_id', $value);
    }

    /**
     * 商户订单号搜索器
     * @param $query
     * @param $value
     */
    public function searchOutTradeNoAttr($query, $value)
    {
        if ($value !== '' && !is_null($value)) $query->where('out_trade_no', $value);
    }

    /**
     * 状态搜索器
     * @param $query
     * @param $value
     */
    public function searchStatusAttr($query, $value)
    {
        if ($value !== '' && !is_null($value)) $query->where('status', $value);
    }
}
