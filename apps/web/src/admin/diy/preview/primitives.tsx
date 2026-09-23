'use client';

import { PictureOutlined } from '@ant-design/icons';
import type { CSSProperties, ReactNode } from 'react';

import type { DiyComponentValue } from '../panel-api';

/**
 * Shared bits for the canvas previews.
 *
 * The previews are **schematic**, not a second renderer. The real one is the
 * uni-app page (`apps/uni-app/subpackage/diyComponents/`); reimplementing
 * it here would mean maintaining two renderers that
 * must agree pixel for pixel, and the one that matters would still be the other
 * one. What the operator needs on the canvas is the order of the page, which
 * component each block is, and enough of its content — the banner images, the
 * menu labels, the title text — to tell two of the same kind apart. The 预览
 * QR code on the toolbar opens the real thing.
 *
 * Every accessor here is total: a preview is handed whatever is in the saved
 * page, including nodes written by an editor build that postdates this code, so
 * nothing may throw on a missing or mistyped field.
 */

export function pick(value: unknown, ...path: (string | number)[]): unknown {
  let current: unknown = value;
  for (const step of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[step];
  }
  return current;
}

export function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** `node[key].color[0].item`, the shape every stored colour control has. */
export function colorOf(node: DiyComponentValue, key: string, fallback: string): string {
  return str(pick(node, key, 'color', 0, 'item'), fallback);
}

/** The selected entry of a `{ tabVal, tabList }` control. */
export function tabStyle(node: DiyComponentValue, key: string, fallback = ''): string {
  const index = num(pick(node, key, 'tabVal'));
  return str(pick(node, key, 'tabList', index, 'style'), fallback);
}

export function tabValue(node: DiyComponentValue, key: string, fallback = 0): number {
  return num(pick(node, key, 'tabVal'), fallback);
}

/**
 * Paddings, margins, background and corner radius, which nearly every component
 * carries under the same four keys.
 */
export function frameStyle(node: DiyComponentValue): CSSProperties {
  const background =
    tabValue(node, 'componentBgConfig') === 1
      ? undefined
      : str(pick(node, 'componentBgConfig', 'colorConfig', 'color', 0, 'item'), '') ||
        colorOf(node, 'moduleColor', '') ||
        colorOf(node, 'bgColor', '');
  const style: CSSProperties = {
    paddingLeft: num(pick(node, 'paddingConfig', 'val')),
    paddingRight: num(pick(node, 'paddingConfig', 'val')),
    marginTop: num(pick(node, 'marginConfig', 'val')),
    marginBottom: num(pick(node, 'marginConfig', 'val')),
    borderRadius: num(pick(node, 'fillet', 'val')),
  };
  if (background) style.background = background;
  return style;
}

export function PreviewBlock({
  node,
  children,
  style,
}: {
  node: DiyComponentValue;
  children: ReactNode;
  style?: CSSProperties | undefined;
}) {
  return <div style={{ ...frameStyle(node), ...style }}>{children}</div>;
}

/** An image slot: the real picture when one is set, a placeholder when not. */
export function PreviewImage({
  url,
  height = 80,
  radius = 4,
  label,
  style,
}: {
  url?: string | undefined;
  height?: number | string;
  radius?: number;
  label?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  const resolved = resolveAssetUrl(url);
  const base: CSSProperties = {
    height,
    borderRadius: radius,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f0f0f0',
    color: '#bfbfbf',
    fontSize: 12,
    ...style,
  };
  if (!resolved) {
    return (
      <div style={base}>
        <PictureOutlined />
        {label ? <span style={{ marginLeft: 4 }}>{label}</span> : null}
      </div>
    );
  }
  return (
    <div style={{ ...base, backgroundImage: `url(${resolved})`, backgroundSize: 'cover' }}>
      {/* The image is the background so an odd aspect ratio never breaks the row. */}
    </div>
  );
}

/**
 * `@LOCAL@@/assets/images/pink02.png` is how some stored pages name a path
 * relative to an editor's bundled assets. Nothing here serves those, so
 * they render as placeholders rather than as broken images.
 */
export function resolveAssetUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('@LOCAL@')) return null;
  return url;
}

export function PreviewText({
  children,
  size = 13,
  color = '#333',
  bold = false,
  align = 'left',
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  bold?: boolean;
  align?: CSSProperties['textAlign'];
  style?: CSSProperties | undefined;
}) {
  return (
    <div
      style={{ fontSize: size, color, fontWeight: bold ? 600 : 400, textAlign: align, ...style }}
    >
      {children}
    </div>
  );
}

/** What a preview shows for a component it has no bespoke rendering for. */
export function PreviewFallback({ label }: { label: string }) {
  return (
    <div
      style={{
        border: '1px dashed #d9d9d9',
        borderRadius: 4,
        padding: '18px 12px',
        textAlign: 'center',
        color: '#8c8c8c',
        fontSize: 12,
        background: '#fafafa',
      }}
    >
      {label}
    </div>
  );
}

export function PreviewGrid({
  count,
  columns,
  children,
  gap = 6,
}: {
  count: number;
  columns: number;
  children: (index: number) => ReactNode;
  gap?: number;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap }}>
      {Array.from({ length: count }, (_unused, index) => (
        <div key={index}>{children(index)}</div>
      ))}
    </div>
  );
}
