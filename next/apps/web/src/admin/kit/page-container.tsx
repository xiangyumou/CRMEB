'use client';

import { Breadcrumb, Typography } from 'antd';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { useAdminMenu } from '../menu/use-admin-menu';

export interface BreadcrumbEntry {
  label: string;
  href?: string | undefined;
}

export interface PageContainerProps {
  /** Page heading. Defaults to the current menu node's label. */
  title?: ReactNode | undefined;
  /** One line under the title. */
  subTitle?: ReactNode | undefined;
  /** Right-hand actions — usually a create button or a `<Can>`-wrapped group. */
  extra?: ReactNode | undefined;
  /**
   * Replaces the menu-derived breadcrumb. Pass `false` to hide it; pass a list
   * for detail pages the menu doesn't know about.
   */
  breadcrumb?: BreadcrumbEntry[] | false | undefined;
  /** Rendered directly under the header, inside the same card-less band. */
  tabs?: ReactNode | undefined;
  /** Sticky footer bar, e.g. save/cancel on a long form. */
  footer?: ReactNode | undefined;
  children: ReactNode;
}

/**
 * The frame every admin page uses: breadcrumb, title, actions, content.
 *
 * ```tsx
 * <PageContainer title="优惠券" extra={<Can permission="coupon:template:create"><Button/></Can>}>
 *   <CrudTable … />
 * </PageContainer>
 * ```
 */
export function PageContainer({
  title,
  subTitle,
  extra,
  breadcrumb,
  tabs,
  footer,
  children,
}: PageContainerProps) {
  const { trail } = useAdminMenu();

  const entries: BreadcrumbEntry[] | false =
    breadcrumb === false
      ? false
      : (breadcrumb ??
        trail.map((node) => ({
          label: node.label,
          ...(node.path ? { href: node.path } : {}),
        })));

  const heading = title ?? trail.at(-1)?.label ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        {entries !== false && entries.length > 0 ? (
          <Breadcrumb
            style={{ marginBottom: 8 }}
            items={entries.map((entry, index) => ({
              key: `${entry.label}-${index}`,
              title:
                entry.href && index < entries.length - 1 ? (
                  <Link href={entry.href}>{entry.label}</Link>
                ) : (
                  entry.label
                ),
            }))}
          />
        ) : null}

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            {heading ? (
              <Typography.Title level={4} style={{ margin: 0 }}>
                {heading}
              </Typography.Title>
            ) : null}
            {subTitle ? <Typography.Text type="secondary">{subTitle}</Typography.Text> : null}
          </div>
          {extra ? <div style={{ flexShrink: 0 }}>{extra}</div> : null}
        </div>

        {tabs ? <div style={{ marginTop: 8 }}>{tabs}</div> : null}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>

      {footer ? (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            padding: '12px 0',
            background: 'var(--ant-color-bg-layout)',
            borderTop: '1px solid var(--ant-color-border-secondary)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
