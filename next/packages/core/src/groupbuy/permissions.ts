import { definePermissions } from '../auth/permissions';

/**
 * Group-buy permission atoms.
 *
 * `group:complete` is separate from `group:read` and from `activity:write` on
 * purpose: 立即成团 invents buyers, and inventing buyers is a different kind of
 * act from editing a campaign or looking at one. Legacy had no permission for
 * it at all — `virtualCombination($pinkId, $operator)` took the operator's name
 * as a *string argument* and any admin with the 拼团 menu could press it.
 *
 * The atom string is `groupbuy:<resource>:<action>`; `definePermissions` adds
 * the domain prefix, so the keys here omit it.
 */
export const groupbuyPermissions = definePermissions(
  'groupbuy',
  {
    'activity:read': '查看拼团活动',
    'activity:write': '新建/编辑拼团活动',
    'activity:delete': '删除拼团活动',
    'group:read': '查看拼团与拼团订单',
    'group:complete': '虚拟成团（立即成团）',
  },
  { section: '营销' },
);
