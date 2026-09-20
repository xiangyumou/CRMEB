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

/**
 * 异常收款记录
 *
 * 一笔钱到了网关，但订单侧已经无法或不应把它当作正常支付：已取消订单的
 * 迟到收款、已支付订单的第二笔真实收款、无法归属任何订单的交易。记录本身
 * 就是告警，人工通过 order:reconcile 核对后原路退款，系统绝不自动退款。
 *
 * Class StoreOrderPaymentException
 * @package app\model\order
 */
class StoreOrderPaymentException extends BaseModel
{
    protected $name = 'store_order_payment_exception';
    protected $autoWriteTimestamp = false;

    /** 已取消订单收到的有效回调 */
    const REASON_CANCELLED = 'cancelled_order_payment';
    /** 已支付订单收到的第二笔真实收款（不同交易号） */
    const REASON_DUPLICATE = 'duplicate_payment';
    /** 无法归属到任何订单或支付尝试的回调 */
    const REASON_UNMATCHED = 'unmatched_payment';

    /** 待处理 */
    const STATUS_PENDING = 0;
    /** 已退款 */
    const STATUS_REFUNDED = 1;
    /** 退款结果未知 */
    const STATUS_REFUND_UNKNOWN = 2;
    /** 退款失败 */
    const STATUS_REFUND_FAILED = 3;
}
