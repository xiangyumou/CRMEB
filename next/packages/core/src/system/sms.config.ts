import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';
import { defineConfigFieldExtras } from './config-ui-extras';

/**
 * `sms` — the SMS provider.
 *
 * Legacy source: `eb_system_config` tabs 18 / 96 / 97 / 98 / 99. The old system
 * routed SMS through 一号通 (`sms_account` + `sms_token`), which is out of scope
 * — so the provider list here is the two direct ones CRMEB also supported,
 * Aliyun and Tencent Cloud, plus `none`, which is the default and makes the
 * shop work without any SMS account at all.
 *
 * E1 reads this group when sending a verification code.
 */
export const smsConfig = defineConfigGroup({
  group: 'sms',
  title: '短信设置',
  permission: 'system:config:read',
  schema: z.object({
    provider: z.enum(['none', 'aliyun', 'tencent']).default('none'),

    aliyunAccessKeyId: z.string().max(128).default(''),
    aliyunAccessKeySecret: z.string().max(128).default(''),
    aliyunRegionId: z.string().max(32).default('cn-hangzhou'),
    aliyunSignName: z.string().max(64).default(''),

    tencentAppId: z.string().max(64).default(''),
    tencentSecretId: z.string().max(128).default(''),
    tencentSecretKey: z.string().max(128).default(''),
    tencentSignName: z.string().max(64).default(''),
    tencentRegion: z.string().max(32).default('ap-guangzhou'),

    /** Template ids, keyed by the event that sends them. */
    templateVerifyCode: z.string().max(64).default(''),
    templateOrderPaid: z.string().max(64).default(''),
    templateOrderShipped: z.string().max(64).default(''),

    /** Per-phone budget, enforced by `rate-limit.ts` at the send site. */
    perPhonePerHour: z.number().int().min(1).max(50).default(5),
    perPhonePerDay: z.number().int().min(1).max(200).default(20),
  }),
  ui: {
    provider: {
      label: '短信服务商',
      type: 'select',
      options: [
        { label: '不启用', value: 'none' },
        { label: '阿里云', value: 'aliyun' },
        { label: '腾讯云', value: 'tencent' },
      ],
      order: 1,
    },
    aliyunAccessKeyId: { label: 'AccessKeyId', type: 'text', section: '阿里云', order: 10 },
    aliyunAccessKeySecret: {
      label: 'AccessKeySecret',
      type: 'password',
      secret: true,
      section: '阿里云',
      order: 11,
    },
    aliyunRegionId: { label: 'RegionId', type: 'text', section: '阿里云', order: 12 },
    aliyunSignName: { label: '短信签名', type: 'text', section: '阿里云', order: 13 },

    tencentAppId: { label: 'SdkAppId', type: 'text', section: '腾讯云', order: 20 },
    tencentSecretId: { label: 'SecretId', type: 'text', section: '腾讯云', order: 21 },
    tencentSecretKey: {
      label: 'SecretKey',
      type: 'password',
      secret: true,
      section: '腾讯云',
      order: 22,
    },
    tencentSignName: { label: '短信签名', type: 'text', section: '腾讯云', order: 23 },
    tencentRegion: { label: '地域', type: 'text', section: '腾讯云', order: 24 },

    templateVerifyCode: { label: '验证码模板 ID', type: 'text', section: '模板', order: 30 },
    templateOrderPaid: { label: '支付成功模板 ID', type: 'text', section: '模板', order: 31 },
    templateOrderShipped: { label: '发货提醒模板 ID', type: 'text', section: '模板', order: 32 },

    perPhonePerHour: { label: '每号码每小时上限', type: 'number', section: '频率', order: 40 },
    perPhonePerDay: { label: '每号码每天上限', type: 'number', section: '频率', order: 41 },
  },
  legacyKeys: {
    provider: 'sms_type',
    aliyunAccessKeyId: 'aliyun_AccessKeyId',
    aliyunAccessKeySecret: 'aliyun_AccessKeySecret',
    aliyunRegionId: 'aliyun_RegionId',
    aliyunSignName: 'aliyun_SignName',
    tencentAppId: 'tencent_sms_app_id',
    tencentSecretId: 'tencent_sms_secret_id',
    tencentSecretKey: 'tencent_sms_secret_key',
    tencentSignName: 'tencent_sms_sign_name',
    tencentRegion: 'tencent_sms_region',
  },
});

const ALIYUN = { key: 'provider', equals: 'aliyun' } as const;
const TENCENT = { key: 'provider', equals: 'tencent' } as const;

defineConfigFieldExtras('sms', {
  aliyunAccessKeyId: { visibleWhen: ALIYUN },
  aliyunAccessKeySecret: { visibleWhen: ALIYUN },
  aliyunRegionId: { visibleWhen: ALIYUN },
  aliyunSignName: { visibleWhen: ALIYUN },
  tencentAppId: { visibleWhen: TENCENT },
  tencentSecretId: { visibleWhen: TENCENT },
  tencentSecretKey: { visibleWhen: TENCENT },
  tencentSignName: { visibleWhen: TENCENT },
  tencentRegion: { visibleWhen: TENCENT },
});
