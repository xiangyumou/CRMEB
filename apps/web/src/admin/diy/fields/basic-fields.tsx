'use client';

import type {
  DiyColour,
  DiyInput,
  DiySelect,
  DiySlider,
  DiyTabs,
} from '@shop/contracts/diy/schema/primitives';
import { ColorPicker, Input, InputNumber, Radio, Select, Slider, Switch } from 'antd';

import type { DiyFieldProps } from '../panel-api';
import { DiyFieldRow } from './section';

/**
 * The shared field editors, one per `mobileConfigRight/c_*` widget.
 *
 * Every one of them edits a **whole config object** (`{title, tabVal, tabList}`,
 * `{title, color, default}`, …) rather than a bare scalar, because that object
 * is what the renderer reads and what must survive the round trip. They merge
 * into the existing value and never rebuild it, so a key we do not know about
 * is carried through untouched.
 */

function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------

export interface DiyTabsFieldProps extends DiyFieldProps<DiyTabs> {
  /** Overrides the labels stored in `tabList`. */
  options?: readonly string[] | undefined;
  /** `radio` (default) renders buttons; `select` a dropdown for long lists. */
  variant?: 'radio' | 'select' | undefined;
  label?: string | undefined;
}

/** `c_radio` / `c_card_select` / `c_tab` — pick one of `tabList` by index. */
export function DiyTabsField({
  value,
  onChange,
  disabled = false,
  options,
  variant = 'radio',
  label,
}: DiyTabsFieldProps) {
  const config = value ?? {};
  const items = (options ?? (config.tabList ?? []).map((t, i) => t?.name ?? `样式${i + 1}`)).map(
    (name, index) => ({ label: name, value: index }),
  );
  const current = toNumber(config.tabVal);
  const emit = (next: number): void => onChange({ ...config, tabVal: next });

  return (
    <DiyFieldRow label={label ?? config.title} stacked={variant === 'radio' && items.length > 3}>
      {variant === 'select' ? (
        <Select
          disabled={disabled}
          value={current}
          onChange={emit}
          options={items}
          style={{ width: '100%' }}
        />
      ) : (
        <Radio.Group
          disabled={disabled}
          optionType="button"
          buttonStyle="solid"
          value={current}
          onChange={(event) => emit(Number(event.target.value))}
          options={items}
        />
      )}
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------

export interface DiyColourFieldProps extends DiyFieldProps<DiyColour> {
  label?: string | undefined;
  /** Number of stops to show. 2 turns the field into a gradient editor. */
  stops?: number | undefined;
}

/**
 * `c_bg_color` — one or more colour stops.
 *
 * The value keeps `default` untouched: it is what the panel's 重置 restores,
 * and overwriting it would quietly destroy the reset target.
 */
export function DiyColourField({
  value,
  onChange,
  disabled = false,
  label,
  stops,
}: DiyColourFieldProps) {
  const config = value ?? {};
  const colour = config.color ?? [];
  const count = stops ?? Math.max(1, colour.length);

  const emit = (index: number, hex: string): void => {
    const next = Array.from({ length: count }, (_unused, i) => ({
      ...(colour[i] ?? {}),
      item: i === index ? hex : (colour[i]?.item ?? ''),
    }));
    onChange({ ...config, color: next });
  };

  return (
    <DiyFieldRow label={label ?? config.title}>
      <div style={{ display: 'flex', gap: 8 }}>
        {Array.from({ length: count }, (_unused, index) => (
          <ColorPicker
            key={index}
            disabled={disabled}
            value={colour[index]?.item ?? '#FFFFFF'}
            onChangeComplete={(next) => emit(index, next.toHexString())}
            showText
            size="small"
          />
        ))}
      </div>
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------

export interface DiySliderFieldProps extends DiyFieldProps<DiySlider> {
  label?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
}

/** `c_slider` — a bounded number with the bounds stored beside it. */
export function DiySliderField({
  value,
  onChange,
  disabled = false,
  label,
  min,
  max,
  step = 1,
}: DiySliderFieldProps) {
  const config = value ?? {};
  const lo = min ?? toNumber(config.min, 0);
  const hi = max ?? toNumber(config.max, 100);
  const current = toNumber(config.val, lo);

  return (
    <DiyFieldRow label={label ?? config.title}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Slider
          disabled={disabled}
          min={lo}
          max={hi}
          step={step}
          value={current}
          onChange={(next) => onChange({ ...config, val: next })}
          style={{ flex: 1 }}
        />
        <InputNumber
          disabled={disabled}
          size="small"
          min={lo}
          max={hi}
          step={step}
          value={current}
          onChange={(next) => onChange({ ...config, val: next ?? lo })}
          style={{ width: 72 }}
        />
      </div>
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------

export interface DiyInputFieldProps extends DiyFieldProps<DiyInput> {
  label?: string | undefined;
  textarea?: boolean | undefined;
}

/** `c_input_item` — free text with the panel's own label and length cap. */
export function DiyInputField({
  value,
  onChange,
  disabled = false,
  label,
  textarea = false,
}: DiyInputFieldProps) {
  const config = value ?? {};
  const max = config.max === undefined ? undefined : toNumber(config.max);
  const common = {
    disabled,
    value: String(config.value ?? ''),
    placeholder: config.place,
    maxLength: max,
    showCount: max !== undefined,
  };
  return (
    <DiyFieldRow label={label ?? config.title} stacked={textarea}>
      {textarea ? (
        <Input.TextArea
          {...common}
          rows={3}
          onChange={(event) => onChange({ ...config, value: event.target.value })}
        />
      ) : (
        <Input
          {...common}
          onChange={(event) => onChange({ ...config, value: event.target.value })}
        />
      )}
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------

export interface DiySelectFieldProps extends DiyFieldProps<DiySelect> {
  label?: string | undefined;
  /** Extra options merged over the ones stored in `list`. */
  options?: readonly { label: string; value: string | number }[] | undefined;
}

/** `c_select` / `c_classify` — one of `list`, addressed by `activeValue`. */
export function DiySelectField({
  value,
  onChange,
  disabled = false,
  label,
  options,
}: DiySelectFieldProps) {
  const config = value ?? {};
  const items =
    options ??
    (config.list ?? []).map((raw) => {
      const item = (raw ?? {}) as { title?: string; name?: string; activeValue?: string | number };
      return {
        label: item.title ?? item.name ?? String(item.activeValue ?? ''),
        value: (item.activeValue ?? '') as string | number,
      };
    });

  return (
    <DiyFieldRow label={label ?? config.title}>
      <Select
        disabled={disabled}
        style={{ width: '100%' }}
        value={config.activeValue as string | number | undefined}
        onChange={(next) => onChange({ ...config, activeValue: next })}
        options={[...items]}
      />
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------

export interface DiySwitchFieldProps extends DiyFieldProps<{ title?: string; val?: unknown }> {
  label?: string | undefined;
}

/** `c_is_show` — a boolean stored as `{ title, val }`. */
export function DiySwitchField({ value, onChange, disabled = false, label }: DiySwitchFieldProps) {
  const config = value ?? {};
  return (
    <DiyFieldRow label={label ?? config.title}>
      <Switch
        disabled={disabled}
        checked={Boolean(config.val)}
        onChange={(next) => onChange({ ...config, val: next })}
      />
    </DiyFieldRow>
  );
}
