'use client';

import type { DiyGroup, DiyListBox } from '@shop/contracts/diy/schema/primitives';
import { Input, Radio, Select } from 'antd';

import {
  DiyCategoryPickerField,
  DiyFieldRow,
  DiyImageField,
  DiyProductPickerField,
  DiySliderField,
  DiySortableListField,
} from '../../fields';
import type { DiyFieldProps } from '../../panel-api';
import { DiyGoodsLabelField } from './pickers';

/**
 * `c_promotion` — the 选项卡 rows of 商品选项卡 (`promotionList`), one tab per
 * product query.
 *
 * A row is `{chiild: [标题, 简介], image, tabVal, selectConfig, goodsLabel,
 * brandConfig, goodsSort, numConfig, goodsList, productList}`. `chiild` is
 * misspelled in the payload and so is load-bearing, exactly as in `c_product`.
 *
 * Two rows depend on the component's chosen style rather than the tab's own
 * state (`c_promotion.vue:13` and `:23`), which is why `style` is a prop:
 * 样式一 shows the 简介 field as well as the 标题, and 样式五 gives each tab an
 * image.
 *
 * `tabVal` picks the source: `1` 指定商品, `2` 品牌, `3` 指定分类, `4` 商品标签.
 * Only three are in the widget's own `typeList` — 品牌 is reachable on a node
 * saved when brands were still offered, and its row is drawn when that is what
 * the node says, so opening such a tab does not silently reinterpret it as
 * something else.
 *
 * Brands have no picker, and will not get one: 品牌 (`eb_store_brand`) is not in
 * the frozen schema, so no route lists brands and there is nothing to page
 * through. CR-3-g2 asked for a `brand` kind on `DiyPickerKind` and it was
 * dropped for that reason. The stored `brandConfig.brandVal` is shown read-only
 * rather than discarded, so a tab saved against a brand still renders what it
 * always rendered.
 */

export interface DiyPromotionRow {
  chiild?: { title?: string; val?: string | number; max?: unknown; pla?: string }[];
  image?: string;
  tabVal?: number | string;
  brandConfig?: { brandVal?: unknown[] | undefined };
  selectConfig?: { activeValue?: unknown };
  goodsLabel?: DiyGroup;
  goodsSort?: number | string;
  numConfig?: { val?: number | string | undefined };
  goodsList?: { max?: unknown; list?: unknown[] | undefined };
  [key: string]: unknown;
}

export interface DiyPromotionTabsFieldProps extends DiyFieldProps<DiyListBox> {
  label?: string | undefined;
  /** `styleConfig.tabVal` of the owning component. */
  style?: number | undefined;
}

const SOURCES = [
  { label: '指定商品', value: 1 },
  { label: '指定分类', value: 3 },
  { label: '商品标签', value: 4 },
];

const SORTS = [
  { label: '综合', value: 0 },
  { label: '销量', value: 1 },
  { label: '价格', value: 2 },
];

export function DiyPromotionTabsField({
  value,
  onChange,
  disabled = false,
  label,
  style = 1,
}: DiyPromotionTabsFieldProps) {
  const config = value ?? {};
  const rows = (config.list ?? []) as DiyPromotionRow[];
  const template = rows[rows.length - 1];

  return (
    <DiySortableListField<DiyPromotionRow>
      value={config}
      onChange={onChange}
      disabled={disabled}
      label={label ?? config.title}
      addText="添加"
      newItem={() => {
        const next = structuredClone(template ?? {});
        return {
          ...next,
          tabVal: 1,
          selectConfig: { activeValue: [] },
          goodsLabel: { activeValue: [], list: [] },
          goodsSort: 0,
          numConfig: { ...(next.numConfig ?? {}), val: 6 },
          goodsList: { ...(next.goodsList ?? {}), list: [] },
          productList: { list: [] },
        };
      }}
      renderItem={(row, set) => {
        const source = Number(row.tabVal ?? 1);
        const fields = row.chiild ?? [];
        const shown = style === 0 ? fields.slice(0, 2) : fields.slice(0, 1);
        const brands = row.brandConfig?.brandVal ?? [];

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {shown.map((field, index) => (
              <DiyFieldRow key={index} label={field?.title}>
                <Input
                  disabled={disabled}
                  value={String(field?.val ?? '')}
                  placeholder={field?.pla}
                  maxLength={Number(field?.max ?? 0) || undefined}
                  onChange={(event) => {
                    const next = [...fields];
                    next[index] = { ...(next[index] ?? {}), val: event.target.value };
                    set({ ...row, chiild: next });
                  }}
                />
              </DiyFieldRow>
            ))}

            {style === 4 ? (
              <DiyImageField
                value={row.image ?? ''}
                onChange={(image) => set({ ...row, image })}
                disabled={disabled}
                label="上传图片"
                size={56}
              />
            ) : null}

            <DiyFieldRow label="选择方式">
              <Select
                disabled={disabled}
                style={{ width: '100%' }}
                value={source}
                options={SOURCES}
                onChange={(next) => set({ ...row, tabVal: next })}
              />
            </DiyFieldRow>

            {source === 1 ? (
              <DiyProductPickerField
                value={row.goodsList}
                onChange={(next) => set({ ...row, goodsList: next })}
                disabled={disabled}
                label="选择商品"
              />
            ) : null}

            {source === 2 ? (
              <DiyFieldRow label="品牌名称">
                <Select
                  disabled
                  style={{ width: '100%' }}
                  mode="multiple"
                  value={brands as (string | number)[]}
                  options={brands.map((id) => ({
                    label: String(id),
                    value: id as string | number,
                  }))}
                />
              </DiyFieldRow>
            ) : null}

            {source === 3 ? (
              <DiyCategoryPickerField
                value={{ title: '商品分类', activeValue: row.selectConfig?.activeValue }}
                onChange={(next) =>
                  set({
                    ...row,
                    selectConfig: { ...(row.selectConfig ?? {}), activeValue: next.activeValue },
                  })
                }
                disabled={disabled}
                multiple
              />
            ) : null}

            {source === 4 ? (
              <DiyGoodsLabelField
                value={row.goodsLabel}
                onChange={(next) => set({ ...row, goodsLabel: next })}
                disabled={disabled}
              />
            ) : null}

            {source === 1 ? null : (
              <>
                <DiySliderField
                  value={{ title: '商品数量', ...(row.numConfig ?? {}) }}
                  onChange={(next) =>
                    set({
                      ...row,
                      numConfig: {
                        ...(row.numConfig ?? {}),
                        val: next.val as number | string | undefined,
                      },
                    })
                  }
                  disabled={disabled}
                  min={1}
                  max={100}
                />
                <DiyFieldRow label="商品排序">
                  <Radio.Group
                    disabled={disabled}
                    options={SORTS}
                    value={Number(row.goodsSort ?? 0)}
                    onChange={(event) => set({ ...row, goodsSort: event.target.value })}
                  />
                </DiyFieldRow>
              </>
            )}
          </div>
        );
      }}
    />
  );
}
