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

namespace app\services\pay;

use crmeb\services\pay\Pay;
use think\facade\Log;

/**
 * 支付单在网关侧的状态确认
 *
 * 取消订单会释放库存和优惠券，释放之前必须确认网关侧已经没有可支付的单子。
 * 任何无法确认的结果（网络异常、响应无法识别、驱动不支持查单）都要返回
 * unknown，由调用方保留资源并稍后重试。
 *
 * Class PayTradeServices
 * @package app\services\pay
 */
class PayTradeServices
{
    /** 网关侧已收款 */
    const STATE_PAID = 'paid';
    /** 网关侧已关闭或从未存在，可以安全释放资源 */
    const STATE_CLOSED = 'closed';
    /** 无法确认，必须保留资源 */
    const STATE_UNKNOWN = 'unknown';

    /**
     * 确认一条支付尝试对应的网关支付单已经不可能再收款
     *
     * @param array $attempt 支付尝试记录
     * @return string paid | closed | unknown
     */
    public function settleAttempt(array $attempt): string
    {
        $driver = trim((string)($attempt['driver'] ?? ''));
        $outTradeNo = trim((string)($attempt['out_trade_no'] ?? ''));
        if ($driver === '' || $outTradeNo === '') {
            return self::STATE_UNKNOWN;
        }
        $pay = $this->resolve($driver);
        if (!$pay) {
            return self::STATE_UNKNOWN;
        }
        $options = $this->options($attempt);
        $query = $pay->queryOrder($outTradeNo, $options);
        $state = is_array($query) ? (string)($query['state'] ?? '') : '';
        switch ($state) {
            case 'paid':
                return self::STATE_PAID;
            case 'closed':
            case 'not_exist':
                return self::STATE_CLOSED;
            case 'open':
                break;
            default:
                return self::STATE_UNKNOWN;
        }
        // 仍然可以支付，先关单，再复查一次
        if ($pay->closeOrder($outTradeNo, $options)) {
            return self::STATE_CLOSED;
        }
        $again = $pay->queryOrder($outTradeNo, $options);
        $againState = is_array($again) ? (string)($again['state'] ?? '') : '';
        if (in_array($againState, ['closed', 'not_exist'], true)) {
            return self::STATE_CLOSED;
        }
        if ($againState === 'paid') {
            return self::STATE_PAID;
        }
        return self::STATE_UNKNOWN;
    }

    /**
     * 从尝试记录还原驱动需要的支付上下文
     * @param array $attempt
     * @return array
     */
    public function options(array $attempt): array
    {
        return [
            'is_channel' => (int)($attempt['channel'] ?? 0),
            'pay_new_weixin_open' => (bool)sys_config('pay_new_weixin_open'),
        ];
    }

    /**
     * 解析支付驱动
     * @param string $driver
     * @return Pay|null
     */
    private function resolve(string $driver)
    {
        try {
            return app()->make(Pay::class, [$driver]);
        } catch (\Throwable $e) {
            Log::error('支付驱动加载失败:' . $e->getMessage(), ['driver' => $driver]);
            return null;
        }
    }
}
