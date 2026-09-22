'use client';

import type {
  DiyBorderConfig,
  DiyColour,
  DiyComponentBgConfig,
  DiyFillet,
  DiyShadowConfig,
  DiySpacing,
  DiyTabs,
  DiyUpload,
} from '@shop/contracts/diy/schema/primitives';
import { Fragment } from 'react';

import type { DiyComponentValue } from '../panel-api';
import { DiyColourField, DiySliderField, DiyTabsField } from './basic-fields';
import { DiyFilletField, DiySpacingField } from './box-fields';
import { DiyUploadField } from './media-fields';
import { DiySection } from './section';

/**
 * 通用样式 — a faithful port of
 * `template/admin/src/components/mobileConfigRight/c_common_style.vue`.
 *
 * Composed entirely from the other field editors in this directory; nothing
 * here forks or reimplements one. It exists because the legacy editor renders
 * exactly this block, in exactly this order, at the bottom of the 样式设置 tab of
 * 32 of the 33 config panels, and repeating twelve fields in every panel is how
 * the order drifts.
 *
 * Three details copied verbatim from the Vue file:
 *
 * - every row is conditional on the key being **present in the node**
 *   (`v-if="configObj.moduleColor"`), never on a default. A page saved by an
 *   older build has no `componentBgConfig`, and the legacy panel simply did not
 *   draw it rather than inventing one — writing a fresh group in would change
 *   bytes the renderer reads.
 * - `zIndexConfig` is commented out at `c_common_style.vue:5`. It stays out
 *   here too, so the value survives untouched instead of becoming editable in
 *   a place the old admin never offered.
 * - `marginConfig` really is rendered **before** `paddingConfig` (`:27-28`).
 */

export interface DiyCommonStyleSectionProps<T extends DiyComponentValue> {
  value: T;
  onChange: (next: T) => void;
  disabled: boolean;
  /** Shown when the node carries no `titleCurrency`. */
  title?: string | undefined;
  /** Hides the whole block — pass `f.tab === 1`. */
  when?: boolean | undefined;
}

/**
 * Which node keys the block edits. `c_data_style` is the same nine editors over
 * a second, parallel set of keys (`…DataConfig`), so the block is written once
 * and pointed at either set rather than copied.
 */
interface StyleKeys {
  /** Colours above the background group, in order. */
  leading: readonly string[];
  bg: string;
  fillet: string;
  /** Colours between the fillet and the spacing rows, in order. */
  trailing: readonly string[];
  margin: string;
  padding: string;
  border: string;
  shadow: string;
}

const COMMON_KEYS: StyleKeys = {
  leading: ['moduleColor', 'bgColor'],
  bg: 'componentBgConfig',
  fillet: 'fillet',
  trailing: ['bottomBgColor', 'textColor'],
  margin: 'marginConfig',
  padding: 'paddingConfig',
  border: 'borderConfig',
  shadow: 'shadowConfig',
};

const DATA_KEYS: StyleKeys = {
  leading: [],
  bg: 'componentBgDataConfig',
  fillet: 'filletDataConfig',
  trailing: [],
  margin: 'marginDataConfig',
  padding: 'paddingDataConfig',
  border: 'borderDataConfig',
  shadow: 'shadowDataConfig',
};

/**
 * 数据样式 — a faithful port of `c_data_style.vue`, the second style block that
 * only 超级组件 (`customComponent`) has. Same nine editors, the `…DataConfig`
 * keys, and no colour rows.
 *
 * The legacy panel *creates* these six groups on open
 * (`c_custom_component.vue:patchConfig`) because the factory default has none
 * of them. This block does not: it draws what the node carries, so opening a
 * page and saving it cannot add eight objects the renderer never had.
 */
export function DiyDataStyleSection<T extends DiyComponentValue>(
  props: DiyCommonStyleSectionProps<T>,
) {
  return (
    <StyleBlock {...props} keys={DATA_KEYS} fallbackTitle="数据样式" titleKey="dataStyleTitle" />
  );
}

export function DiyCommonStyleSection<T extends DiyComponentValue>(
  props: DiyCommonStyleSectionProps<T>,
) {
  return (
    <StyleBlock {...props} keys={COMMON_KEYS} fallbackTitle="通用样式" titleKey="titleCurrency" />
  );
}

