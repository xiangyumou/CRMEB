'use client';

import type { DiyColour, DiyGroup, DiySlider } from '@shop/contracts/diy/schema/primitives';
import {
  productInfoSchema,
  type ProductInfoComponent,
} from '@shop/contracts/diy/schema/productInfo.schema';
import { Checkbox, Radio, Switch } from 'antd';

import { SortableListField } from '@/admin/kit/form/sortable-list-field';

import { productInfoDefault } from '../defaults/productInfo.default';
import {
  DiyColourField,
  DiyFieldRow,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel, type DiyFieldProps } from '../panel-api';
import { DiyCommonStyleSection } from './_fields';

/**
 * 商品信息 — ports `c_product_info.vue` and the five one-off widgets it is the
 * only user of: `c_product_info_list`, `c_indicator_settings`,
 * `c_title_settings`, `c_spec_settings` and `c_data_settings`. They stay local
 * to this file rather than joining `_fields/`, which is for widgets more than
 * one panel needs.
 *
 * Two shapes worth naming:
 *
 * - The 色调 rows in `titleConfig`, `specSettings` and `priceSettings` store
 *   `tabList[].val`, **not** the tab index (`c_title_settings.vue:11`,
 *   `:label="item.val"`). They happen to coincide today, 0 and 1, and writing
 *   the index instead would be a silent divergence the day a third option is
 *   added. The `val` is what is written.
 * - `sortList.list` is both the order and the visibility of the product page's
 *   sections: dragging reorders, the switch is `show`, and the per-section
 *   checkboxes are `checkList` over `checkBoxList`.
 *
 * `priceSettings` and `dataSettings` are not in the factory default — the
 * legacy panel injects them from its own `defaultConfig` when it opens a node
 * (`c_product_info.vue:266-274`). This panel adds nothing, so those two
 * sections draw for a node that has them and are silent for one that does not.
 * See CR-3-g2, which asks G1 to put them in the default where they belong.
 */

/** 色调 rows whose stored value is `tabList[].val`, not the index. */
function ToneRow({
  value,
  onChange,
  disabled,
  label,
}: DiyFieldProps<DiyGroup> & { label?: string | undefined }) {
  const off = disabled ?? false;
  const config = value ?? {};
  const options = ((config.tabList ?? []) as { name?: string; val?: number }[]).map(
    (item, index) => ({ label: item.name ?? String(index), value: item.val ?? index }),
  );
  return (
    <DiyFieldRow label={label ?? config.title}>
      <Radio.Group
        disabled={off}
        options={options}
        value={config.tabVal}
        onChange={(event) => onChange({ ...config, tabVal: event.target.value })}
      />
    </DiyFieldRow>
  );
}

/** `c_indicator_settings` — 指示器样式, its position, and the two dot colours. */
function IndicatorSettings({ value, onChange, disabled }: DiyFieldProps<DiyGroup>) {
  const off = disabled ?? false;
  const config = value ?? {};
  const style = Number(config.tabVal ?? 0);
  const set = (key: string, next: unknown): void => onChange({ ...config, [key]: next });
  const names = (list: unknown): { label: string; value: number }[] =>
    ((list ?? []) as { name?: string }[]).map((item, index) => ({
      label: item.name ?? String(index),
      value: index,
    }));

  return (
    <>
      <DiyFieldRow label="指示器样式">
        <Radio.Group
          disabled={off}
          options={names(config.tabList)}
          value={style}
          onChange={(event) => set('tabVal', event.target.value)}
        />
      </DiyFieldRow>
      {style !== 0 ? (
        <DiyFieldRow label="指示器位置">
          <Radio.Group
            disabled={off}
            options={names(config.positionList)}
            value={Number(config.positionVal ?? 0)}
            onChange={(event) => set('positionVal', event.target.value)}
          />
        </DiyFieldRow>
      ) : null}
      <DiyColourField
        value={config.selectColor as DiyColour | undefined}
        onChange={(next) => set('selectColor', next)}
        disabled={disabled}
      />
      <DiyColourField
        value={config.defaultColor as DiyColour | undefined}
        onChange={(next) => set('defaultColor', next)}
        disabled={disabled}
      />
    </>
  );
}

