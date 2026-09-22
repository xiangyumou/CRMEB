'use client';

import { homeCombSchema, type HomeCombComponent } from '@shop/contracts/diy/schema/homeComb.schema';

import { homeCombDefault } from '../defaults/homeComb.default';
import {
  DiyColourField,
  DiyCommonStyleSection,
  DiyFilletField,
  DiyHotWordField,
  DiyInputField,
  DiyMenuListField,
  DiyNumberField,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiyTabsField,
  DiyUploadField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyTabListField } from './_fields';

/**
 * 组合组件 — ports `c_home_comb.vue`: the page header, search box, category tabs
 * and banner as one block.
 *
 * Four indices (`getRComContent` / `getRComStyle`, `:305-345`):
 *
 * - `classConfig.tabVal` — `0` 显示 shows the category tabs and, in 样式设置, the
 *   tab spacing and colour. `1` 隐藏 removes both.
 * - `searchBox.tabVal` — `0` 文字 uses `titleConfig`, otherwise the two logos.
 * - `toneConfig.tabVal` — the indicator colours.
 * - `searchConfig.tabVal` has a watcher but changes nothing; it is read by
 *   `homeComb.vue` for the sticky header.
 *
 * `searchFix` and the single-logo `logoContent` are declared in the Vue file and
 * never reach `rCom`: `getRComContent` unconditionally picks `logoUpContent`,
 * which is both logos (`:307`). Ported as-is.
 */
export default defineDiyPanel<HomeCombComponent>({
  key: 'homeComb',
  schema: homeCombSchema,
  createDefault: () => structuredClone(homeCombDefault),
  label: '组合组件',
  description: '首页头部：搜索、分类选项卡与轮播合成一块',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const showsTabs = Number(value.classConfig?.tabVal ?? 0) === 0;
    const logoBox = Number(value.searchBox?.tabVal ?? 0) !== 0;
    const customTone = Number(value.toneConfig?.tabVal ?? 0) !== 0;

    return (
      <>
        <DiyTabsField {...f.bind('styleConfig')} label="选择风格" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleSearch ?? '搜索设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('classConfig')} />
          <DiyTabsField {...f.bind('searchConfig')} />
          <DiyTabsField {...f.bind('searchBox')} />
          {logoBox ? (
            <>
              <DiyUploadField {...f.bind('logoConfig')} label="logo图" />
              <DiyUploadField {...f.bind('logoUpConfig')} label="上浮logo图" />
            </>
          ) : (
            <DiyInputField {...f.bind('titleConfig')} />
          )}
          <DiyInputField {...f.bind('inputConfig')} />
        </DiySection>

        <DiySection title={value.titleHotWords ?? '搜索热词'} when={f.tab === 0}>
          <DiyHotWordField {...f.bind('hotWords')} />
          <DiyNumberField {...f.bind('numConfig')} />
        </DiySection>

        <DiySection title={value.titleTab ?? '选项卡设置'} when={f.tab === 0 && showsTabs}>
          <DiyTabListField {...f.bind('tabListConfig')} />
        </DiySection>

        <DiySection title={value.titleImg ?? '图片设置'} when={f.tab === 0}>
          <DiyMenuListField {...f.bind('swiperConfig')} styleSwitch={false} />
        </DiySection>

        <DiySection title={value.titleRight ?? '分类样式'} when={f.tab === 1 && showsTabs}>
          <DiySliderField {...f.bind('contentConfig')} max={100} />
          <DiyColourField {...f.bind('classColor')} />
        </DiySection>

        <DiySection title={value.titlePointer ?? '指示器设置'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('docConfig')} />
          <DiyTabsField {...f.bind('docPosition')} />
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('dotColor')} />
              <DiyColourField {...f.bind('dotBgColor')} />
            </>
          ) : null}
        </DiySection>

        <DiySection title={value.titleImg ?? '图片设置'} when={f.tab === 1}>
          <DiyFilletField {...f.bind('filletImg')} />
        </DiySection>

        <DiySection title={value.titleGradient ?? '渐变背景'} when={f.tab === 1}>
          <DiyColourField {...f.bind('gradientColor')} stops={2} />
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
