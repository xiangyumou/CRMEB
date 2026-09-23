'use client';

import type { DiyListBox } from '@shop/contracts/diy/schema/primitives';
import { Input, Switch } from 'antd';

import { DiyFieldRow, DiyLinkField, DiySortableListField } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * `c_product` — a list whose rows carry their own field descriptors.
 *
 * Nothing to do with products despite the file name; `news.listConfig` is the
 * only user. Each row is `{chiild: [{title, val, max, pla}, …], show}` — yes,
 * `chiild`, misspelled in the payload and therefore load-bearing — and the row
 * that is titled 链接 gets the link picker.
 *
 * The 状态 switch appears only when the config's `type` is truthy.
 */

export interface DiyChildRow {
  chiild?: { title?: string; val?: string | number; max?: unknown; pla?: string }[];
  show?: unknown;
  [key: string]: unknown;
}

export interface DiyChildRowsFieldProps extends DiyFieldProps<DiyListBox> {
  label?: string | undefined;
  addText?: string | undefined;
}

export function DiyChildRowsField({
  value,
  onChange,
  disabled = false,
  label,
  addText = '添加',
}: DiyChildRowsFieldProps) {
  const config = value ?? {};
  const rows = (config.list ?? []) as DiyChildRow[];
  const showsStatus = Boolean(config.type);
  // A new row copies the first row's field descriptors, which is where the
  // titles, placeholders and limits live — there is no schema to build them
  // from, and inventing labels would not match the renderer.
  const template = rows[0]?.chiild ?? [];

  const setChild = (row: DiyChildRow, index: number, next: string): DiyChildRow => {
    const chiild = [...(row.chiild ?? [])];
    chiild[index] = { ...(chiild[index] ?? {}), val: next };
    return { ...row, chiild };
  };

  return (
    <DiySortableListField<DiyChildRow>
      value={config}
      onChange={onChange}
      disabled={disabled}
      {...(label === undefined ? {} : { label })}
      {...(config.max === undefined ? {} : { max: Number(config.max) })}
      addText={addText}
      newItem={() => ({
        chiild: template.map((field) => ({ ...field, val: '' })),
        show: true,
      })}
      renderItem={(row, set) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(row.chiild ?? []).map((field, index) =>
            field?.title === '链接' ? (
              <DiyLinkField
                key={index}
                value={String(field.val ?? '')}
                onChange={(url) => set(setChild(row, index, url))}
                disabled={disabled}
                label={field.title}
                {...(field.pla === undefined ? {} : { placeholder: field.pla })}
              />
            ) : (
              <DiyFieldRow key={index} label={field?.title}>
                <Input
                  disabled={disabled}
                  value={String(field?.val ?? '')}
                  placeholder={field?.pla}
                  maxLength={Number(field?.max ?? 0) || undefined}
                  onChange={(event) => set(setChild(row, index, event.target.value))}
                />
              </DiyFieldRow>
            ),
          )}
          {showsStatus ? (
            <DiyFieldRow label="状态">
              <Switch
                disabled={disabled}
                checked={Boolean(row.show)}
                onChange={(next) => set({ ...row, show: next })}
              />
            </DiyFieldRow>
          ) : null}
        </div>
      )}
    />
  );
}
