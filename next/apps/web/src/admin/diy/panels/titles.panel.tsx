'use client';

import { titlesSchema, type TitlesComponent } from '@shop/contracts/diy/schema/titles.schema';

import { titlesDefault } from '../defaults/titles.default';
import {
  DiyColourField,
  DiyFilletField,
  DiyInputField,
  DiyLinkField,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiySpacingField,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 文本标题 — the reference panel for "a small component with a link".
 *
 * Note `linkConfig` is an *input* object (`{title, value, place, max,
 * type:'link'}`) holding a bare path, not a link object. The field editor
 * below keeps that shape, so the saved bytes are unchanged.
 */
export default defineDiyPanel<TitlesComponent>({
  key: 'titles',
  schema: titlesSchema,
  createDefault: () => structuredClone(titlesDefault),
  label: '文本标题',
  description: '一行标题加可选的右侧入口按钮',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const showsButton = Number(value.buttonConfig?.tabVal ?? 0) === 0;

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '标题设置'} when={f.tab === 0}>
          <DiyInputField {...f.bind('titleConfig')} />
          <DiyTabsField {...f.bind('buttonConfig')} />
          {showsButton ? (
            <>
              <DiyInputField {...f.bind('titleConfigRight')} />
              <DiyLinkField
                value={String(value.linkConfig?.value ?? '')}
                onChange={(url) =>
                  f.patch({ linkConfig: { ...(value.linkConfig ?? {}), value: url } })
                }
                disabled={ctx.disabled}
                label={value.linkConfig?.title ?? '链接'}
              />
            </>
          ) : null}
        </DiySection>

        <DiySection title={value.titleRight ?? '文字设置'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('textPosition')} />
          <DiyTabsField {...f.bind('textStyle')} />
          <DiySliderField {...f.bind('fontSize')} max={40} />
          <DiyColourField {...f.bind('themeColor')} />
          {showsButton ? (
            <>
              <DiySliderField {...f.bind('buttonText')} max={30} />
              <DiyColourField {...f.bind('buttonColor')} />
            </>
          ) : null}
        </DiySection>

        <DiySection title={value.titleCurrency ?? '通用样式'} when={f.tab === 1}>
          <DiyColourField {...f.bind('moduleColor')} stops={2} />
          <DiyColourField {...f.bind('bottomBgColor')} />
          <DiySpacingField {...f.bind('paddingConfig')} />
          <DiySpacingField {...f.bind('marginConfig')} />
          <DiyFilletField {...f.bind('fillet')} />
        </DiySection>
      </>
    );
  },
});
