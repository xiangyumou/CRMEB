import { definePermissions } from '../auth/permissions';

/**
 * Refund permission atoms.
 *
 * `review` and `execute` are separate because they are different decisions:
 * approving a request says "yes, this customer is owed money", while executing
 * one sends it. In a shop where customer service approves and finance pays,
 * that boundary is the control; in a small shop one role holds both, which is a
 * grant, not a code change.
 */
export const refundPermissions = definePermissions(
  'refund',
  {
    'request:read': '查看售后单',
    'request:review': '审核售后单（同意/拒绝）',
    'request:execute': '执行退款（收货/重试）',
    'request:write': '备注售后单',
  },
  { section: '交易' },
);
