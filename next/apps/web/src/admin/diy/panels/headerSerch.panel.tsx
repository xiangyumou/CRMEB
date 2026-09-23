'use client';

import {
  headerSerchSchema,
  type HeaderSerchComponent,
} from '@shop/contracts/diy/schema/headerSerch.schema';

import { headerSerchDefault } from '../defaults/headerSerch.default';
import {
  DiyColourField,
  DiyCommonStyleSection,
  DiyHotWordField,
  DiyInputField,
  DiyLinkField,
  DiyNumberField,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiyTabsField,
  DiyUploadField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 搜索框.
 *
 * Two indices drive the whole panel:
 *
 * - `styleConfig.tabVal` — `0` 搜索, `1` 标题. The `tabList` has only two
 *   entries, so no other value is reachable from the UI.
 * - `styleTypeConfig.tabVal` — `0` 标题, `1` logo, anything else 固定定位.
 *
 * `searchBoxColor` has no control; the style rows are `tipColor` and
 * `hotWordsColor` only. Left untouched rather than "fixed", because the
 * renderer still reads it and an operator's saved colour is not ours to change.
 */
export default defineDiyPanel<HeaderSerchComponent>({
  key: 'headerSerch',
  schema: headerSerchSchema,
  createDefault: () => structuredClone(headerSerchDefault),
  label: '搜索框',
  description: '顶部搜索框或标题栏，可配搜索热词',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const style = Number(value.styleConfig?.tabVal ?? 0);
    const styleType = Number(value.styleTypeConfig?.tabVal ?? 0);
    const asTitle = style === 1;

    const titleAndLink = (
      <>
        <DiyInputField {...f.bind('titleConfig')} />
        <DiyLinkField
          value={String(value.linkConfig?.value ?? '')}
          onChange={(url) => f.patch({ linkConfig: { ...(value.linkConfig ?? {}), value: url } })}
          disabled={ctx.disabled}
          label={value.linkConfig?.title ?? '链接'}
        />
      </>
    );

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '展示设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('styleConfig')} />
          {asTitle ? (
            <>
              {titleAndLink}
              {value.fixConfig ? <DiyTabsField {...f.bind('fixConfig')} /> : null}
            </>
          ) : (
            <>
              <DiyTabsField {...f.bind('styleTypeConfig')} />
              {styleType === 0 ? titleAndLink : null}
              {styleType === 1 ? (
                <DiyUploadField
                  {...f.bind('logoConfig')}
                  label={value.logoConfig?.name ?? 'logo图'}
                  tip={
                    typeof value.logoConfig?.info === 'string' ? value.logoConfig.info : undefined
                  }
                />
              ) : null}
              {styleType !== 0 && styleType !== 1 && value.fixConfig ? (
                <DiyTabsField {...f.bind('fixConfig')} />
              ) : null}
            </>
          )}
        </DiySection>

        <DiySection title={value.titleSearch ?? '搜索内容'} when={f.tab === 0 && !asTitle}>
          <DiyInputField {...f.bind('tipConfig')} />
        </DiySection>

        <DiySection title={value.titleHotWords ?? '搜索热词'} when={f.tab === 0 && !asTitle}>
          <DiyHotWordField {...f.bind('hotWords')} />
          <DiyNumberField {...f.bind('numConfig')} />
        </DiySection>

        <DiySection title={value.titleRight ?? '搜索框'} when={f.tab === 1 && !asTitle}>
          <DiyColourField {...f.bind('tipColor')} />
          <DiyColourField {...f.bind('hotWordsColor')} />
        </DiySection>

        <DiySection title={value.titleTxt ?? '文字设置'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('txtFixConfig')} />
          {/* 固定定位 (styleTypeConfig 2) hides the text styling — `:293`. */}
          {asTitle || styleType !== 2 ? (
            <>
              <DiyTabsField {...f.bind('txtStyleConfig')} />
              <DiyColourField {...f.bind('txtColor')} />
              <DiySliderField {...f.bind('txtSize')} max={40} />
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
