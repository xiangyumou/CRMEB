import { z } from 'zod';
import { defineConfigGroup, type ConfigVisibleWhen } from '../kernel/config-registry';

/** `none` means no tracking at all, so the credentials have nothing to say. */
const TRACKING_ON: ConfigVisibleWhen = { key: 'provider', equals: 'aliyun-market' };

/**
 * `logistics` — express tracking.
 *
 * Legacy source: `eb_system_config` tab 64 (物流查询配置) and 66 (电子面单配置).
 * Read by F2 (shipping) and B2 (fulfilment).
 *
 * 电子面单 (printed waybills) went through 一号通, which is out of scope, so what
 * is left is the tracking query and the default waybill contact — the latter is
 * still worth storing because it is what a shop prints on a return label.
 *
 * **One provider, 阿里云云市场** (CR-2-f2). The group offered 快递100 as well and
 * nothing implemented it: F2 owns the driver, only the market API is in scope,
 * and the seeded 1101 carrier codes are the market API's. A setting that looks
 * supported and silently answers nothing is worse than no setting, so the
 * option, its `customer` field and F2's warn-and-treat-as-`none` branch are all
 * gone. No legacy value maps to it either — `logistics_type` carries `1`
 * (aliyun) — which `packages/etl/src/config.test.ts` pins.
 */
export const logisticsConfig = defineConfigGroup({
  group: 'logistics',
  title: '物流设置',
  permission: 'system:config:read',
  schema: z.object({
    /** `none` disables the 物流跟踪 tab rather than showing an empty one. */
    provider: z.enum(['none', 'aliyun-market']).default('none'),
    /** Aliyun 云市场 appcode. */
    appCode: z.string().max(128).default(''),
    /** How long a tracking result may be reused. Carriers rate-limit hard. */
    cacheMinutes: z.number().int().min(1).max(1440).default(30),

    senderName: z.string().max(64).default(''),
    senderPhone: z.string().max(32).default(''),
    senderAddress: z.string().max(255).default(''),
  }),
  ui: {
    provider: {
      label: '物流查询服务',
      type: 'select',
      options: [
        { label: '不启用', value: 'none' },
        { label: '阿里云云市场', value: 'aliyun-market' },
      ],
      order: 1,
    },
    appCode: {
      label: '查询密钥',
      type: 'password',
      secret: true,
      visibleWhen: TRACKING_ON,
      order: 2,
    },
    cacheMinutes: {
      label: '查询结果缓存（分钟）',
      type: 'number',
      visibleWhen: TRACKING_ON,
      order: 4,
    },
    senderName: { label: '发件人', type: 'text', section: '发件信息', order: 10 },
    senderPhone: { label: '发件电话', type: 'text', section: '发件信息', order: 11 },
    senderAddress: { label: '发件地址', type: 'text', section: '发件信息', order: 12 },
  },
});
