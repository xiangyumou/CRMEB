'use client';

import type { DiyGroup, DiyListBox, DiySlider } from '@shop/contracts/diy/schema/primitives';
import { Checkbox, DatePicker, Input, InputNumber, Switch } from 'antd';
import dayjs from 'dayjs';

import { DiyFieldRow, DiyLinkField, DiySortableListField } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * The five `mobileConfigRight/c_*` widgets that have no counterpart in G1's
 * frozen `fields/` barrel, composed here from antd and from the frozen
 * editors. Private to stream G2 until the orchestrator promotes them; see
 * `docs/rewrite/cr/CR-1-g2.md`.
 *
 * None of them forks an existing editor: each is a widget the legacy admin has
 * and `fields/` does not, and each follows the same rule as the frozen ones —
 * **patch the config object, never rebuild it**, so sibling keys survive.
 */

// ---------------------------------------------------------------------------

/** The selection lives in `type` as an array of `list[].id`, not a style index. */
export interface DiyCheckboxFieldProps extends DiyFieldProps<DiyListBox> {
  label?: string | undefined;
  /** Cap on how many may be ticked; falls back to the value's `maxList`. */
  max?: number | undefined;
}

/**
 * `c_checkbox` — 展示信息 and friends.
 *
 * The odd one out among the legacy widgets: the selection lives in `type` as an
 * **array of ids** while `list` holds `{id, name}` labels, and `c_checkbox.vue`
 * caps it at `maxList` (3 for `showContent`). Ids stay exactly as stored —
 * production has both numbers and strings in the same array.
 */
