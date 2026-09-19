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
 * 订单支付后置副作用
 *
 * 支付事务只保证"订单已支付"这件事落库，消息、打印、开票等外部调用改由本表
 * 驱动。副作用随支付事务一起提交，提交后立即执行；进程中断留下的待处理记录
 * 由队列和定时任务补投。
 *
 * Class StoreOrderEffect
 * @package app\model\order
 */
class StoreOrderEffect extends BaseModel
{
    use ModelTrait;

    /** 待处理 */
    const STATUS_PENDING = 0;
    /** 已完成 */
    const STATUS_DONE = 1;
    /** 结果未知，需要补投或人工确认 */
    const STATUS_UNKNOWN = 2;
    /** 执行中，进程中断后由超时规则重新领取 */
    const STATUS_RUNNING = 3;

    /** 超过该秒数仍停留在"执行中"的记录视为进程中断，可以被重新领取 */
    const STALE_SECONDS = 300;

    /** 单条记录自动处理的最大次数，超过后保留现场等待人工确认 */
    const MAX_ATTEMPTS = 20;

    /**
     * 模型名称
     * @var string
     */
    protected $name = 'store_order_effect';

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
     * 事件类型搜索器
     * @param $query
     * @param $value
     */
    public function searchEventTypeAttr($query, $value)
    {
        if ($value !== '' && !is_null($value)) $query->where('event_type', $value);
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
