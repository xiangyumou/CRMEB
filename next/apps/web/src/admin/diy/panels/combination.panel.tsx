'use client';

import {
  combinationSchema,
  type CombinationComponent,
} from '@shop/contracts/diy/schema/combination.schema';

import { combinationDefault } from '../defaults/combination.default';
import {
  DiyCheckboxField,
  DiyColourField,
  DiyCommonStyleSection,
  DiyFilletField,
  DiyInputField,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiyTabsField,
  DiyUploadField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 拼团 — ports `c_home_pink.vue`, five indices and 26 `rCom` permutations.
 *
 * The permutations collapse to five independent rules:
 *
 * - `styleConfig.tabVal` — `0` 颜色背景 keeps the header on a colour, so it owns
 *   `headerBgColor`, `imgColorConfig`, `headerBntColor2` and `tipsColor2`;
 *   anything else is 图片背景 and swaps to `imgBgConfig` / `imgConfig` /
 *   `headerBntColor` / `tipsColor`. The two sets never appear together.
 * - `titleConfig.tabVal` — `0` 图片标题, otherwise 文字标题, which unlocks
 *   `titleText` / `titleColor` / `titleNumber`.
 * - `goodStyleConfig.tabVal` — `2` and `3` are the two list layouts, which have
 *   no 拼团人数 switch (`pinkConfig`) and no cart button.
 * - `pinkConfig.tabVal` — `0` shows the join button, hence `goodsBntColor`.
 * - `toneConfig.tabVal` — `0` follows the theme; custom unlocks the price and
 *   label colours.
 *
 * The products are not picked here. 拼团 shows the live 拼团 list capped by
 * `numberConfig`, which is why the Vue file has no `c_goods` anywhere.
 */
export default defineDiyPanel<CombinationComponent>({
  key: 'combination',
  schema: combinationSchema,
  createDefault: () => structuredClone(combinationDefault),
  label: '拼团',
  description: '拼团活动区块，带头部横幅与商品列表',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const colourHeader = Number(value.styleConfig?.tabVal ?? 0) === 0;
    const textTitle = Number(value.titleConfig?.tabVal ?? 0) !== 0;
    const layout = Number(value.goodStyleConfig?.tabVal ?? 0);
    const asList = layout === 2 || layout === 3;
    const showsJoinButton = Number(value.pinkConfig?.tabVal ?? 0) === 0;
    const customTone = Number(value.toneConfig?.tabVal ?? 0) !== 0;

    return (
      <>
        <DiyTabsField {...f.bind('goodStyleConfig')} label="商品样式" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.bgTitle ?? '背景设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('styleConfig')} />
          {colourHeader ? null : <DiyUploadField {...f.bind('imgBgConfig')} label="背景图片" />}
          <DiyTabsField {...f.bind('titleConfig')} />
          {textTitle ? (
            <DiyInputField {...f.bind('titleTxtConfig')} />
          ) : colourHeader ? (
            <DiyUploadField {...f.bind('imgColorConfig')} label="标题图片" />
          ) : (
            <DiyUploadField {...f.bind('imgConfig')} label="标题图片" />
          )}
          <DiyInputField {...f.bind('rightBntConfig')} />
        </DiySection>

        <DiySection title={value.titleGoods ?? '商品设置'} when={f.tab === 0}>
          <DiySliderField {...f.bind('numberConfig')} max={50} />
          <DiyCheckboxField {...f.bind('checkboxInfo')} />
          {asList ? null : <DiyTabsField {...f.bind('pinkConfig')} />}
        </DiySection>

        <DiySection title={value.titleRight ?? '头部样式'} when={f.tab === 1}>
          {colourHeader ? <DiyColourField {...f.bind('headerBgColor')} /> : null}
          {textTitle ? (
            <>
              <DiyTabsField {...f.bind('titleText')} />
              <DiyColourField {...f.bind('titleColor')} />
              <DiySliderField {...f.bind('titleNumber')} max={40} />
            </>
          ) : null}
          <DiyColourField
            {...(colourHeader ? f.bind('headerBntColor2') : f.bind('headerBntColor'))}
          />
          <DiySliderField {...f.bind('bntNumber')} max={40} />
          <DiyColourField {...(colourHeader ? f.bind('tipsColor2') : f.bind('tipsColor'))} />
        </DiySection>

        <DiySection title={value.titleGoodsStyle ?? '商品样式'} when={f.tab === 1}>
          <DiyColourField {...f.bind('dividerColor')} />
          <DiyFilletField {...f.bind('filletImg')} />
          <DiyTabsField {...f.bind('goodsName')} />
          <DiyColourField {...f.bind('goodsNameColor')} />
          <DiyColourField {...f.bind('goodsPriceColor')} />
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('pinkPriceColor')} />
              <DiyColourField {...f.bind('labelColor')} />
              {!asList && showsJoinButton ? (
                <>
                  <DiyColourField {...f.bind('goodsBntColor')} />
                  <DiyColourField {...f.bind('goodsBntTxtColor')} />
                </>
              ) : null}
            </>
          ) : null}
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