export function DiyCheckboxField({
  value,
  onChange,
  disabled = false,
  label,
  max,
}: DiyCheckboxFieldProps) {
  const config = value ?? {};
  const selected = (Array.isArray(config.type) ? config.type : []) as (string | number)[];
  const cap = max ?? (Number(config.maxList ?? 0) || undefined);
  const options = ((config.list ?? []) as { id?: string | number; name?: string }[]).map((item) => {
    const id = item.id as string | number;
    return {
      label: item.name ?? String(id),
      value: id,
      disabled: disabled || (cap !== undefined && selected.length >= cap && !selected.includes(id)),
    };
  });

  return (
    <DiyFieldRow label={label ?? config.title} stacked>
      <Checkbox.Group
        disabled={disabled}
        value={selected}
        options={options}
        onChange={(next) => onChange({ ...config, type: next })}
      />
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------

export interface DiyNumberFieldProps extends DiyFieldProps<DiySlider> {
  label?: string | undefined;
}

/**
 * `c_input_number` — a bare number box rather than `c_slider`'s track.
 *
 * The legacy widget defaults the bounds to `min || 1` / `max || 100`
 * (`c_input_number.vue:19-20`) but never writes them back, so neither does this.
 */
export function DiyNumberField({ value, onChange, disabled = false, label }: DiyNumberFieldProps) {
  const config = value ?? {};
  const lo = Number(config.min ?? 1);
  const hi = Number(config.max ?? 100);
  return (
    <DiyFieldRow label={label ?? config.title ?? '商品数量'}>
      <InputNumber
        disabled={disabled}
        min={Number.isFinite(lo) ? lo : 1}
        max={Number.isFinite(hi) ? hi : 100}
        step={1}
        placeholder={config.placeholder}
        value={Number(config.val ?? lo)}
        onChange={(next) => onChange({ ...config, val: next ?? lo })}
        style={{ width: '100%' }}
      />
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------

export interface DiyEnableFieldProps extends DiyFieldProps<DiyGroup> {
  label?: string | undefined;
}

/**
 * `c_header_switch` — a switch stored as `{title, enable}`.
 *
 * Distinct from the frozen `DiySwitchField`, which edits `{title, val}`. Two
 * different legacy widgets, two different keys; coercing one into the other
 * would write a key the renderer does not read.
 */
export function DiyEnableField({ value, onChange, disabled = false, label }: DiyEnableFieldProps) {
  const config = value ?? {};
  return (
    <DiyFieldRow label={label ?? config.title}>
      <Switch
        disabled={disabled}
        checked={Boolean(config.enable)}
        onChange={(next) => onChange({ ...config, enable: next })}
      />
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------

export interface DiyTextConfigFieldProps extends DiyFieldProps<DiyGroup> {
  label?: string | undefined;
}

/**
 * `c_text_config` — an on/off corner label with optional link.
 *
 * `link` is rendered only when the node already has the key
 * (`c_text_config.vue:17`, `v-if="configData.link !== undefined"`), so a node
 * saved without one does not gain it.
 */
export function DiyTextConfigField({
  value,
  onChange,
  disabled = false,
  label,
}: DiyTextConfigFieldProps) {
  const config = value ?? {};
  const enabled = Boolean(config.enable);
  const text = typeof config.text === 'string' ? config.text : '';
  const link = config.link;
  return (
    <>
      <DiyFieldRow label={label ?? config.title}>
        <Switch
          disabled={disabled}
          checked={enabled}
          onChange={(next) => onChange({ ...config, enable: next })}
        />
      </DiyFieldRow>
      {enabled ? (
        <>
          <DiyFieldRow>
            <Input
              disabled={disabled}
              value={text}
              maxLength={20}
              showCount
              placeholder="请输入文字"
              onChange={(event) => onChange({ ...config, text: event.target.value })}
            />
          </DiyFieldRow>
          {link !== undefined ? (
            <DiyLinkField
              value={String(link)}
              onChange={(next) => onChange({ ...config, link: next })}
              disabled={disabled}
              label="链接"
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

export interface DiyHotWordFieldProps extends DiyFieldProps<DiyListBox> {
  label?: string | undefined;
}

/** `c_hot_word` — a draggable list of `{val}` strings, capped at 20. */
export function DiyHotWordField({
  value,
  onChange,
  disabled = false,
  label,
}: DiyHotWordFieldProps) {
  return (
    <DiySortableListField<{ val?: string; [key: string]: unknown }>
      value={value}
      onChange={onChange}
      disabled={disabled}
      {...(label === undefined ? {} : { label })}
      max={20}
      addText="添加"
      newItem={() => ({ val: '' })}
      renderItem={(item, set) => (
        <Input
          disabled={disabled}
          value={item.val ?? ''}
          maxLength={10}
          placeholder="选填，不超过十个字"
          onChange={(event) => set({ ...item, val: event.target.value })}
        />
      )}
    />
  );
}

// ---------------------------------------------------------------------------

export interface DiyDateRangeFieldProps extends DiyFieldProps<DiyGroup> {
  label?: string | undefined;
}

/**
 * `c_datetime_picker` — a date range stored in `val` as two strings.
 *
 * The legacy picker is `value-format="yyyy/MM/dd"` (`c_datetime_picker.vue:14`),
 * so the stored strings are `2024/01/31`, not ISO. That format is what the
 * coupon query on the storefront parses, so it is reproduced exactly; clearing
 * the range stores `[]`, which is also what the factory default carries.
 */
export function DiyDateRangeField({
  value,
  onChange,
  disabled = false,
  label,
}: DiyDateRangeFieldProps) {
  const config = value ?? {};
  const stored = Array.isArray(config.val) ? (config.val as unknown[]) : [];
  const parse = (raw: unknown) => {
    const parsed = dayjs(String(raw ?? ''), 'YYYY/MM/DD');
    return parsed.isValid() ? parsed : null;
  };
  const from = parse(stored[0]);
  const to = parse(stored[1]);

  return (
    <DiyFieldRow label={label ?? config.title}>
      <DatePicker.RangePicker
        disabled={disabled}
        style={{ width: '100%' }}
        format="YYYY/MM/DD"
        placeholder={['开始日期', '结束日期']}
        value={from && to ? [from, to] : null}
        onChange={(next) =>
          onChange({
            ...config,
            val:
              next && next[0] && next[1]
                ? [next[0].format('YYYY/MM/DD'), next[1].format('YYYY/MM/DD')]
                : [],
          })
        }
      />
    </DiyFieldRow>
  );
}
