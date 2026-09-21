'use client';

import type { DiyGroup } from '@shop/contracts/diy/schema/primitives';
import { Radio, Select, Tag } from 'antd';

import { DiyCategoryPickerField, DiyFieldRow } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * Three more widgets with no counterpart in the frozen barrel. See CR-1-g2.
 */

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
 * The legacy widget opens `storeLabelList`, which pages the label API. The DIY
 * data-source port has kinds for products, articles, coupons and 拼团 and none
 * for labels, and a panel may not call a route, so labels already on the node
 * can be removed but new ones cannot be added here yet. Removing keeps the two
 * keys in step exactly as `closeStoreLabel` does: splice `list`, then recompute
 * `activeValue` from what is left.
 *
 * Adding needs a `labels` kind on `DiyDataSource`; see CR-3-g2.
 */
export function DiyGoodsLabelField({
  value,
  onChange,
  disabled = false,
  label,
}: DiyGoodsLabelFieldProps) {
  const config = value ?? {};
  const rows = (Array.isArray(config.list) ? config.list : []) as DiyGoodsLabelRow[];

  const remove = (id: string | number | undefined): void => {
    const next = rows.filter((row) => row.id !== id);
    onChange({ ...config, list: next, activeValue: next.map((row) => row.id) as never });
  };

  return (
    <DiyFieldRow label={label ?? config.title ?? '商品标签'} stacked>
      {rows.length === 0 ? (
        <Select
          disabled
          style={{ width: '100%' }}
          placeholder="暂不支持选择商品标签"
          options={[]}
        />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {rows.map((row, index) => (
            <Tag
              key={`${String(row.id ?? index)}-${index}`}
              closable={!disabled}
              onClose={() => remove(row.id)}
            >
              {row.label_name ?? String(row.id ?? '')}
            </Tag>
          ))}
        </div>
      )}
    </DiyFieldRow>
  );
}
