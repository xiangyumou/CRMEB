'use client';

import type { DiyListBox, DiyTabs } from '@shop/contracts/diy/schema/primitives';
import { Input, InputNumber } from 'antd';

import { DiyFieldRow, DiySortableListField, DiyTabsField } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * `c_tab_list` — the 选项卡 rows of 组合组件 (`homeComb`) and 选项卡 (`tabNav`).
 *
 * A row is `{text, dataType, microPage, classPage}`. `dataType.tabVal` picks
 * which target is live: `0` 微页面 fills `microPage`, `1` 商品分类 fills
 * `classPage`. Both targets stay in the row either way — adding a row only
 * blanks the *name*, never deletes the other object — so switching the type
 * back does not lose what was chosen.
 *
 * Both targets are `{name, id}` pairs, not URLs (a link such as
 * `...?id=8&name=首页` split into the two fields). They are typed here rather
 * than picked, because the dynamic half of the link registry comes from other
 * domains and a panel may not call a route. Same two keys, same values.
 */

export interface DiyTabListRow {
  text?: { title?: string; val?: string | number; max?: unknown; pla?: string };
  dataType?: DiyTabs;
  microPage?: { name?: string; id?: string | number };
  classPage?: { name?: string; id?: string | number };
  [key: string]: unknown;
}

export interface DiyTabListFieldProps extends DiyFieldProps<DiyListBox> {
  label?: string | undefined;
}

export function DiyTabListField({
  value,
  onChange,
  disabled = false,
  label,
}: DiyTabListFieldProps) {
  const config = value ?? {};
  const rows = (config.list ?? []) as DiyTabListRow[];
  const template = rows[rows.length - 1];

  return (
    <DiySortableListField<DiyTabListRow>
      value={config}
      onChange={onChange}
      disabled={disabled}
      label={label ?? config.title}
      {...(config.max === undefined ? {} : { max: Number(config.max) })}
      addText="添加选项卡"
      newItem={() => ({
        ...structuredClone(template ?? {}),
        dataType: { ...(template?.dataType ?? {}), tabVal: 0 },
        microPage: { ...(template?.microPage ?? {}), name: '' },
        classPage: { ...(template?.classPage ?? {}), name: '' },
      })}
      renderItem={(row, set) => {
        const byCategory = Number(row.dataType?.tabVal ?? 0) === 1;
        const targetKey = byCategory ? 'classPage' : 'microPage';
        const target = row[targetKey] ?? {};
        const caption =
          row.dataType?.tabList?.[Number(row.dataType.tabVal ?? 0)]?.name ??
          (byCategory ? '商品分类' : '微页面');

        const setTarget = (patch: { name?: string; id?: string | number }): void =>
          set({ ...row, [targetKey]: { ...target, ...patch } });

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <DiyFieldRow label={row.text?.title ?? '显示文字'}>
              <Input
                disabled={disabled}
                value={String(row.text?.val ?? '')}
                placeholder={row.text?.pla}
                maxLength={Number(row.text?.max ?? 0) || undefined}
                showCount={row.text?.max !== undefined}
                onChange={(event) =>
                  set({ ...row, text: { ...(row.text ?? {}), val: event.target.value } })
                }
              />
            </DiyFieldRow>
            <DiyTabsField
              value={row.dataType}
              onChange={(next) => set({ ...row, dataType: next })}
              disabled={disabled}
            />
            <DiyFieldRow label={caption}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  disabled={disabled}
                  value={target.name ?? ''}
                  placeholder="名称"
                  onChange={(event) => setTarget({ name: event.target.value })}
                />
                <InputNumber
                  disabled={disabled}
                  value={Number(target.id ?? 0)}
                  min={0}
                  addonBefore="ID"
                  onChange={(next) => setTarget({ id: next ?? 0 })}
                />
              </div>
            </DiyFieldRow>
          </div>
        );
      }}
    />
  );
}
