'use client';

import { PlusOutlined } from '@ant-design/icons';
import type { DiyGroup } from '@shop/contracts/diy/schema/primitives';
import { Button, Radio, Tag } from 'antd';
import { useState } from 'react';

import { DiyCategoryPickerField, DiyFieldRow, DiyPickerModal } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * Three more widgets with no counterpart in the barrel, each specific to one or
 * two panels.
 */

/**
 * The legacy label API returns `id` as a JSON number and the page stores it as
 * one; the contract types it as a string. Numeric ids go back to numbers so a
 * node written here matches one written by the old admin, and anything else is
 * stored verbatim rather than coerced.
 */
const labelId = (value: string): string | number =>
  /^[0-9]+$/.test(value) ? Number(value) : value;

// ---------------------------------------------------------------------------

export interface DiyAlignFieldProps extends DiyFieldProps<DiyGroup> {
  label?: string | undefined;
}

/**
 * `c_align` — 对齐方式, stored as the CSS keyword itself in `val`
 * (`left` / `center` / `right`), not as an index. The renderer drops it
 * straight into `text-align`, so the strings are load-bearing.
 */
export function DiyAlignField({ value, onChange, disabled = false, label }: DiyAlignFieldProps) {
  const config = value ?? {};
  return (
    <DiyFieldRow label={label ?? config.title}>
      <Radio.Group
        disabled={disabled}
        optionType="button"
        buttonStyle="solid"
        size="small"
        value={String(config.val ?? 'left')}
        onChange={(event) => onChange({ ...config, val: event.target.value })}
        options={[
          { label: '左对齐', value: 'left' },
          { label: '居中', value: 'center' },
          { label: '右对齐', value: 'right' },
        ]}
      />
    </DiyFieldRow>
  );
}

// ---------------------------------------------------------------------------

export interface DiyClassListFieldProps extends DiyFieldProps<DiyGroup> {
  label?: string | undefined;
}

/**
 * `c_classify` over `classVal` rather than `activeValue`.
 *
 * One widget, two key names: `c_classify.vue:49-63` writes `activeValue` when
 * the node has one and `classVal` when it does not, and 优品推荐 is the component
 * with a `classVal`. The frozen `DiyCategoryPickerField` knows only
 * `activeValue`, so this adapts around it instead of forking it — the tree, the
 * data source and the multi-select behaviour are all still the frozen editor's.
 */
export function DiyClassListField({
  value,
  onChange,
  disabled = false,
  label,
}: DiyClassListFieldProps) {
  const config = value ?? {};
  return (
    <DiyCategoryPickerField
      value={{
        ...(config.title === undefined ? {} : { title: config.title }),
        activeValue: config.classVal,
      }}
      onChange={(next) => onChange({ ...config, classVal: next.activeValue as never })}
      disabled={disabled}
      kind="product"
      multiple
      {...(label === undefined ? {} : { label })}
    />
  );
}

// ---------------------------------------------------------------------------

export interface DiyGoodsLabelRow {
  id?: string | number;
  label_name?: string;
  [key: string]: unknown;
}

export interface DiyGoodsLabelFieldProps extends DiyFieldProps<DiyGroup> {
  label?: string | undefined;
}

/**
 * `c_goods_label` — 商品标签, stored as `{activeValue: id[], list: [{id, label_name}]}`.
 *
 * The legacy widget opens `storeLabelList`, which pages the label API. Since
 * CR-3-g2 the port has a `labels` kind over `catalog.adminLabelList`, so this
 * is an ordinary picker again: add through the modal, remove through the tag's
 * close button.
 *
 * Both directions keep the two keys in step exactly as `closeStoreLabel` does —
 * write `list`, then recompute `activeValue` from it — and the row keeps the
 * legacy `label_name` key rather than the DTO's `name`, because the renderer
 * reads `label_name`.
 */
export function DiyGoodsLabelField({
  value,
  onChange,
  disabled = false,
  label,
}: DiyGoodsLabelFieldProps) {
  const [open, setOpen] = useState(false);
  const config = value ?? {};
  const rows = (Array.isArray(config.list) ? config.list : []) as DiyGoodsLabelRow[];

  /** `activeValue` is always `list`'s ids, in `list`'s order. */
  const emit = (next: DiyGoodsLabelRow[]): void =>
    onChange({ ...config, list: next, activeValue: next.map((row) => row.id) as never });

  return (
    <DiyFieldRow label={label ?? config.title ?? '商品标签'} stacked>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {rows.map((row, index) => (
          <Tag
            key={`${String(row.id ?? index)}-${index}`}
            closable={!disabled}
            onClose={() => emit(rows.filter((candidate) => candidate.id !== row.id))}
          >
            {row.label_name ?? String(row.id ?? '')}
          </Tag>
        ))}
        <Button
          size="small"
          icon={<PlusOutlined />}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          添加
        </Button>
      </div>
      <DiyPickerModal
        kind="labels"
        open={open}
        onClose={() => setOpen(false)}
        chosen={rows.map((row) => String(row.id ?? ''))}
        onPick={(item) => emit([...rows, { id: labelId(item.id), label_name: item.name }])}
      />
    </DiyFieldRow>
  );
}
