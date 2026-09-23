'use client';

import { Segmented, Typography } from 'antd';
import type { ReactNode } from 'react';

/**
 * The layout primitives every config panel is built from.
 *
 * A panel is a list of field rows grouped under titled sections. A section is
 * a real element, so it can be hidden as a unit.
 */

export interface DiySectionProps {
  title?: string | undefined;
  /** Hides the whole section when false. Defaults to true. */
  when?: boolean | undefined;
  children: ReactNode;
}

export function DiySection({ title, when = true, children }: DiySectionProps) {
  if (!when) return null;
  return (
    <section style={{ marginBottom: 20 }}>
      {title ? (
        <Typography.Text strong style={{ display: 'block', marginBottom: 12, fontSize: 14 }}>
          {title}
        </Typography.Text>
      ) : null}
      {children}
    </section>
  );
}

export interface DiyFieldRowProps {
  label?: string | undefined;
  /** Puts the control under the label instead of beside it. */
  stacked?: boolean | undefined;
  help?: string | undefined;
  children: ReactNode;
}

/** One labelled control. 92px label column, matching the old 装修 sidebar. */
export function DiyFieldRow({ label, stacked = false, help, children }: DiyFieldRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'stretch' : 'center',
        gap: stacked ? 8 : 12,
        marginBottom: 14,
      }}
    >
      {label ? (
        <Typography.Text
          type="secondary"
          style={{ flex: stacked ? undefined : '0 0 92px', fontSize: 13 }}
        >
          {label}
        </Typography.Text>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
        {help ? (
          <Typography.Text
            type="secondary"
            style={{ display: 'block', fontSize: 12, marginTop: 4 }}
          >
            {help}
          </Typography.Text>
        ) : null}
      </div>
    </div>
  );
}

export interface DiySetUpTabsProps {
  value: number;
  onChange: (next: number) => void;
  /** Defaults to the pair 展示设置 / 样式设置. */
  options?: readonly string[] | undefined;
  disabled?: boolean | undefined;
}

/**
 * The 展示设置 / 样式设置 switch at the top of every panel. Backed by
 * `setUp.tabVal` in the saved node, which is why it is persisted state and not
 * component state — stored pages carry it, and the fixtures have it.
 */
export function DiySetUpTabs({
  value,
  onChange,
  options = ['内容设置', '样式设置'],
  disabled = false,
}: DiySetUpTabsProps) {
  return (
    <Segmented
      block
      disabled={disabled}
      value={String(value)}
      onChange={(next) => onChange(Number(next))}
      options={options.map((label, index) => ({ label, value: String(index) }))}
      style={{ marginBottom: 20 }}
    />
  );
}