function StyleBlock<T extends DiyComponentValue>({
  value,
  onChange,
  disabled,
  title,
  when = true,
  keys,
  fallbackTitle,
  titleKey,
}: DiyCommonStyleSectionProps<T> & {
  keys: StyleKeys;
  fallbackTitle: string;
  titleKey: string;
}) {
  /** Replaces one top-level key. Spread first, so nothing else moves. */
  const set = (key: string, next: unknown): void =>
    onChange({ ...value, [key]: next } as unknown as T);

  /** Merges into one of the three composite groups, keeping its other keys. */
  const setIn = (group: string, key: string, next: unknown): void =>
    set(group, { ...((value[group] ?? {}) as object), [key]: next });

  const bg = value[keys.bg] as DiyComponentBgConfig | undefined;
  const border = value[keys.border] as DiyBorderConfig | undefined;
  const shadow = value[keys.shadow] as DiyShadowConfig | undefined;

  const colour = (key: string) =>
    value[key] ? (
      <DiyColourField
        value={value[key] as DiyColour}
        onChange={(next) => set(key, next)}
        disabled={disabled}
      />
    ) : null;

  return (
    <DiySection
      title={(value[titleKey] as string | undefined) ?? title ?? fallbackTitle}
      when={when}
    >
      {keys.leading.map((key) => (
        <Fragment key={key}>{colour(key)}</Fragment>
      ))}

      {bg ? (
        <>
          <DiyTabsField
            value={bg as DiyTabs}
            onChange={(next) => set(keys.bg, next)}
            disabled={disabled}
          />
          {Number(bg.tabVal ?? 0) === 0 ? (
            <>
              <DiyColourField
                value={bg.colorConfig}
                onChange={(next) => setIn(keys.bg, 'colorConfig', next)}
                disabled={disabled}
              />
              <DiyTabsField
                value={bg.colorDirection}
                onChange={(next) => setIn(keys.bg, 'colorDirection', next)}
                disabled={disabled}
              />
            </>
          ) : (
            <DiyUploadField
              value={bg.imageConfig as DiyUpload | undefined}
              onChange={(next) => setIn(keys.bg, 'imageConfig', next)}
              disabled={disabled}
              label={(bg.imageConfig as { header?: string } | undefined)?.header ?? '背景图片'}
              tip={(bg.imageConfig as { info?: string } | undefined)?.info}
            />
          )}
        </>
      ) : null}

      {value[keys.fillet] ? (
        <DiyFilletField
          value={value[keys.fillet] as DiyFillet}
          onChange={(next) => set(keys.fillet, next)}
          disabled={disabled}
        />
      ) : null}
      {keys.trailing.map((key) => (
        <Fragment key={key}>{colour(key)}</Fragment>
      ))}
      {[keys.margin, keys.padding].map((key) =>
        value[key] ? (
          <DiySpacingField
            key={key}
            value={value[key] as DiySpacing}
            onChange={(next) => set(key, next)}
            disabled={disabled}
          />
        ) : null,
      )}

      {border ? (
        <>
          <DiyTabsField
            value={border as DiyTabs}
            onChange={(next) => set(keys.border, next)}
            disabled={disabled}
          />
          {Number(border.tabVal ?? 0) === 1 ? (
            <>
              <DiyTabsField
                value={border.styleConfig}
                onChange={(next) => setIn(keys.border, 'styleConfig', next)}
                disabled={disabled}
              />
              <DiySliderField
                value={border.widthConfig}
                onChange={(next) => setIn(keys.border, 'widthConfig', next)}
                disabled={disabled}
                min={1}
                max={20}
              />
              <DiyColourField
                value={border.colorConfig}
                onChange={(next) => setIn(keys.border, 'colorConfig', next)}
                disabled={disabled}
              />
            </>
          ) : null}
        </>
      ) : null}

      {shadow ? (
        <>
          <DiyTabsField
            value={shadow as DiyTabs}
            onChange={(next) => set(keys.shadow, next)}
            disabled={disabled}
          />
          {Number(shadow.tabVal ?? 0) === 1 ? (
            <>
              <DiyColourField
                value={shadow.colorConfig}
                onChange={(next) => setIn(keys.shadow, 'colorConfig', next)}
                disabled={disabled}
              />
              {(['xConfig', 'yConfig', 'blurConfig', 'spreadConfig'] as const).map((key) => (
                <DiySliderField
                  key={key}
                  value={shadow[key]}
                  onChange={(next) => setIn(keys.shadow, key, next)}
                  disabled={disabled}
                  min={key === 'blurConfig' ? 0 : -50}
                  max={50}
                />
              ))}
            </>
          ) : null}
        </>
      ) : null}
    </DiySection>
  );
}
