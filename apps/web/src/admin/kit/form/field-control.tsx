'use client';

import { Checkbox, Input, InputNumber, Radio, Select, Switch } from 'antd';
import type { ReactNode } from 'react';

import { AssetField } from './asset-field';
import { isEndOfWindow } from '../instant';
import { DateField, DateRangeField } from './date-fields';
import { LinkField } from './link-field';
import { MoneyInput } from './money-input';
import { RichTextField } from './rich-text-field';
import { CascaderField, TreeSelectField } from './select-fields';
import { SortableListField } from './sortable-list-field';
import type { FieldSpec } from './types';
import { defined } from '../props';

/** antd injects `value` / `onChange` into whatever this returns. */
export function renderControl(spec: FieldSpec, disabled: boolean): ReactNode {
  const off = disabled || spec.disabled === true;

  switch (spec.kind) {
    case 'text':
      return (
        <Input
          placeholder={spec.placeholder}
          maxLength={spec.maxLength}
          prefix={spec.prefix}
          addonAfter={spec.addonAfter}
          disabled={off}
          allowClear
        />
      );

    case 'password':
      return (
        <Input.Password
          placeholder={spec.placeholder}
          maxLength={spec.maxLength}
          disabled={off}
          autoComplete="new-password"
        />
      );

    case 'textarea':
      return (
        <Input.TextArea
          placeholder={spec.placeholder}
          rows={spec.rows ?? 4}
          maxLength={spec.maxLength}
          showCount={spec.showCount ?? false}
          disabled={off}
        />
      );

    case 'number':
      return (
        <InputNumber
          style={{ width: '100%' }}
          {...defined({
            placeholder: spec.placeholder,
            min: spec.min,
            max: spec.max,
            step: spec.step,
            precision: spec.precision,
          })}
          addonAfter={spec.addonAfter}
          disabled={off}
        />
      );

    case 'money':
      return (
        <MoneyInput
          placeholder={spec.placeholder}
          symbol={spec.symbol ?? '¥'}
          allowNegative={spec.allowNegative ?? false}
          disabled={off}
        />
      );

    case 'switch':
      return (
        <Switch
          checkedChildren={spec.checkedText}
          unCheckedChildren={spec.uncheckedText}
          disabled={off}
        />
      );

    case 'select':
      return (
        <Select
          placeholder={spec.placeholder ?? '请选择'}
          options={spec.options as never}
          {...defined({ mode: spec.mode })}
          allowClear={spec.allowClear ?? true}
          showSearch={spec.showSearch ?? false}
          optionFilterProp="label"
          disabled={off}
        />
      );

    case 'radio':
      return (
        <Radio.Group
          options={spec.options as never}
          optionType={spec.optionType ?? 'default'}
          disabled={off}
        />
      );

    case 'checkbox':
      return <Checkbox.Group options={spec.options as never} disabled={off} />;

    case 'date':
      return (
        <DateField
          showTime={spec.showTime ?? false}
          placeholder={spec.placeholder}
          disabled={off}
          endOfDay={spec.endOfDay ?? isEndOfWindow(spec.name)}
        />
      );

    case 'dateRange':
      return (
        <DateRangeField
          showTime={spec.showTime ?? false}
          wholeDays={spec.wholeDays ?? true}
          disabled={off}
        />
      );

    case 'treeSelect':
      return (
        <TreeSelectField
          treeData={spec.treeData}
          loadOptions={spec.loadOptions}
          cacheKey={spec.cacheKey}
          multiple={spec.multiple ?? false}
          leafOnly={spec.leafOnly ?? false}
          placeholder={spec.placeholder ?? '请选择'}
          disabled={off}
        />
      );

    case 'cascader':
      return (
        <CascaderField
          options={spec.options}
          loadOptions={spec.loadOptions}
          cacheKey={spec.cacheKey}
          changeOnSelect={spec.changeOnSelect ?? false}
          placeholder={spec.placeholder ?? '请选择'}
          disabled={off}
        />
      );

    case 'richText':
      return <RichTextField minHeight={spec.minHeight ?? 280} disabled={off} />;

    case 'asset':
      return (
        <AssetField
          multiple={spec.multiple ?? false}
          max={spec.max}
          valueType={spec.valueType ?? 'url'}
          size={spec.size ?? 96}
          disabled={off}
        />
      );

    case 'link':
      return <LinkField allow={spec.allow} disabled={off} />;

    case 'sortableList':
      return (
        <SortableListField
          renderItem={spec.renderItem as never}
          newItem={spec.newItem as never}
          addText={spec.addText ?? '添加一项'}
          max={spec.max}
          min={spec.min ?? 0}
          emptyText={spec.emptyText ?? '暂无内容'}
          disabled={off}
        />
      );

    case 'custom':
      return <CustomControl render={spec.render} disabled={off} />;

    case 'hidden':
      return <input type="hidden" />;

    default: {
      const exhaustive: never = spec;
      return exhaustive;
    }
  }
}

/** Adapts antd's injected `value`/`onChange` to a plain render prop. */
function CustomControl({
  render,
  disabled,
  value,
  onChange,
  id,
}: {
  render: (props: {
    value: unknown;
    onChange: (value: unknown) => void;
    disabled: boolean;
    id?: string | undefined;
  }) => ReactNode;
  disabled: boolean;
  value?: unknown | undefined;
  onChange?: ((value: unknown) => void) | undefined;
  id?: string | undefined;
}) {
  return (
    <>
      {render({
        value,
        onChange: (next) => onChange?.(next),
        disabled,
        ...(id !== undefined ? { id } : {}),
      })}
    </>
  );
}

/** The prop antd should treat as the value for a given kind. */
export function valuePropNameOf(spec: FieldSpec): string | undefined {
  if (spec.kind === 'switch') return 'checked';
  if (spec.kind === 'custom') return spec.valuePropName;
  return undefined;
}
