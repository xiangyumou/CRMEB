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

namespace crmeb\services\easywechat\v3pay;


use crmeb\exceptions\PayException;
use crmeb\services\CacheService;

/**
 * Class Certficates
 * @package crmeb\services\easywechat\v3pay
 */
trait Certficates
{

    /**
     * @param string|null $key
     * @return array|mixed|null
     * @throws \Psr\SimpleCache\InvalidArgumentException
     */
    public function getCertficatescAttr(string $key = null)
    {
        $cacheKey = '_wx_v3' . $this->app['config']['v3_payment']['serial_no'];
        if (CacheService::has($cacheKey)) {
            $res = CacheService::get($cacheKey);
            if ($key && $res) {
                return $res[$key] ?? null;
            } else {
                return $res;
            }
        }
        $certficates = $this->getCertficates();
        CacheService::set($cacheKey, $certficates, 3600 * 24 * 30);
        if ($key && $certficates) {
            return $certficates[$key] ?? null;
        }
        return $certficates;
    }

    /**
     * get certficates.
     *
     * @return array
     */
    public function getCertficates()
    {
        $response = $this->request('v3/certificates', 'GET', [], false);
        if (isset($response['code'])) {
            throw new PayException($response['message']);
        }
        $certificates = $response['data'][0];
        $certificates['certificates'] = $this->decrypt($certificates['encrypt_certificate']);
        unset($certificates['encrypt_certificate']);
        return $certificates;
    }

    /**
     * 平台证书表：serial_no => PEM 证书
     *
     * 微信会同时提供多张平台证书，响应和回调的 Wechatpay-Serial 头指向签发该
     * 消息的那一张。只取第一张会让轮换期的签名校验失败，所以这里把整份列表
     * 按序号缓存下来，校验时按消息携带的序号取对应证书。
     *
     * @return array<string, string>
     * @throws \Psr\SimpleCache\InvalidArgumentException
     */
    public function platformCertificates(): array
    {
        $cacheKey = '_wx_v3_certs_' . ($this->app['config']['v3_payment']['serial_no'] ?? 'default');
        if (CacheService::has($cacheKey)) {
            $cached = CacheService::get($cacheKey);
            if (is_array($cached)) {
                return $cached;
            }
        }
        $response = $this->request('v3/certificates', 'GET', [], false);
        if (!is_array($response) || !isset($response['data']) || !is_array($response['data'])) {
            throw new PayException('获取微信支付平台证书失败');
        }
        $map = [];
        foreach ($response['data'] as $item) {
            if (!isset($item['encrypt_certificate'], $item['serial_no'])) {
                continue;
            }
            $pem = $this->decrypt($item['encrypt_certificate']);
            if (is_string($pem) && $pem !== '') {
                $map[(string)$item['serial_no']] = $pem;
            }
        }
        if (!$map) {
            throw new PayException('微信支付平台证书为空');
        }
        CacheService::set($cacheKey, $map, 3600 * 24 * 30);

        return $map;
    }

    /**
     * 校验一段消息的平台签名
     *
     * 微信 v3 用平台私钥对 "时间戳\n随机串\n报文主体\n" 签名，响应与回调都带
     * Wechatpay-Signature 与 Wechatpay-Serial。校验不过一律视为不可信：调用
     * 方必须按"结果未知"处理，绝不能把未验证的响应当成业务事实。
     *
     * @param string $message 待校验的报文串
     * @param string $signature base64 签名
     * @param string $serial 平台证书序号
     * @return bool
     */
    public function verifySignature(string $message, string $signature, string $serial): bool
    {
        if ($signature === '' || $serial === '') {
            return false;
        }
        try {
            $certificates = $this->platformCertificates();
        } catch (\Throwable $e) {
            return false;
        }
        $pem = $certificates[$serial] ?? '';
        if ($pem === '') {
            return false;
        }
        $publicKey = openssl_pkey_get_public($pem);
        if ($publicKey === false) {
            return false;
        }
        $verified = openssl_verify($message, base64_decode($signature, true) ?: '', $publicKey, OPENSSL_ALGO_SHA256);

        return $verified === 1;
    }
}
