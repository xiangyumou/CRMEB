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
 * 结果是标准结构而不是一个裸字符串：状态、交易号（以本次查询为准，不再沿用
 * 落库时的旧值）、金额、驱动与商户身份都在其中，调用方据此完成本地确认或在
 * 身份不匹配时停下来走人工处理。
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
     * 确认一条支付尝试对应的网关支付单的真实状态
     *
     * @param array $attempt 支付尝试记录
     * @return array{state:string,trade_no:string,total_fee:string,driver:string,mch_id:string,app_id:string,out_trade_no:string,identity_mismatch:bool,not_exist:bool}
     */
    public function settleResult(array $attempt): array
    {
        $result = [
            'state' => self::STATE_UNKNOWN,
            'trade_no' => (string)($attempt['trade_no'] ?? ''),
            'total_fee' => (string)($attempt['total_fee'] ?? ''),
            'driver' => (string)($attempt['driver'] ?? ''),
            'mch_id' => (string)($attempt['mch_id'] ?? ''),
            'app_id' => (string)($attempt['app_id'] ?? ''),
            'out_trade_no' => (string)($attempt['out_trade_no'] ?? ''),
            'identity_mismatch' => false,
            'not_exist' => false,
        ];
        $driver = $result['driver'];
        $outTradeNo = $result['out_trade_no'];
        if ($driver === '' || $outTradeNo === '') {
            return $result;
        }
        if (!$this->identityMatches($attempt)) {
            //当前配置与落库时的商户/应用身份对不上：不猜测，交给人工核对
            $result['identity_mismatch'] = true;
            return $result;
        }
        $pay = $this->resolve($driver);
        if (!$pay) {
            return $result;
        }
        $options = $this->options($attempt);
        $query = $pay->queryOrder($outTradeNo, $options);
        $state = is_array($query) ? (string)($query['state'] ?? '') : '';
        switch ($state) {
            case 'paid':
                $result['state'] = self::STATE_PAID;
                $result['trade_no'] = (string)($query['trade_no'] ?? $result['trade_no']);
                return $result;
            case 'closed':
                $result['state'] = self::STATE_CLOSED;
                return $result;
            case 'not_exist':
                //本地曾发起过创建请求，但网关暂时查无此单。这不能证明这笔钱
                //永远不会生效：保持待核对状态，不据此释放任何资源。
                $result['not_exist'] = true;
                return $result;
            case 'open':
                break;
            default:
                return $result;
        }
        // 仍然可以支付，先关单，再复查一次
        if ($pay->closeOrder($outTradeNo, $options)) {
            $result['state'] = self::STATE_CLOSED;
            return $result;
        }
        $again = $pay->queryOrder($outTradeNo, $options);
        $againState = is_array($again) ? (string)($again['state'] ?? '') : '';
        if ($againState === 'closed') {
            $result['state'] = self::STATE_CLOSED;
            return $result;
        }
        if ($againState === 'paid') {
            $result['state'] = self::STATE_PAID;
            $result['trade_no'] = (string)($again['trade_no'] ?? $result['trade_no']);
            return $result;
        }
        return $result;
    }

    /**
     * 确认一条支付尝试对应的网关支付单已经不可能再收款
     *
     * 兼容旧调用：只要状态字符串的调用方继续可用。新代码应使用 settleResult()
     * 拿到交易号与商户身份等完整事实。
     *
     * @param array $attempt 支付尝试记录
     * @return string paid | closed | unknown
     */
    public function settleAttempt(array $attempt): string
    {
        return $this->settleResult($attempt)['state'];
    }

    /**
     * 从尝试记录还原驱动需要的支付上下文
     * @param array $attempt
     * @return array
     */
    public function options(array $attempt): array
    {
        $context = json_decode((string)($attempt['payment_context'] ?? ''), true);
        $newMiniOpen = is_array($context) && array_key_exists('pay_new_weixin_open', $context)
            ? (bool)$context['pay_new_weixin_open']
            : (bool)sys_config('pay_new_weixin_open');
        return [
            'is_channel' => (int)($attempt['channel'] ?? 0),
            'pay_new_weixin_open' => $newMiniOpen,
        ];
    }

    /**
     * 落库的商户/应用身份是否仍然属于当前配置
     *
     * 与回调侧 NotifyListener::merchantMatches 的口径一致：记录值命中当前
     * 配置的任一商户号/应用号即算匹配；历史记录没有身份信息的放行。
     *
     * @param array $attempt
     * @return bool
     */
    public function identityMatches(array $attempt): bool
    {
        $recordedMch = trim((string)($attempt['mch_id'] ?? ''));
        $recordedApp = trim((string)($attempt['app_id'] ?? ''));
        if ($recordedMch === '' && $recordedApp === '') {
            return true;
        }
        $identity = $this->currentIdentity();
        $mchOk = $recordedMch === '' || in_array($recordedMch, $identity['mch_ids'], true);
        $appOk = $recordedApp === '' || in_array($recordedApp, $identity['app_ids'], true);
        return $mchOk && $appOk;
    }

    /**
     * 当前配置下的商户号与应用号集合
     * @return array{mch_ids:string[],app_ids:string[]}
     */
    public function currentIdentity(): array
    {
        $mchIds = [];
        foreach (['pay_weixin_mchid', 'pay_sub_merchant_id'] as $key) {
            $value = trim((string)sys_config($key));
            if ($value !== '') {
                $mchIds[] = $value;
            }
        }
        if (sys_config('pay_new_weixin_open')) {
            $value = trim((string)sys_config('pay_new_weixin_mchid'));
            if ($value !== '') {
                $mchIds[] = $value;
            }
        }
        $appIds = [];
        foreach (['wechat_appid', 'routine_appId', 'wechat_app_appid'] as $key) {
            $value = trim((string)sys_config($key));
            if ($value !== '') {
                $appIds[] = $value;
            }
        }

        return ['mch_ids' => $mchIds, 'app_ids' => $appIds];
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
