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
declare (strict_types=1);

namespace app\services\pay;

use crmeb\exceptions\ApiException;
use crmeb\services\pay\Pay;

/**
 * 支付统一入口
 * Class PayServices
 * @package app\services\pay
 */
class PayServices
{
    //微信支付类型
    const WEIXIN_PAY = 'weixin';

    //支付方式：现役订单只有微信；其余键只用于渲染历史流水/订单，不再受理
    const PAY_TYPE = [
        PayServices::WEIXIN_PAY => '微信支付',
        'yue' => '余额支付',
        'offline' => '线下支付',
        'alipay' => '支付宝',
        'friend' => '好友代付',
        'allinpay' => '通联支付',
        'bank' => '银行转账',
    ];

    /**
     * @var array
     */
    protected $options = [];

    /**
     * @param string $key
     * @param $value
     * @return $this
     * @author 等风来
     * @email 136327134@qq.com
     * @date 2023/1/16
     */
    public function setOption(string $key, $value)
    {
        $this->options[$key] = $value;
        return $this;
    }

    /**
     * @param array $value
     * @return $this
     * @author 等风来
     * @email 136327134@qq.com
     * @date 2023/1/16
     */
    public function setOptions(array $value)
    {
        $this->options = $value;
        return $this;
    }

    /**
     * @param string $key
     * @param null $default
     * @return mixed|null
     * @author 等风来
     * @email 136327134@qq.com
     * @date 2023/1/16
     */
    protected function getOption(string $key, $default = null)
    {
        return $this->options[$key] ?? $default;
    }

    /**
     * 发起支付
     * @param string $payType
     * @param string $openid
     * @param string $orderId
     * @param string $price
     * @param string $successAction
     * @param string $body
     * @return array|string
     */
    public function pay(string $payType, string $orderId, string $price, string $successAction, string $body, array $options = [])
    {
        if (!in_array($payType, ['routine','weixinh5','weixin','pc','store'], true)) {
            throw new ApiException('当前商城仅支持微信支付');
        }
        try {
            //这些全都是微信支付
            if (sys_config('pay_wechat_type') == 1) {
                $payType = 'v3_wechat_pay';
            } else {
                $payType = 'wechat_pay';
            }

            /** @var Pay $pay */
            $pay = app()->make(Pay::class, [$payType]);


            return $pay->create($orderId, $price, $successAction, $body, '', ['pay_new_weixin_open' => (bool)sys_config('pay_new_weixin_open')] + $options);

        } catch (\Exception $e) {
            if (strpos($e->getMessage(), 'api unauthorized rid') !== false) {
                throw new ApiException('请在微信支付配置中将小程序商户号选择改为商户号绑定');
            }
            //网关边界错误单独标记：调用方据此保留支付尝试并标记结果未知
            if ($e instanceof \crmeb\exceptions\PayGatewayException) {
                throw $e;
            }
            throw new \crmeb\exceptions\PayGatewayException($e->getMessage(), [], 0, $e);
        }
    }
}
