import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * The order group of the typed config.
 *
 * Legacy read these from the 575-key `sys_config` blob
 * (`order_cancel_time`, `order_activity_time`, …) as strings, in hours, parsed
 * at every call site. Here they are one typed group with defaults, so a fresh
 * install boots before anybody has saved the form, and a typo in a key is a
 * compile error rather than `undefined` hours.
 *
 * Every field has a `.default()` — `defineConfigGroup` refuses the group
 * otherwise, because a group must be readable with nothing stored.
 */
export const orderConfig = defineConfigGroup({
  group: 'order',
  title: '订单设置',
  schema: z.object({
    /** How long an order stays in `pending_payment` before the auto-cancel takes it. */
    payWindowMinutes: z.number().int().min(1).max(10_080).default(30),
    /** Orders the expiry sweep takes per pass. The per-order job does the real work. */
    autoCancelSweepLimit: z.number().int().min(1).max(2_000).default(200),
  }),
  ui: {
    payWindowMinutes: {
      label: '未支付订单保留时间（分钟）',
      type: 'number',
      help: '超时后系统自动取消订单并退回库存与优惠券',
      section: '下单',
    },
    autoCancelSweepLimit: {
      label: '超时订单每次清理数量',
      type: 'number',
      help: '兜底扫描每次处理的订单数，正常情况下由单笔延时任务先行取消',
      section: '下单',
    },
  },
  legacyKeys: {
    payWindowMinutes: 'order_cancel_time',
  },
});
