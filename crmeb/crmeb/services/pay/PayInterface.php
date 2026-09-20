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

/**
 * 支付接口类
 * Interface PayInterface
 * @package crmeb\services\pay
 */
interface PayInterface
{

    /**
     * 设置支付类型
     * @param string $type 支付类型
     * @return $this
     */
    public function setPayType(string $type);

    /**
     * 创建支付
     * @param string $orderId 订单号
     * @param string $totalFee 支付金额
     * @param string $attach 回调内容
     * @param string $body 支付body
     * @param string $detail 详情
     * @param string $tradeType 支付类型
     * @param array $options 其他参数
     * @return mixed
     */
    public function create(string $orderId, string $totalFee, string $attach, string $body, string $detail, array $options = []);

    /**
     * 企业支付到零钱
     * @param string $openid openid
     * @param string $orderId 订单id
     * @param string $amount 支付金额
     * @param array $options 其他参数
     * @return mixed
     */
    public function merchantPay(string $openid, string $orderId, string $amount, array $options = []);

    /**
     * 退款。
     *
     * Drivers return a normalized result: state is success, processing,
     * closed, or unknown; refund_no is the durable merchant refund number;
     * raw keeps the gateway response for reconciliation.
     *
     * @param string $outTradeNo 原支付单号或支付交易号
     * @param array $options 退款金额、稳定退款单号与支付上下文
     * @return array{state:string,refund_no:string,refund_price?:string,raw:mixed}|mixed
     */
    public function refund(string $outTradeNo, array $options = []);

    /**
     * 查询退款订单。v3 必须使用持久化的 out_refund_no。
     * @param string $outTradeNo 原支付单号或支付交易号（v2 兼容参数）
     * @param string $outRequestNo 持久化的商户退款单号
     * @param array $other 支付上下文
     * @return array{state:string,refund_no:string,refund_price?:string,raw:mixed}|mixed
     */
    public function queryRefund(string $outTradeNo, string $outRequestNo, array $other = []);

    /**
     * 查询支付单在网关侧的真实状态
     *
     * 取消订单前必须确认网关侧没有仍然可支付的单子，否则会出现"库存已释放、
     * 用户却还能付款"。返回结构固定为：
     * - state: paid | closed | not_exist | unknown
     * - trade_no: 网关流水号，取不到时为空字符串
     * - raw: 网关原始返回，仅用于排查
     *
     * 任何无法识别的结果都必须返回 unknown，调用方据此保留库存和优惠券。
     *
     * @param string $outTradeNo 商户订单号
     * @param array $options 支付上下文（付款通道、是否新小程序支付等）
     * @return array{state:string,trade_no:string,raw:mixed}
     */
    public function queryOrder(string $outTradeNo, array $options = []);

    /**
     * 关闭支付单
     *
     * 只有确认已关闭或者确定不存在才能返回 true；网络异常、响应无法识别一律
     * 返回 false，让调用方保留资源并稍后重试。
     *
     * @param string $outTradeNo 商户订单号
     * @param array $options 支付上下文（付款通道、是否新小程序支付等）
     * @return bool
     */
    public function closeOrder(string $outTradeNo, array $options = []): bool;

    /**
     * 支付回调
     * @return mixed
     */
    public function handleNotify();

}
