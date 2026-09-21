import { defineMenu } from './types';

/**
 * 设置 — admins, roles, the audit log and the generic settings screens.
 *
 * Last in the sider on purpose (`order: 900`): it is the menu an operator opens
 * once a week, not once an hour. 个人资料 is reachable from the avatar menu and
 * needs no grant, so it is `hidden` — present for the breadcrumb, absent from
 * the sider.
 *
 * `permission` here only decides what the sider shows; the server re-checks the
 * atom declared on each route. Both lists come from
 * `core/src/system/permissions.ts`.
 */
export default defineMenu({
  key: 'system',
  label: '设置',
  icon: 'SettingOutlined',
  order: 900,
  children: [
    {
      key: 'system.settings',
      label: '系统设置',
      path: '/admin/system/settings',
      permission: 'system:config:read',
      order: 10,
    },
    {
      key: 'system.settings.group',
      label: '配置分组',
      path: '/admin/system/settings/[group]',
      permission: 'system:config:read',
      order: 11,
      hidden: true,
    },
    {
      key: 'system.admins',
      label: '管理员',
      path: '/admin/system/admins',
      permission: 'system:admin:read',
      order: 20,
    },
    {
      key: 'system.roles',
      label: '身份管理',
      path: '/admin/system/roles',
      permission: 'system:role:read',
      order: 30,
    },
    {
      key: 'system.auditLogs',
      label: '操作日志',
      path: '/admin/system/audit-logs',
      permission: 'system:audit:read',
      order: 40,
    },
    {
      key: 'system.profile',
      label: '个人资料',
      path: '/admin/system/profile',
      order: 50,
      hidden: true,
    },
  ],
});
