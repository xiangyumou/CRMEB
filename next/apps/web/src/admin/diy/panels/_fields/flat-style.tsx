'use client';

import { ColorPicker, InputNumber, Segmented, Slider } from 'antd';

import { DiyFieldRow } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * The two style groups that store **bare scalars** rather than the usual
 * `{title, val}` / `{title, color: [{item}]}` config objects:
 * `c_header_style` (导航组头部) and `c_grid_item_style` (宫格项).
 *
 * That is why they cannot go through `DiySliderField` or `DiyColourField`,
 * which both patch a config object. A colour here is a plain `'#333333'`
 * string; a size is a plain number. Writing either in the frozen editors'
 * shape would rewrite the node into something `menus.vue` cannot read.
 */

function ScalarNumber({
  label,
  value,
  onChange,
  disabled,
  min = 0,
  max = 100,
}: {
  label: string;
  value: unknown;
  onChange: (next: number) => void;
  disabled: boolean;
  min?: number;
  max?: number;
}) {
  const current = Number(value ?? min);
  return (
    <DiyFieldRow label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Slider
          disabled={disabled}
          min={min}
          max={max}
          value={Number.isFinite(current) ? current : min}
          onChange={onChange}
          style={{ flex: 1 }}
        />
        <InputNumber
          disabled={disabled}
          size="small"
          min={min}
          max={max}
          value={Number.isFinite(current) ? current : min}
          onChange={(next) => onChange(next ?? min)}
          style={{ width: 72 }}
        />
      </div>
    </DiyFieldRow>
  );
}

function ScalarColour({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: unknown;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  return (
    <DiyFieldRow label={label}>
      <ColorPicker
        disabled={disabled}
        value={typeof value === 'string' && value ? value : '#FFFFFF'}
        onChangeComplete={(next) => onChange(next.toHexString())}
        showText
        size="small"
      />
    </DiyFieldRow>
  );
}

const WEIGHTS = [
  { label: '常规', value: 'normal' },
  { label: '加粗', value: 'bold' },
] as const;

// ---------------------------------------------------------------------------

export interface DiyHeaderStyleFieldProps extends DiyFieldProps<{
  title?: string | undefined;
  fontSize?: unknown;
  rightFontSize?: unknown;
  leftColor?: unknown;
  rightColor?: unknown;
  leftWeight?: unknown;
  rightWeight?: unknown;
  topPadding?: unknown;
  bottomPadding?: unknown;
  leftRightPadding?: unknown;
  [key: string]: unknown;
}> {}

/** `c_header_style` — the 导航组 header's type, colour and padding. */
export function DiyHeaderStyleField({
  value,
  onChange,
  disabled = false,
}: DiyHeaderStyleFieldProps) {
  const config = value ?? {};
  const set = (key: string, next: unknown): void => onChange({ ...config, [key]: next });

  return (
    <>
      <ScalarNumber
        label="标题字号"
        value={config.fontSize}
        onChange={(next) => set('fontSize', next)}
        disabled={disabled}
        min={12}
        max={40}
      />
      <ScalarColour
        label="标题文字色"
        value={config.leftColor}
        onChange={(next) => set('leftColor', next)}
        disabled={disabled}
      />
      <DiyFieldRow label="标题字重">
        <Segmented
          disabled={disabled}
          value={String(config.leftWeight ?? 'normal')}
          onChange={(next) => set('leftWeight', String(next))}
          options={[...WEIGHTS]}
        />
      </DiyFieldRow>
      <ScalarNumber
        label="按钮字号"
        value={config.rightFontSize}
        onChange={(next) => set('rightFontSize', next)}
        disabled={disabled}
        min={12}
        max={40}
      />
      <ScalarColour
        label="按钮文字色"
        value={config.rightColor}
        onChange={(next) => set('rightColor', next)}
        disabled={disabled}
      />
      <DiyFieldRow label="按钮字重">
        <Segmented
          disabled={disabled}
          value={String(config.rightWeight ?? 'normal')}
          onChange={(next) => set('rightWeight', String(next))}
          options={[...WEIGHTS]}
        />
      </DiyFieldRow>
      <ScalarNumber
        label="上边距"
        value={config.topPadding}
        onChange={(next) => set('topPadding', next)}
        disabled={disabled}
      />
      <ScalarNumber
        label="下边距"
        value={config.bottomPadding}
        onChange={(next) => set('bottomPadding', next)}
        disabled={disabled}
      />
      <ScalarNumber
        label="左右边距"
        value={config.leftRightPadding}
        onChange={(next) => set('leftRightPadding', next)}
        disabled={disabled}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

export interface DiyGridItemStyleFieldProps extends DiyFieldProps<{
  title?: string | undefined;
  itemPadding?: unknown;
  itemPaddingTop?: unknown;
  itemBgColor?: unknown;
  itemRadius?: unknown;
  [key: string]: unknown;
}> {}

/**
 * `c_grid_item_style` — the 宫格项 box.
 *
 * 上下内边距 (`itemPaddingTop`) is rendered only when the node already has the
 * key. The legacy widget draws it unconditionally (`c_grid_item_style.vue:13`)
 * although no factory default contains it, so drawing it here would let an
 * operator add a key to a page that has never had one.
 */
export function DiyGridItemStyleField({
  value,
  onChange,
  disabled = false,
}: DiyGridItemStyleFieldProps) {
  const config = value ?? {};
  const set = (key: string, next: unknown): void => onChange({ ...config, [key]: next });

  return (
    <>
      <ScalarNumber
        label="左右内边距"
        value={config.itemPadding}
        onChange={(next) => set('itemPadding', next)}
        disabled={disabled}
      />
      {config.itemPaddingTop !== undefined ? (
        <ScalarNumber
          label="上下内边距"
          value={config.itemPaddingTop}
          onChange={(next) => set('itemPaddingTop', next)}
          disabled={disabled}
        />
      ) : null}
      <ScalarColour
        label="背景色"
        value={config.itemBgColor}
        onChange={(next) => set('itemBgColor', next)}
        disabled={disabled}
      />
      <ScalarNumber
        label="圆角"
        value={config.itemRadius}
        onChange={(next) => set('itemRadius', next)}
        disabled={disabled}
      />
    </>
  );
}
