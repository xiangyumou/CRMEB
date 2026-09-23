'use client';

import {
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  SunOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Grid, Layout, Menu, Tooltip, Typography } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

import { menuRegistry } from '../menu/menu.gen';
import { renderMenuIcon } from '../menu/icons';
import type { MenuNode } from '../menu/types';
import { useAdminMenu } from '../menu/use-admin-menu';
import { NotificationBell } from '../notifications/notification-bell';
import { ForbiddenResult } from '../session/can';
import { useCan, useSession } from '../session/session-provider';
import { useThemeMode } from '../theme/theme-provider';
import { requiredPermissions } from './route-permission';

const SIDER_WIDTH = 216;

/** The avatar menu's 个人资料 (CR-16-k: it pushed `/admin/profile`, which is a 404). */
export const PROFILE_PATH = '/admin/system/profile';

/**
 * The route-level guard every page gets from the shell (CR-16-k): a URL whose
 * menu entry needs an atom the admin lacks renders the 403 inside the chrome
 * instead of an empty screen and a toast per failed fetch. The atoms come from
 * the menu registry — see `route-permission.ts`.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const can = useCan();
  const required = useMemo(() => requiredPermissions(menuRegistry, pathname), [pathname]);
  if (!required.every((permission) => can(permission))) return <ForbiddenResult />;
  return <>{children}</>;
}
const SIDER_COLLAPSED = 56;

function toMenuItems(nodes: readonly MenuNode[]): NonNullable<Parameters<typeof Menu>[0]['items']> {
  return nodes.map((node) => {
    const icon = renderMenuIcon(node.icon);
    if (node.children?.length) {
      return {
        key: node.key,
        label: node.label,
        ...(icon ? { icon } : {}),
        children: toMenuItems(node.children),
      };
    }
    return {
      key: node.key,
      ...(icon ? { icon } : {}),
      label: node.path ? <Link href={node.path}>{node.label}</Link> : node.label,
    };
  });
}

/**
 * The admin chrome: collapsible sider driven by the permission-filtered menu
 * registry, a header with the notification bell, the theme toggle and the user
 * menu, and a content area.
 *
 * Breadcrumbs are not here — `PageContainer` owns them, so a page can override
 * them for records the menu knows nothing about.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { identity, logout, loggingOut } = useSession();
  const { mode, toggle } = useThemeMode();
  const { items, selectedKeys, openKeys } = useAdminMenu();
  const router = useRouter();
  const screens = Grid.useBreakpoint();

  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null);
  const [manualOpenKeys, setManualOpenKeys] = useState<string[] | null>(null);

  // Tablet and below default to collapsed; once the operator touches the
  // toggle their choice wins. Derived, so there is no effect and no flash.
  const isNarrow = screens.lg === false;
  const collapsed = collapsedOverride ?? isNarrow;
  const setCollapsed = setCollapsedOverride;

  const menuItems = useMemo(() => toMenuItems(items), [items]);
  const effectiveOpenKeys = collapsed ? [] : (manualOpenKeys ?? openKeys);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={SIDER_WIDTH}
        collapsedWidth={SIDER_COLLAPSED}
        theme={mode === 'dark' ? 'dark' : 'light'}
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'auto',
          borderInlineEnd: '1px solid var(--ant-color-border-secondary)',
        }}
        className="admin-scroll-area"
      >
        <Link
          href="/admin"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            height: 56,
            padding: '0 16px',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              flexShrink: 0,
              background: 'var(--ant-color-primary)',
            }}
          />
          {collapsed ? null : (
            <Typography.Text strong style={{ fontSize: 15 }}>
              商城管理后台
            </Typography.Text>
          )}
        </Link>

        <Menu
          mode="inline"
          theme={mode === 'dark' ? 'dark' : 'light'}
          items={menuItems}
          selectedKeys={selectedKeys}
          openKeys={effectiveOpenKeys}
          onOpenChange={(keys) => setManualOpenKeys(keys as string[])}
          style={{ borderInlineEnd: 0 }}
        />
      </Layout.Sider>

      <Layout>
        <Layout.Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: 'var(--ant-color-bg-container)',
            borderBottom: '1px solid var(--ant-color-border-secondary)',
            paddingInline: 12,
          }}
        >
          <Button
            type="text"
            aria-label={collapsed ? '展开菜单' : '收起菜单'}
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsedOverride(!collapsed)}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NotificationBell />

            <Tooltip title={mode === 'dark' ? '切换到浅色' : '切换到深色'}>
              <Button
                type="text"
                aria-label="切换主题"
                data-testid="theme-toggle"
                icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggle}
              />
            </Tooltip>

            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'account',
                    disabled: true,
                    label: `${identity.name}（${identity.account}）`,
                  },
                  { type: 'divider' },
                  { key: 'profile', icon: <UserOutlined />, label: '个人资料' },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    danger: true,
                    label: loggingOut ? '退出中…' : '退出登录',
                  },
                ],
                onClick: ({ key }) => {
                  if (key === 'logout') logout();
                  if (key === 'profile') router.push(PROFILE_PATH);
                },
              }}
            >
              <Button type="text" style={{ paddingInline: 8 }} data-testid="user-menu">
                <Avatar
                  size={24}
                  {...(identity.avatar ? { src: identity.avatar } : {})}
                  icon={<UserOutlined />}
                />
                {screens.sm === false ? null : (
                  <span style={{ marginInlineStart: 8 }}>{identity.name}</span>
                )}
              </Button>
            </Dropdown>
          </div>
        </Layout.Header>

        <Layout.Content
          style={{
            padding: screens.md === false ? 12 : 20,
            background: 'var(--ant-color-bg-layout)',
            minHeight: 0,
          }}
        >
          <RouteGuard>{children}</RouteGuard>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
