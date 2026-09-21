'use client';

import type { DiyListBox } from '@shop/contracts/diy/schema/primitives';
import { Input, Radio, Switch } from 'antd';

import { DiyFieldRow, DiyImageField, DiyLinkField, DiySortableListField } from '../../fields';
import type { DiyFieldProps } from '../../panel-api';

/**
 * `c_menu_list` — the 导航组 / 个人中心菜单 row editor.
 *
 * `DiyImageListField` covers image + link, which is `c_swipers_list`. A menu
 * row carries more: a picture **or** an icon class depending on `listStyle`,
 * and `info` is a list of labelled entries — 标题 then 链接 for 导航组
 * (`menus.default.ts` and `DiyCompatibilityServices::clean`, which reads
 * `info[1].value`), but 标题 / 描述 / 链接 for 会员中心's `memberConfig`. Hence a
 * separate composite rather than a fork.
 *
 * Which entry gets the link picker is decided by its **title**, not its index:
 * `c_menu_list.vue:80` gates the link affordance on `infos.title == '链接'`, so
 * a three-entry row picks a link for its third field and not its 描述.
 *
 * `configData.type` turns on the per-row 状态 switch bound to `item.show`
 * (`:87-90`). Only the components whose rows can be hidden carry it.
 *
 * `listStyle` values, from `c_menu_list.vue:17-30`: `0` 图片, `1` 图标, and for
 * `assetConfig` only, `2` 数字(上) / `3` 数字(左). `-1` means the component has
 * no picker at all and always uses the image.
 *
 * The icon is a class name (`mb-iconfont` + `item.icon`). The legacy editor
 * opens a font picker for it; there is no icon font in the new admin, so the
 * class is typed. It is the same stored value either way.
 */

export interface DiyMenuRow {
  img?: string;
  icon?: string;
  info?: { title?: string; value?: string | number; tips?: string; max?: unknown }[];
  [key: string]: unknown;
}

export interface DiyMenuListFieldProps extends DiyFieldProps<
  DiyListBox & {
    listStyle?: unknown;
    listStyleName?: string | undefined;
    isCube?: unknown;
  }
> {
  label?: string | undefined;
  /** Shows the 图片 / 图标 switch. Off for the components that have no 图标 mode. */
  styleSwitch?: boolean | undefined;
  /** Extra `listStyle` options — `assetConfig` adds 数字(上) / 数字(左). */
  styleOptions?: readonly { label: string; value: number }[] | undefined;
  max?: number | undefined;
}

const IMAGE_OR_ICON = [
  { label: '图片', value: 0 },
  { label: '图标', value: 1 },
] as const;

/**
 * The entry that gets the link picker: the one titled 链接, and failing that
 * the second, which is where every two-entry row keeps it.
 */
function isLink(entry: { title?: string } | undefined, index: number, row: DiyMenuRow): boolean {
  const titled = (row.info ?? []).some((item) => item?.title === '链接');
  return titled ? entry?.title === '链接' : index === 1;
}

export function DiyMenuListField({
  value,
  onChange,
  disabled = false,
  label,
  styleSwitch = true,
  styleOptions,
  max,
}: DiyMenuListFieldProps) {
  const config = value ?? {};
  const listStyle = Number(config.listStyle ?? 0);
  const cap = max ?? (Number(config.maxList ?? 0) || undefined);
  // `isCube` means the rows are fixed slots of a cube layout: editable, but
  // neither addable nor removable (`c_menu_list.vue:37`).
  const fixed = Boolean(config.isCube);

  const setInfo = (row: DiyMenuRow, index: number, next: string): DiyMenuRow => {
    const info = [...(row.info ?? [])];
    info[index] = { ...(info[index] ?? {}), value: next };
    return { ...row, info };
  };

  return (
    <>
      {(label ?? config.title) ? (
        <DiyFieldRow>
          <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
            {label ?? config.title}
          </span>
        </DiyFieldRow>
      ) : null}
      {styleSwitch && listStyle !== -1 ? (
        <DiyFieldRow label={config.listStyleName ?? '图文内容'}>
          <Radio.Group
            disabled={disabled}
            optionType="button"
            buttonStyle="solid"
            value={listStyle}
            options={[...(styleOptions ?? IMAGE_OR_ICON)]}
            onChange={(event) => onChange({ ...config, listStyle: Number(event.target.value) })}
          />
        </DiyFieldRow>
      ) : null}
      <DiySortableListField<DiyMenuRow>
        value={config}
        onChange={onChange}
        disabled={disabled || fixed}
        {...(cap === undefined ? {} : { max: cap })}
        addText={(config.bnt as string | undefined) ?? '添加'}
        newItem={() => ({
          img: '',
          type: 0,
          show: true,
          icon: '',
          info: [
            { title: '标题', value: '', tips: '选填，不超过4个字', max: 4 },
            { title: '链接', value: '', tips: '请输入链接', max: 100 },
          ],
        })}
        renderItem={(row, set) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {listStyle === 1 ? (
              <DiyFieldRow label="图标">
                <Input
                  disabled={disabled}
                  value={row.icon ?? ''}
                  placeholder="图标类名，如 iconshouye"
                  onChange={(event) => set({ ...row, icon: event.target.value })}
                />
              </DiyFieldRow>
            ) : (
              <DiyImageField
                value={row.img ?? ''}
                onChange={(img) => set({ ...row, img })}
                disabled={disabled}
                size={56}
                label="图片"
              />
            )}
            {(row.info ?? []).map((entry, index) =>
              isLink(entry, index, row) ? (
                <DiyLinkField
                  key={index}
                  value={String(entry?.value ?? '')}
                  onChange={(url) => set(setInfo(row, index, url))}
                  disabled={disabled}
                  label={entry?.title ?? '链接'}
                  {...(entry?.tips === undefined ? {} : { placeholder: entry.tips })}
                />
              ) : (
                <DiyFieldRow key={index} label={entry?.title ?? '标题'}>
                  <Input
                    disabled={disabled}
                    value={String(entry?.value ?? '')}
                    placeholder={entry?.tips}
                    maxLength={Number(entry?.max ?? 0) || undefined}
                    onChange={(event) => set(setInfo(row, index, event.target.value))}
                  />
                </DiyFieldRow>
              ),
            )}
            {config.type ? (
              <DiyFieldRow label="状态">
                <Switch
                  disabled={disabled}
                  checked={Boolean(row.show ?? true)}
                  onChange={(show) => set({ ...row, show })}
                />
              </DiyFieldRow>
            ) : null}
          </div>
        )}
      />
    </>
  );
}