/** `c_title_settings` — 色调, the custom colour, and the title's font size. */
function TitleSettings({ value, onChange, disabled }: DiyFieldProps<DiyGroup>) {
  const config = value ?? {};
  const set = (key: string, next: unknown): void => onChange({ ...config, [key]: next });
  return (
    <>
      <ToneRow value={config} onChange={onChange} disabled={disabled} label="颜色设置" />
      {Number(config.tabVal ?? 0) === 1 ? (
        <DiyColourField
          value={config.color as DiyColour | undefined}
          onChange={(next) => set('color', next)}
          disabled={disabled}
        />
      ) : null}
      <DiySliderField
        value={config.fontSize as DiySlider | undefined}
        onChange={(next) => set('fontSize', next)}
        disabled={disabled}
        min={12}
        max={40}
      />
    </>
  );
}

/**
 * `c_spec_settings` — the spec picker's colours.
 *
 * The last three only show for 样式二/三/四 (`c_spec_settings.vue:55-58`), which
 * is why this one needs the component's `specStyle` as well as its own config.
 */
function SpecSettings({
  value,
  onChange,
  disabled,
  specStyle,
}: DiyFieldProps<DiyGroup> & { specStyle: number }) {
  const config = value ?? {};
  const set = (key: string, next: unknown): void => onChange({ ...config, [key]: next });
  const custom = Number((config.colorTone as DiyGroup | undefined)?.tabVal ?? 0) === 1;
  const advanced = specStyle === 1 || specStyle === 2 || specStyle === 3;
  const colour = (key: string) => (
    <DiyColourField
      value={config[key] as DiyColour | undefined}
      onChange={(next) => set(key, next)}
      disabled={disabled}
    />
  );

  return (
    <>
      <ToneRow
        value={config.colorTone as DiyGroup | undefined}
        onChange={(next) => set('colorTone', next)}
        disabled={disabled}
      />
      {custom ? (
        <>
          {colour('textColor')}
          {colour('selectedBorderColor')}
          {advanced ? (
            <>
              {colour('selectedTextColor')}
              {colour('selectedBgColor')}
              {colour('unselectedTextColor')}
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/** `c_price_settings` — 色调, two price colours and the price font size. */
function PriceSettings({ value, onChange, disabled }: DiyFieldProps<DiyGroup>) {
  const config = value ?? {};
  const set = (key: string, next: unknown): void => onChange({ ...config, [key]: next });
  const custom = Number((config.colorTone as DiyGroup | undefined)?.tabVal ?? 0) === 1;
  return (
    <>
      <ToneRow
        value={config.colorTone as DiyGroup | undefined}
        onChange={(next) => set('colorTone', next)}
        disabled={disabled}
      />
      {custom ? (
        <>
          <DiyColourField
            value={config.finalPriceColor as DiyColour | undefined}
            onChange={(next) => set('finalPriceColor', next)}
            disabled={disabled}
          />
          <DiyColourField
            value={config.sellingPriceColor as DiyColour | undefined}
            onChange={(next) => set('sellingPriceColor', next)}
            disabled={disabled}
          />
        </>
      ) : null}
      <DiySliderField
        value={config.priceFontSize as DiySlider | undefined}
        onChange={(next) => set('priceFontSize', next)}
        disabled={disabled}
        min={12}
        max={50}
      />
    </>
  );
}

/** `c_data_settings` — three unconditional colours. */
function DataSettings({ value, onChange, disabled }: DiyFieldProps<DiyGroup>) {
  const config = value ?? {};
  return (
    <>
      {(['originalPriceColor', 'stockColor', 'salesColor'] as const).map((key) => (
        <DiyColourField
          key={key}
          value={config[key] as DiyColour | undefined}
          onChange={(next) => onChange({ ...config, [key]: next })}
          disabled={disabled}
        />
      ))}
    </>
  );
}

interface SortRow {
  name?: string;
  cname?: string;
  type?: string;
  show?: boolean;
  checkList?: (string | number)[];
  checkBoxList?: { name?: string; value?: string | number }[];
  [key: string]: unknown;
}

export default defineDiyPanel<ProductInfoComponent>({
  key: 'productInfo',
  schema: productInfoSchema,
  createDefault: () => structuredClone(productInfoDefault),
  label: '商品信息',
  description: '商品详情的主图、标题、价格与规格区',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const specStyle = Number(value.specStyle?.tabVal ?? 0);
    const patch = (key: string, next: unknown): void =>
      onChange({ ...value, [key]: next } as ProductInfoComponent);
    // Not in the factory default, so the schema types them loosely; see the
    // note above and CR-3-g2.
    const priceSettings = value.priceSettings as DiyGroup | undefined;
    const dataSettings = value.dataSettings as DiyGroup | undefined;

    return (
      <>
        <DiyTabsField {...f.bind('specStyle')} label="规格样式" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.sortList?.title ?? '信息设置'} when={f.tab === 0}>
          {value.sortList?.tips ? (
            <DiyFieldRow>
              <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
                {String(value.sortList.tips)}
              </span>
            </DiyFieldRow>
          ) : null}
          {/* The kit's list directly, not `DiySortableListField`: these four
              sections are fixed slots — they reorder but neither add nor
              remove, which is `min` at the current length and no `newItem`. */}
          <SortableListField<SortRow>
            value={(value.sortList?.list ?? []) as SortRow[]}
            onChange={(next) => patch('sortList', { ...(value.sortList ?? {}), list: next })}
            disabled={ctx.disabled}
            min={(value.sortList?.list ?? []).length}
            renderItem={(row, { set }) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <DiyFieldRow label={row.cname}>
                  {row.type === 'radio' ? (
                    <Switch
                      disabled={ctx.disabled}
                      checked={Boolean(row.show)}
                      onChange={(next) => set({ ...row, show: next })}
                    />
                  ) : null}
                </DiyFieldRow>
                {row.show && row.checkBoxList ? (
                  <Checkbox.Group
                    disabled={ctx.disabled}
                    value={row.checkList ?? []}
                    options={row.checkBoxList.map((item, index) => ({
                      label: item.name ?? String(index),
                      value: item.value ?? index,
                    }))}
                    onChange={(next) => set({ ...row, checkList: next as (string | number)[] })}
                  />
                ) : null}
              </div>
            )}
          />
        </DiySection>

        <DiySection title={value.indicatorConfig?.title ?? '指示器设置'} when={f.tab === 1}>
          <IndicatorSettings
            value={value.indicatorConfig}
            onChange={(next) => patch('indicatorConfig', next)}
            disabled={ctx.disabled}
          />
        </DiySection>

        <DiySection title={value.titleConfig?.title ?? '标题设置'} when={f.tab === 1}>
          <TitleSettings
            value={value.titleConfig}
            onChange={(next) => patch('titleConfig', next)}
            disabled={ctx.disabled}
          />
        </DiySection>

        <DiySection title={value.specSettings?.title ?? '规格设置'} when={f.tab === 1}>
          <SpecSettings
            value={value.specSettings}
            onChange={(next) => patch('specSettings', next)}
            disabled={ctx.disabled}
            specStyle={specStyle}
          />
        </DiySection>

        <DiySection
          title={(priceSettings?.title as string | undefined) ?? '价格设置'}
          when={f.tab === 1 && priceSettings !== undefined}
        >
          <PriceSettings
            value={priceSettings}
            onChange={(next) => patch('priceSettings', next)}
            disabled={ctx.disabled}
          />
        </DiySection>

        <DiySection
          title={(dataSettings?.title as string | undefined) ?? '数据设置'}
          when={f.tab === 1 && dataSettings !== undefined}
        >
          <DataSettings
            value={dataSettings}
            onChange={(next) => patch('dataSettings', next)}
            disabled={ctx.disabled}
          />
        </DiySection>

        <DiyCommonStyleSection
          value={value}
          onChange={onChange}
          disabled={ctx.disabled}
          when={f.tab === 1}
        />
      </>
    );
  },
});
