import { definePermissions } from '../auth/permissions';

/**
 * Order permission atoms.
 *
 * Seven, and each one is a job somebody in a shop actually does rather than a
 * CRUD verb:
 *
 *  - support looks orders up (`order:read`) and writes what the customer said
 *    (`order:write` — remark, price before payment, a corrected address);
 *  - the warehouse ships (`shipment:write`) and nothing else;
 *  - finance issues invoices (`invoice:*`) and reads the numbers
 *    (`stats:read`), and exporting is its own atom because a CSV of every
 *    buyer's name and phone number leaves the building;
 *  - only a manager files an order away (`order:delete`).
 *
 * `order:order:write` deliberately covers all three console edits: an operator
 * trusted to change a shipping address is trusted to leave a remark, and three
 * atoms here would be three checkboxes nobody could tell apart. Shipping is
 * split out because "may dispatch goods" is a real, different job.
 *
 * The storefront's own order actions (创建, 取消, 确认收货) have no atom at all:
 * they are `auth: 'user'` and the owner check is the authorisation.
 */
export const orderPermissions = definePermissions(
  'order',
  {
    'order:read': '查看订单',
    'order:write': '订单备注/改价/修改地址',
    'order:delete': '删除订单',
    'order:export': '导出订单',
    'shipment:write': '订单发货与撤销发货',
    'invoice:read': '查看发票申请',
    'invoice:write': '开票与驳回',
    'stats:read': '查看订单统计',
  },
  { section: '订单' },
);
