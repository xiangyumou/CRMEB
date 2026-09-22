'use client';

import { newsSchema, type NewsComponent } from '@shop/contracts/diy/schema/news.schema';

import { newsDefault } from '../defaults/news.default';
import {
  DiyColourField,
  DiyCommonStyleSection,
  DiyInputField,
  DiyLinkField,
  DiySection,
  DiySetUpTabs,
  DiyTabsField,
  DiyUploadField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyChildRowsField } from './_fields';

/**
 * 新闻公告 — ports `c_news_roll.vue`.
 *
 * The Vue file states the same rule five times, once per `watch`er, in 450
 * lines of nested `if`. Reduced to its four indices:
 *
 * - `styleConfig.tabVal` — `0` 样式一 scrolls, so it offers 滚动方式; 样式二 does
 *   not scroll and instead offers the header link.
 * - `titleConfig.tabVal` — `0` 图片 titles take `imgConfig`, `1` 文字 titles take
 *   `titleTxtConfig` and unlock the title colours.
 * - `buttonConfig.tabVal` — `0` 显示 shows the button and its colour.
 * - `toneConfig.tabVal` — the title background and text colours, 样式一 only.
 *
 * `textConfig` (右侧文字) and `newsColor` never reach `rCom` in the Vue file and
 * get no control here either.
 */
export default defineDiyPanel<NewsComponent>({
  key: 'news',
  schema: newsSchema,
  createDefault: () => structuredClone(newsDefault),
  label: '新闻公告',
  description: '滚动公告条，可配标题图与跳转',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const scrolling = Number(value.styleConfig?.tabVal ?? 0) === 0;
    const textTitle = Number(value.titleConfig?.tabVal ?? 0) === 1;
    const showsButton = Number(value.buttonConfig?.tabVal ?? 0) === 0;
    const customTone = Number(value.toneConfig?.tabVal ?? 0) !== 0;

    return (
      <>
        <DiyTabsField {...f.bind('styleConfig')} label="选择风格" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleStyle ?? '标题设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('titleConfig')} />
          {textTitle ? (
            <DiyInputField {...f.bind('titleTxtConfig')} />
          ) : (
            <DiyUploadField
              {...f.bind('imgConfig')}
              label={value.imgConfig?.name ?? '上传图片'}
              tip={typeof value.imgConfig?.info === 'string' ? value.imgConfig.info : undefined}
            />
          )}
          {scrolling ? <DiyTabsField {...f.bind('rollConfig')} /> : null}
        </DiySection>

        <DiySection title={value.titleButton ?? '按钮设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('buttonConfig')} />
          {/* 样式二 has no scroller, so its whole header is one link. */}
          {!scrolling && showsButton ? (
            <DiyLinkField
              value={String(value.linkConfig?.value ?? '')}
              onChange={(url) =>
                f.patch({ linkConfig: { ...(value.linkConfig ?? {}), value: url } })
              }
              disabled={ctx.disabled}
              label={value.linkConfig?.title ?? '链接'}
            />
          ) : null}
        </DiySection>

        <DiySection title={value.titleContent ?? '内容设置'} when={f.tab === 0}>
          <DiyChildRowsField {...f.bind('listConfig')} addText="添加公告" />
        </DiySection>

        <DiySection title={value.titleRight ?? '样式设置'} when={f.tab === 1}>
          {showsButton ? <DiyColourField {...f.bind('bntColor')} /> : null}
          {textTitle ? (
            <>
              {scrolling ? <DiyTabsField {...f.bind('toneConfig')} /> : null}
              {scrolling && customTone ? <DiyColourField {...f.bind('titleBgColor')} /> : null}
              {!scrolling || customTone ? <DiyColourField {...f.bind('titleColor')} /> : null}
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
