import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `trade` — the after-sale timers, thresholds and rosters the order flow reads.
 *
 * Owned by this stream because nothing else owns a settings screen, but the
 * values belong to B1/B2: they read them with `ctx.config.get(tradeConfig)`.
 *
 * **Not the pay window.** This group was called `order` until B1's
 * `core/src/order/order.config.ts` landed on `rewrite/integration` holding the
 * same group name; the domain that owns the timer owns the group, so
 * `payWindowMinutes` (and the `order_cancel_time` legacy key, hours → minutes)
 * lives there and this group keeps what no domain claimed. CR-6-f1 asks the
 * orchestrator whether the two should be folded together behind one screen.
 *
 * `0` means "never" for both timers, which is also what the legacy `0` meant,
 * so no data migration surprise there.
 */
export const tradeConfig = defineConfigGroup({
  group: 'trade',
  title: '交易设置',
  permission: 'system:config:read',
  schema: z.object({
    /** Days after shipping before delivery is auto-confirmed. 0 disables it. */
    autoReceiveDays: z.number().int().min(0).max(90).default(10),
    /** Days after delivery before an unwritten review is auto-filled. 0 disables it. */
    autoReviewDays: z.number().int().min(0).max(90).default(7),
    /** Text of the auto-filled review. */
    autoReviewContent: z.string().max(255).default('用户未及时评价，系统默认好评'),

    /** Stock at or below this raises the warning badge. */
    stockWarningThreshold: z.number().int().min(0).max(1_000_000).default(10),
    /** Order subtotal at or above this ships free. */
    freeShippingThreshold: z.number().int().min(0).default(0),

    /** Reasons offered in the refund dialog, one per line. */
    refundReasons: z
      .string()
      .max(2000)
      .default('收货地址填错了\n与描述不符\n信息填错了，重新拍\n收到商品损坏'),
    /** Where returns are sent. Shown to the shopper after a refund is approved. */
    refundContactName: z.string().max(64).default(''),
    refundContactPhone: z.string().max(32).default(''),
    refundAddress: z.string().max(255).default(''),

    /**
     * User ids allowed into the mobile order console (老系统的「订单通知」
     * 管理员). Kept as ids, not accounts: an account can be renamed.
     */
    staffUserIds: z.array(z.number().int().positive()).max(200).default([]),
    /** Whether the console notifies on a new order at all. */
    notifyOnNewOrder: z.boolean().default(true),
  }),
  ui: {
    autoReceiveDays: {
      label: '发货后自动收货（天）',
      type: 'number',
      section: '自动处理',
      help: '0 表示不自动收货',
      order: 2,
    },
    autoReviewDays: {
      label: '收货后自动评价（天）',
      type: 'number',
      section: '自动处理',
      help: '0 表示不自动评价',
      order: 3,
    },
    autoReviewContent: { label: '自动评价内容', type: 'text', section: '自动处理', order: 4 },

    stockWarningThreshold: { label: '警戒库存', type: 'number', section: '阈值', order: 10 },
    freeShippingThreshold: {
      label: '满额包邮（元）',
      type: 'number',
      section: '阈值',
      help: '0 表示不启用满额包邮',
      order: 11,
    },

    refundReasons: {
      label: '退款理由',
      type: 'textarea',
      section: '售后',
      help: '每行一条',
      order: 20,
    },
    refundContactName: { label: '退货联系人', type: 'text', section: '售后', order: 21 },
    refundContactPhone: { label: '退货联系电话', type: 'text', section: '售后', order: 22 },
    refundAddress: { label: '退货地址', type: 'text', section: '售后', order: 23 },

    staffUserIds: {
      label: '订单通知用户 ID',
      type: 'json',
      section: '移动端订单台',
      help: '可进入移动端订单管理的用户 ID 列表，如 [12, 34]',
      order: 30,
    },
    notifyOnNewOrder: { label: '新订单提醒', type: 'switch', section: '移动端订单台', order: 31 },
  },
  legacyKeys: {
    // `order_cancel_time` is deliberately absent: B1's `order` group claims it.
    autoReceiveDays: 'system_delivery_time',
    autoReviewDays: 'system_comment_time',
    autoReviewContent: 'comment_content',
    stockWarningThreshold: 'store_stock',
    freeShippingThreshold: 'store_free_postage',
    refundReasons: 'stor_reason',
    refundContactName: 'refund_name',
    refundContactPhone: 'refund_phone',
    refundAddress: 'refund_address',
    staffUserIds: 'order_notice_admin_uids',
    notifyOnNewOrder: 'lower_order_switch',
  },
});
