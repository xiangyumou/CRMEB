import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * The fulfilment half of the order settings.
 *
 * A **second** group next to checkout's `order`, rather than more fields inside
 * it: each group is owned by the code that reads it, so the checkout and
 * fulfilment settings change independently. Operators see two sections on the
 * same settings page (下单 / 发货收货).
 */
export const orderFulfilConfig = defineConfigGroup({
  group: 'order-fulfil',
  title: '发货与收货设置',
  schema: z.object({
    /**
     * Days a shipped order waits before the system confirms receipt for the
     * buyer.
     */
    autoReceiveDays: z.number().int().min(1).max(90).default(10),
    /** Orders the auto-receive sweep takes per pass; the delayed job does the real work. */
    autoReceiveSweepLimit: z.number().int().min(1).max(2_000).default(200),
    /**
     * Days a `received` order waits for a review before it becomes `completed`.
     * In days, like every other timer in this group.
     */
    reviewWindowDays: z.number().int().min(0).max(90).default(7),
    completionSweepLimit: z.number().int().min(1).max(2_000).default(200),
    /** Rows one 导出 may produce. Beyond this the answer is truncated and says so. */
    exportMaxRows: z.number().int().min(100).max(20_000).default(2_000),
  }),
  ui: {
    autoReceiveDays: {
      label: '自动确认收货天数',
      type: 'number',
      help: '发货后超过该天数，系统自动确认收货',
      section: '发货收货',
    },
    autoReceiveSweepLimit: {
      label: '自动确认收货每次处理数量',
      type: 'number',
      help: '兜底扫描每次处理的订单数，正常情况下由单笔延时任务先行确认',
      section: '发货收货',
    },
    reviewWindowDays: {
      label: '评价期天数',
      type: 'number',
      help: '确认收货后超过该天数订单变为已完成，填 0 表示确认收货即完成',
      section: '发货收货',
    },
    completionSweepLimit: {
      label: '订单完成每次处理数量',
      type: 'number',
      section: '发货收货',
    },
    exportMaxRows: {
      label: '单次导出最大行数',
      type: 'number',
      help: '超过该行数的导出会被截断，请缩小筛选范围',
      section: '导出',
    },
  },
});

/**
 * Who may open the mobile staff console.
 *
 * Staff are shoppers with a phone, not admins: making this a role would mean
 * inventing a second identity system for shoppers. So it is a list of user ids,
 * typed, and fulfilment registers the `StaffCheck` that `auth: 'staff'`
 * consults against it.
 *
 * The same list is what the notification domain wants for 新订单提醒, which is
 * why the group is named for the people rather than for the console.
 */
export const orderStaffConfig = defineConfigGroup({
  group: 'order-staff',
  title: '店员与订单提醒',
  schema: z.object({
    /** User ids allowed into `/api/v1/staff/*`. Empty means the console is closed to everyone. */
    staffUserIds: z.array(z.number().int().positive()).max(200).default([]),
    /** Whether a staff member may 改价 from the phone. Off by default. */
    allowStaffRepricing: z.boolean().default(false),
    /**
     * Whether a staff member may 同意 / 拒绝 an after-sale from the phone Off
     * by default, like 改价: an approved 仅退款 goes straight to the gateway,
     * so a shop opts in to letting its assistants move money. Reading the
     * after-sales list and adding a note need no switch.
     */
    allowStaffRefundReview: z.boolean().default(false),
  }),
  ui: {
    staffUserIds: {
      label: '店员用户 ID',
      type: 'json',
      help: '可进入移动端商家管理的用户 ID 列表，例如 [12, 34]',
      section: '店员',
    },
    allowStaffRepricing: {
      label: '允许店员改价',
      type: 'switch',
      help: '关闭后店员只能备注和发货，改价仅限后台',
      section: '店员',
    },
    allowStaffRefundReview: {
      label: '允许店员审核售后',
      type: 'switch',
      help: '开启后店员可在移动端同意或拒绝售后申请；同意仅退款会直接原路退款。确认收货和重试仍仅限后台',
      section: '店员',
    },
  },
});
