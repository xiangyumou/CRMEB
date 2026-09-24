import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * 订单设置 — the order group.
 *
 * One typed group with defaults rather than strings in hours or 元 parsed at
 * every call site, so a fresh install boots before anybody has saved the form,
 * and a typo in a key is a compile error rather than `undefined` hours.
 *
 * Every field has a `.default()` — `defineConfigGroup` refuses the group
 * otherwise, because a group must be readable with nothing stored.
 *
 * ## Where the other order settings live
 *
 * Each setting lives with the domain that reads it, and exactly once: two
 * fields writing one timer is worse than either name.
 *
 * | Setting                   | Field                                            |
 * | ------------------------- | ------------------------------------------------ |
 * | auto-receive timer        | `order-fulfil.autoReceiveDays`                   |
 * | review window             | `order-fulfil.reviewWindowDays`                  |
 * | auto-review text          | `catalog.autoReviewContent`                      |
 * | stock warning threshold   | `catalog.stockWarningThreshold`                  |
 * | return contact            | `refund.returnName/Phone/Address`                |
 * | refund reasons            | `refund`'s built-in list                         |
 * | new-order notice          | the per-template notification switches          |
 * | 满额包邮                  | `freeShippingThreshold`, here                    |
 */
export const orderConfig = defineConfigGroup({
  group: 'order',
  title: '订单设置',
  description: '未支付订单保留时间、超时清理与满额包邮。',
  category: 'trade',
  schema: z.object({
    /** How long an order stays in `pending_payment` before the auto-cancel takes it. */
    payWindowMinutes: z.number().int().min(1).max(10_080).default(30),
    /** Orders the expiry sweep takes per pass. The per-order job does the real work. */
    autoCancelSweepLimit: z.number().int().min(1).max(2_000).default(200),

    /**
     * 满额包邮, in 元 — the goods total at or above which the whole order ships
     * free, fixed-postage lines included. `0` disables it.
     *
     * Read by the shipping domain's `FreightPort`, which is the only place that
     * can see the whole order: checkout cannot zero a fixed-postage line it has
     * already been quoted for.
     */
    freeShippingThreshold: z.number().int().min(0).default(0),
  }),
  ui: {
    payWindowMinutes: {
      label: '未支付订单保留时间',
      type: 'number',
      unit: 'minutes',
      help: '超时后系统自动取消订单并退回库存与优惠券',
      section: '下单',
    },
    autoCancelSweepLimit: {
      label: '超时订单每次清理数量',
      type: 'number',
      help: '兜底扫描每次处理的订单数，正常情况下由单笔延时任务先行取消',
      section: '下单',
    },
    freeShippingThreshold: {
      label: '满额包邮（元）',
      type: 'number',
      help: '订单商品金额达到该值时免运费，固定运费的商品也一并免除；0 表示不启用',
      section: '阈值',
    },
  },
});
