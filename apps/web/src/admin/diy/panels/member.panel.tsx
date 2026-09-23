'use client';

import type {
  DiyColour,
  DiyFillet,
  DiyInput,
  DiyListBox,
  DiySlider,
  DiySpacing,
  DiyTabs,
  DiyUpload,
} from '@shop/contracts/diy/schema/primitives';
import { memberSchema, type MemberComponent } from '@shop/contracts/diy/schema/member.schema';

import { memberDefault } from '../defaults/member.default';
import {
  DiyCheckboxField,
  DiyColourField,
  DiyCommonStyleSection,
  DiyFilletField,
  DiyInputField,
  DiyLinkField,
  DiyMenuListField,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiySpacingField,
  DiyTabsField,
  DiyUploadField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import type { DiyIconStyleValue } from './_fields';
import { DiyIconStyleField } from './_fields';

/**
 * 会员中心, the panel with the largest key set (about
 * eighty) and five indices that rearrange it:
 *
 * - `styleConfig.tabVal` — the card layout, 样式一…样式五. `0` / `2` / `4` have an
 *   操作内容 menu; `3` has a 右侧入口 list and a module style block.
 * - `memberStyleConfig.tabVal` — the 会员卡 inside the card, 样式一…样式四. `0` has
 *   the two-row `memberConfig`; `1` the whole `ms2*` family; `2` the `ms3*`
 *   one; `3` only a background mode (`ms4BgMode`).
 * - `assetMode.tabVal` — `0` 数据展示 (a layout radio and the 数据内容 checkboxes,
 *   styled by `dataTitleColor` / `dataNumColor`), `1` 图文展示 (the `assetConfig`
 *   list, styled by the four `asset*` keys).
 * - `ms2TitleType.tabVal` / `ms3BgMode.tabVal` / `ms4BgMode.tabVal` — text or
 *   image, colour or image.
 *
 * Three deliberate choices:
 *
 * - **Opening a node never writes to it.** A row whose group the node does not
 *   have simply does not draw. `member.default.ts` carries every group, so a
 *   fresh 会员中心 is fully configurable, and an older node keeps exactly the
 *   groups it was saved with.
 * - **Picking a layout never rewrites stored colours.** Swapping `#fff` for
 *   `#333` in `nameColor`, `numColor`, `dataNumColor`, `dataTitleColor` and both
 *   `componentBgConfig` stops on a move to 样式四 / 样式五 would be a guess at
 *   what the operator wanted that silently discards colours they picked, and it
 *   would make picking a layout a destructive edit. The layout is written; the
 *   colours are left alone.
 * - **模块样式 is editable.** `moduleStyleText` / `moduleBgColor` /
 *   `moduleTextColor` / `moduleRadius` are read by the storefront renderer, so
 *   they are rendered here, under 模块样式, for 样式四 — the only layout that
 *   has the modules they style.
 *
 * `logoConfig` and `titleImg` are in the factory default (inherited from
 * 用户信息) but are not operator settings of 会员中心. No row here; the value
 * round-trips.
 */
export default defineDiyPanel<MemberComponent>({
  key: 'member',
  schema: memberSchema,
  createDefault: () => structuredClone(memberDefault),
  label: '会员中心',
  description: '个人中心的会员卡、资产入口与操作菜单',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const off = ctx.disabled;

    const index = (key: string): number =>
      Number((value[key] as { tabVal?: unknown } | undefined)?.tabVal ?? 0);
    const style = index('styleConfig');
    const memberStyle = index('memberStyleConfig');
    const assetMode = index('assetMode');
    const listStyle = (key: string): number =>
      Number((value[key] as { listStyle?: unknown } | undefined)?.listStyle ?? -1);

    /** Replaces one top-level key, spreading the node first. */
    const set = (key: string, next: unknown): void =>
      onChange({ ...value, [key]: next } as MemberComponent);

    // Every row is conditional on its key being present, so a node that never had the group keeps not having
    // it rather than gaining one the moment the panel opens.
    const colour = (key: string) =>
      value[key] ? (
        <DiyColourField
          value={value[key] as DiyColour}
          onChange={(next) => set(key, next)}
          disabled={off}
        />
      ) : null;
    const slider = (key: string) =>
      value[key] ? (
        <DiySliderField
          value={value[key] as DiySlider}
          onChange={(next) => set(key, next)}
          disabled={off}
        />
      ) : null;
    const radio = (key: string) =>
      value[key] ? (
        <DiyTabsField
          value={value[key] as DiyTabs}
          onChange={(next) => set(key, next)}
          disabled={off}
        />
      ) : null;
    const text = (key: string) =>
      value[key] ? (
        <DiyInputField
          value={value[key] as DiyInput}
          onChange={(next) => set(key, next)}
          disabled={off}
        />
      ) : null;
    /** `c_input_item` whose title is 按钮链接 — a link picker. */
    const link = (key: string) => {
      const config = value[key] as DiyInput | undefined;
      if (!config) return null;
      return (
        <DiyLinkField
          value={String(config.value ?? '')}
          onChange={(next) => set(key, { ...config, value: next })}
          disabled={off}
          label={config.title ?? '链接'}
        />
      );
    };
    const upload = (key: string) => {
      const config = value[key] as (DiyUpload & { name?: string }) | undefined;
      if (!config) return null;
      return (
        <DiyUploadField
          value={config}
          onChange={(next) => set(key, next)}
          disabled={off}
          label={config.name ?? config.title ?? '上传图片'}
          {...(typeof config.info === 'string' ? { tip: config.info } : {})}
        />
      );
    };
    const fillet = (key: string) =>
      value[key] ? (
        <DiyFilletField
          value={value[key] as DiyFillet}
          onChange={(next) => set(key, next)}
          disabled={off}
        />
      ) : null;
    const spacing = (key: string) =>
      value[key] ? (
        <DiySpacingField
          value={value[key] as DiySpacing}
          onChange={(next) => set(key, next)}
          disabled={off}
        />
      ) : null;
    const menu = (
      key: string,
      options?: {
        styleSwitch?: boolean;
        styleOptions?: readonly { label: string; value: number }[];
      },
    ) =>
      value[key] ? (
        <DiyMenuListField
          value={value[key] as DiyListBox}
          onChange={(next) => set(key, next)}
          disabled={off}
          styleSwitch={options?.styleSwitch ?? listStyle(key) !== -1}
          {...(options?.styleOptions ? { styleOptions: options.styleOptions } : {})}
        />
      ) : null;

    const iconStyle = value.iconStyleConfig as DiyIconStyleValue | undefined;
    // `c_icon_style` is spliced in only for the layouts with a menu, and only
    // while that menu is in 图标 mode.
    const iconMode =
      (style === 0 || style === 2 || style === 4) &&
      (listStyle('menuConfig') === 1 || listStyle('shortcutConfig') === 1);

    return (
      <>
        <DiyTabsField {...f.bind('styleConfig')} label="选择风格" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '展示设置'} when={f.tab === 0}>
          {radio('userInfoConfig')}
          {radio('memberStyleConfig')}
          {style === 0 || style === 2 || style === 4 ? menu('menuConfig') : null}
          {radio('assetMode')}
          {assetMode === 0 ? (
            <>
              {radio('dataStyle')}
              <DiyCheckboxField {...f.bind('checkboxInfo')} />
            </>
          ) : (
            menu('assetConfig', {
              styleOptions: [
                { label: '图片', value: 0 },
                { label: '图标', value: 1 },
                { label: '数字(上)', value: 2 },
                { label: '数字(左)', value: 3 },
              ],
            })
          )}
          {memberStyle === 0 ? menu('memberConfig') : null}
        </DiySection>

        <DiySection
          title={value.infoStyleText ?? '会员信息'}
          when={f.tab === 0 && memberStyle === 1}
        >
          {radio('ms2TitleType')}
          {index('ms2TitleType') === 0 ? text('ms2TitleText') : upload('ms2TitleImage')}
          {text('ms2IntroText')}
          {menu('ms2RightsList')}
          {upload('ms2ExplainIcons')}
          {text('ms2ExplainText')}
          {text('ms2ButtonText')}
          {link('ms2ButtonLink')}
        </DiySection>

        <DiySection
          title={value.infoStyleText ?? '会员信息'}
          when={f.tab === 0 && memberStyle === 2}
        >
          {text('ms3TitleText')}
          {text('ms3ButtonText')}
        </DiySection>

        <DiySection title="右侧入口" when={f.tab === 0 && style === 3}>
          {menu('rightEntryConfig')}
        </DiySection>

        <DiySection title={value.infoStyleText ?? '会员信息'} when={f.tab === 1}>
          {colour('nameColor')}
          {slider('nameSize')}
          {colour('numColor')}
          {slider('numSize')}
        </DiySection>

        <DiySection title={value.iconStyleText ?? '图标样式'} when={f.tab === 1}>
          {assetMode === 0 ? (
            <>
              {colour('dataTitleColor')}
              {colour('dataNumColor')}
            </>
          ) : (
            <>
              {colour('assetIconColor')}
              {slider('assetIconSize')}
              {colour('assetTextColor')}
              {slider('assetTextSize')}
            </>
          )}
          {iconMode && iconStyle ? (
            <DiyIconStyleField
              value={iconStyle}
              onChange={(next) => set('iconStyleConfig', next)}
              disabled={off}
            />
          ) : null}
        </DiySection>

        <DiySection title={value.memberStyleText ?? '会员样式'} when={f.tab === 1}>
          {/* 样式三 and 样式四 of the card bring their own background mode. */}
          {memberStyle !== 2 && memberStyle !== 3 ? colour('cardBgColor') : null}

          {memberStyle === 1 ? (
            <>
              {index('ms2TitleType') === 0 ? colour('ms2TitleColor') : null}
              {colour('ms2IntroColor')}
              {colour('ms2RightsColor')}
              {colour('ms2ExplainColor')}
              {colour('ms2ButtonBgColor')}
              {colour('ms2ButtonColor')}
            </>
          ) : null}

          {memberStyle === 2 ? (
            <>
              {radio('ms3BgMode')}
              {index('ms3BgMode') === 0 ? colour('cardBgColor') : upload('ms3BackgroundImage')}
              {colour('ms3TitleColor')}
              {colour('ms3ButtonColor')}
              {spacing('ms3PaddingConfig')}
            </>
          ) : null}

          {memberStyle === 3 ? (
            <>
              {radio('ms4BgMode')}
              {index('ms4BgMode') === 0 ? colour('cardBgColor') : upload('ms4BackgroundImage')}
            </>
          ) : null}

          {/* 样式四 of the card is the one variant with no radius row. */}
          {memberStyle === 1 || memberStyle === 2 || style === 3 ? fillet('cardBgRadius') : null}
        </DiySection>

        <DiySection
          title={(value.moduleStyleText as string | undefined) ?? '模块样式'}
          when={f.tab === 1 && style === 3}
        >
          {colour('moduleBgColor')}
          {colour('moduleTextColor')}
          {fillet('moduleRadius')}
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
