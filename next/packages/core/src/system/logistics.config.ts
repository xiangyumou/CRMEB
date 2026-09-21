import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `logistics` — express tracking.
 *
 * Legacy source: `eb_system_config` tab 64 (物流查询配置) and 66 (电子面单配置).
 * Read by F2 (shipping) and B2 (fulfilment).
 *
 * 电子面单 (printed waybills) went through 一号通, which is out of scope, so what
 * is left is the tracking query and the default waybill contact — the latter is
 * still worth storing because it is what a shop prints on a return label.
 */
export const logisticsConfig = defineConfigGroup({
  group: 'logistics',
  title: '物流设置',
  permission: 'system:config:read',
  schema: z.object({
    /** `none` disables the 物流跟踪 tab rather than showing an empty one. */
    provider: z.enum(['none', 'aliyun-market', 'kuaidi100']).default('none'),
    /** Aliyun 云市场 appcode, or the kuaidi100 key. */
    appCode: z.string().max(128).default(''),
    customer: z.string().max(128).default(''),
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
        { label: '快递100', value: 'kuaidi100' },
      ],
      order: 1,
    },
    appCode: { label: '查询密钥', type: 'password', secret: true, order: 2 },
    customer: { label: '客户编号', type: 'text', help: '快递100 需要', order: 3 },
    cacheMinutes: { label: '查询结果缓存（分钟）', type: 'number', order: 4 },
    senderName: { label: '发件人', type: 'text', section: '发件信息', order: 10 },
    senderPhone: { label: '发件电话', type: 'text', section: '发件信息', order: 11 },
    senderAddress: { label: '发件地址', type: 'text', section: '发件信息', order: 12 },
  },
  legacyKeys: {
    provider: 'logistics_type',
    appCode: 'system_express_app_code',
    senderName: 'config_export_to_name',
    senderPhone: 'config_export_to_tel',
    senderAddress: 'config_export_to_address',
  },
});
