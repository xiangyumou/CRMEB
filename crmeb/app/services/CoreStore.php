<?php
namespace app\services;

use crmeb\exceptions\ApiException;

/** Fixed product boundary, independent of stale settings and client versions. */
final class CoreStore
{
    public const DISABLED_CONFIG = [
            'reward_money' => 0, 'reward_integral' => 0,
            'brokerage_func_status' => 0, 'store_brokerage_statu' => 0,
            'member_card_status' => 0, 'member_func_status' => 0,
            'level_status' => 0, 'store_integral_ratio' => 0,
            'member_price_status' => 0, 'brokerage_window_switch' => 0,
            'order_give_integral' => 0, 'order_give_exp' => 0,
            'integral_ratio' => 0, 'integral_max_num' => 0,
            'store_self_mention' => 0, 'offline_pay_status' => 2,
            'ali_pay_status' => 0, 'yue_pay_status' => 0,
            'recharge_switch' => 0, 'routine_contact_type' => 0,
        ];

    public const REMOVED_COMPONENTS = ['bargain', 'seckill', 'pointsMall', 'signIn', 'liveBroadcast', 'homePaidVip', 'home_bargain', 'home_seckill', 'home_paid_vip', 'points_mall', 'sign_in', 'wechat_live'];

    public static function cleanDiy($data)
    {
        return \app\services\diy\DiyCompatibilityServices::clean($data);
    }

    public static function assertPayment($type): void
    {
        if ($type !== 'weixin') {
            throw new ApiException('当前商城仅支持微信支付');
        }
    }

    /**
     * Read-only labels for orders paid before the retired features were removed.
     * Retired pay types are never written or settled again; they only render.
     */
    public const HISTORICAL_PAY_TYPES = [
        'weixin' => '微信支付',
        'yue' => '历史：余额支付',
        'offline' => '历史：线下支付',
        'alipay' => '历史：支付宝支付',
        'allinpay' => '历史：通联支付',
    ];

    public static function historicalPayTypeLabel($type): string
    {
        return self::HISTORICAL_PAY_TYPES[$type] ?? '其他支付';
    }

    public static function assertOrder(array $data): void
    {
        foreach (['seckill_id', 'seckillId', 'bargain_id', 'bargainId', 'useIntegral', 'use_integral', 'store_id', 'storeId'] as $key) {
            if (!empty($data[$key])) {
                throw new ApiException('当前商城不支持该业务');
            }
        }
        foreach (['shipping_type', 'shippingType'] as $key) {
            if (isset($data[$key]) && (string)$data[$key] !== '1') {
                throw new ApiException('当前商城不支持该业务');
            }
        }
        foreach (['payType', 'paytype', 'pay_type'] as $key) {
            if (isset($data[$key]) && $data[$key] !== '') self::assertPayment($data[$key]);
        }
    }

    public static function assertGift(array $data): void
    {
        foreach (['reward_money', 'reward_integral'] as $key) {
            if (isset($data[$key]) && (!is_numeric($data[$key]) || (float)$data[$key] != 0)) {
                throw new ApiException('新人礼包仅支持优惠券奖励');
            }
        }
    }

    public static function assertAdminUser(array $data): void
    {
        foreach (['level', 'agent_level', 'isMember', 'is_promoter', 'money', 'money_status', 'integration', 'integration_status', 'balance', 'integral', 'recharge_count'] as $key) {
            if (!isset($data[$key])) continue;
            $value = $data[$key];
            if (is_array($value) ? count(array_filter($value, static function ($item) { return $item !== '' && $item !== null && $item !== 0 && $item !== '0'; })) > 0 : $value !== '' && $value !== null && $value !== 0 && $value !== '0') {
                throw new ApiException('当前商城不支持该业务');
            }
        }
    }
}
