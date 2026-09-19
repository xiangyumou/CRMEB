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
namespace crmeb\services\pay;

use EasyWeChat\Payment\Order;
use crmeb\basic\BaseStorage;

/**
 * Class BasePay
 * @package crmeb\services\pay
 */
abstract class BasePay extends BaseStorage
{
    /**
     * @var string
     */
    protected $payType;

    /**
     * 设置支付类型
     * @param string $type
     * @return $this
     */
    public function setPayType(string $type)
    {
        $this->payType = $type;
        return $this;
    }

    /**
     * 设置支付类型
     * @param string $type
     * @return $this
     */
    public function authSetPayType()
    {
        if (!$this->payType) {
            if (request()->isPc()) {
                $this->payType = Order::NATIVE;
            }
            if (request()->isApp()) {
                $this->payType = Order::APP;
            }
            if (request()->isRoutine() || request()->isWechat()) {
                $this->payType = Order::JSAPI;
            }
            if (request()->isH5()) {
                $this->payType = 'h5';
            }
        }
    }

    /**
     * 默认不支持查询支付单状态
     *
     * 没有实现查单能力的驱动必须返回 unknown，取消订单时保留库存和优惠券，
     * 不允许把"查不到"当成"已关单"。
     *
     * @param string $outTradeNo
     * @param array $options
     * @return array{state:string,trade_no:string,raw:mixed}
     */
    public function queryOrder(string $outTradeNo, array $options = [])
    {
        return ['state' => 'unknown', 'trade_no' => '', 'raw' => null];
    }

    /**
     * 默认不支持关闭支付单
     * @param string $outTradeNo
     * @param array $options
     * @return bool
     */
    public function closeOrder(string $outTradeNo, array $options = []): bool
    {
        return false;
    }


}
