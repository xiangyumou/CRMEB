import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * 订单设置 — the single order group (CR-6-f1, option 1).
 *
 * Legacy read these from the 575-key `sys_config` blob
 * (`order_cancel_time`, `store_free_postage`, …) as strings, in hours or 元,
 * parsed at every call site. Here they are one typed group with defaults, so a
 * fresh install boots before anybody has saved the form, and a typo in a key is
 * a compile error rather than `undefined` hours.
 *
 * Every field has a `.default()` — `defineConfigGroup` refuses the group
 * otherwise, because a group must be readable with nothing stored.
 *
 * ## What the fold actually moved
 *
 * F1's `trade` group (交易设置) is deleted. It was created when no domain owned
 * a settings screen for the after-sale timers and thresholds; by the time
 * CR-6-f1 was decided, **every field in it but one had an owner that reads it**,
 * and the CR's own argument — "two fields writing one timer is worse than
 * either name" — says to delete the duplicate rather than carry it onto this
 * screen:
 *
 * | `trade` field                  | where it lives now                                  |
 * | ------------------------------ | --------------------------------------------------- |
 * | `autoReceiveDays`              | `order-fulfil.autoReceiveDays` (same legacy key)      |
 * | `autoReviewDays`               | `order-fulfil.reviewWindowDays` (same legacy key)     |
 * | `autoReviewContent`            | `catalog.autoReviewContent` (the auto-review writer)  |
 * | `stockWarningThreshold`        | `catalog.stockWarningThreshold` (same legacy key)     |
 * | `refundContactName/Phone/…`    | `refund.returnName/Phone/Address`                     |
 * | `staffUserIds`                 | `order-staff.staffUserIds` (same legacy key)          |
 * | `refundReasons`                | retired — `refund`'s built-in list                    |
 * | `notifyOnNewOrder`             | retired — per-template notification switches          |
 * | **`freeShippingThreshold`**    | **here**, the one field nobody else claimed           |
 *
 * `catalog.autoReviewContent` and `refund.return*` claimed legacy keys that do
 * not exist in `crmeb.sql` (`product_replay_content`, `site_refund_*`) while
 * `trade` held the real ones, so the fold moved `comment_content` and
 * `refund_name` / `refund_phone` / `refund_address` onto those fields as their
 * first alias. Without that the values an operator had configured would have
 * vanished at cutover and the ETL would have failed on an unmapped key.
 * `stor_reason` and `lower_order_switch` have no successor and are on the
 * drop list with their reason.
 */
export const orderConfig = defineConfigGroup({
  group: 'order',
  title: '订单设置',
  schema: z.object({
    /** How long an order stays in `pending_payment` before the auto-cancel takes it. */
    payWindowMinutes: z.number().int().min(1).max(10_080).default(30),
    /** Orders the expiry sweep takes per pass. The per-order job does the real work. */
    autoCancelSweepLimit: z.number().int().min(1).max(2_000).default(200),

    /**
     * 满额包邮, in 元 — the goods total at or above which the whole order ships
     * free, fixed-postage lines included. `0` disables it, which is also what
     * the legacy `0` meant, so there is no migration surprise.
     *
     * Read by F2's `FreightPort`, which is the only place that can see the
     * whole order: checkout cannot zero a fixed-postage line it has already
     * been quoted for.
     */
    freeShippingThreshold: z.number().int().min(0).default(0),
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
    freeShippingThreshold: {
      label: '满额包邮（元）',
      type: 'number',
      help: '订单商品金额达到该值时免运费，固定运费的商品也一并免除；0 表示不启用',
      section: '阈值',
    },
  },
});
