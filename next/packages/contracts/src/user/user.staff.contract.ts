import { z } from 'zod';
import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  pagedStaffUsers,
  staffUserDetail,
  staffUserGroupBody,
  staffUserGroups,
  staffUserLabelBody,
  staffUserLabels,
  staffUserLabelsExample,
  staffUserListItemExample,
  staffUserListQuery,
} from './schemas';

/**
 * 商家管理 → 用户, the six calls behind `pages/admin/user/**`.
 *
 * The order and 售后 tabs of the same screen are the order domain's
 * `/api/v1/staff/*` routes. The reason these are separate routes rather than
 * the console's is the session, not the data: a 店员 signs in as an ordinary
 * shopper and gets the console only through the staff list, so there is no
 * admin cookie to present at `/admin-api/users` and no permission atom to
 * check. `auth: 'staff'` is the whole check — the order domain's `StaffCheck`
 * reads the `orderStaff` config group — exactly as on `/api/v1/staff/orders`.
 *
 * **These are not the console's routes with a different door.** The response
 * shapes are narrower by design; `staffUserListItem` in `./schemas.ts` carries
 * the field-by-field reasoning. The two things that follow from it and are
 * enforced here:
 *
 * - there is no unmasked phone on any of the six, not even on the detail
 *   route, where the console does hand one out;
 * - there is no write beyond 分组 and 标签 — no 启用/禁用, no password reset, no
 *   remark, no address book. A 店员 can describe a customer; they cannot act on
 *   the account.
 *
 * The two writes name an audit target the way `/api/v1/staff/orders/:id/remark`
 * does, even though `handle()` currently writes a row only for an admin actor
 * on the `/admin-api` surface. The call costs nothing and the target is the
 * only part a handler can supply; the day staff writes are recorded, these
 * routes are already carrying the information rather than needing to be found
 * again.
 */

export const staffUserList = defineRoute({
  id: 'user.staffList',
  method: 'GET',
  path: '/api/v1/staff/users',
  auth: 'staff',
  summary: '店员用户列表',
  tags: ['user'],
  query: staffUserListQuery,
  response: pagedStaffUsers,
  examples: [
    {
      name: 'ok',
      query: { page: 1, pageSize: 20 },
      response: { items: [staffUserListItemExample], total: 1, page: 1, pageSize: 20 },
    },
    {
      name: 'by-phone',
      query: { page: 1, pageSize: 20, keyword: '13800138000', groupId: '3' },
      response: { items: [staffUserListItemExample], total: 1, page: 1, pageSize: 20 },
    },
  ],
});

export const staffUserDetailRoute = defineRoute({
  id: 'user.staffDetail',
  method: 'GET',
  path: '/api/v1/staff/users/:uid',
  auth: 'staff',
  summary: '店员用户详情',
  tags: ['user'],
  params: z.object({ uid: id }),
  response: staffUserDetail,
  errors: ['USER_NOT_FOUND'],
  examples: [{ name: 'ok', params: { uid: '1001' }, response: staffUserListItemExample }],
});

/**
 * The 分组 picker's options.
 *
 * Unpaginated on purpose: a shop has a handful of customer groups, the picker
 * has no "load more", and a paginated answer whose second page nobody fetches
 * is a picker that silently cannot reach the last group.
 */
export const staffUserGroupList = defineRoute({
  id: 'user.staffGroupList',
  method: 'GET',
  path: '/api/v1/staff/user-groups',
  auth: 'staff',
  summary: '店员可用的用户分组',
  tags: ['user'],
  response: staffUserGroups,
  examples: [
    {
      name: 'ok',
      response: {
        items: [
          { id: '3', name: '高价值客户' },
          { id: '4', name: '新客' },
        ],
      },
    },
  ],
});

export const staffUserSetGroup = defineRoute({
  id: 'user.staffSetGroup',
  method: 'POST',
  path: '/api/v1/staff/users/:uid/group',
  auth: 'staff',
  summary: '店员设置用户分组',
  tags: ['user'],
  params: z.object({ uid: id }),
  body: staffUserGroupBody,
  response: staffUserDetail,
  errors: ['USER_NOT_FOUND', 'USER_GROUP_NOT_FOUND'],
  examples: [
    {
      name: 'ok',
      params: { uid: '1001' },
      body: { groupId: '3' },
      response: staffUserListItemExample,
    },
    {
      name: 'clear',
      params: { uid: '1001' },
      body: { groupId: null },
      response: { ...staffUserListItemExample, groups: [] },
    },
  ],
});

export const staffUserLabelList = defineRoute({
  id: 'user.staffLabelList',
  method: 'GET',
  path: '/api/v1/staff/users/:uid/labels',
  auth: 'staff',
  summary: '店员查看用户标签',
  tags: ['user'],
  params: z.object({ uid: id }),
  response: staffUserLabels,
  errors: ['USER_NOT_FOUND'],
  examples: [{ name: 'ok', params: { uid: '1001' }, response: staffUserLabelsExample }],
});

export const staffUserSetLabels = defineRoute({
  id: 'user.staffSetLabels',
  method: 'POST',
  path: '/api/v1/staff/users/:uid/labels',
  auth: 'staff',
  summary: '店员设置用户标签',
  tags: ['user'],
  params: z.object({ uid: id }),
  body: staffUserLabelBody,
  response: staffUserDetail,
  errors: ['USER_NOT_FOUND', 'USER_LABEL_NOT_FOUND'],
  examples: [
    {
      name: 'ok',
      params: { uid: '1001' },
      body: { labelIds: ['7'] },
      response: staffUserListItemExample,
    },
    {
      name: 'clear',
      params: { uid: '1001' },
      body: { labelIds: [] },
      response: { ...staffUserListItemExample, labels: [] },
    },
  ],
});
