'use client';

import {
  articleListSchema,
  type ArticleListComponent,
} from '@shop/contracts/diy/schema/articleList.schema';

import { articleListDefault } from '../defaults/articleList.default';
import {
  DiyCategoryPickerField,
  DiyColourField,
  DiyFilletField,
  DiySection,
  DiySetUpTabs,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyCheckboxField, DiyCommonStyleSection, DiyNumberField } from './_fields';

/**
 * 文章列表 — ports `c_new_list.vue`.
 *
 * `selectConfig` is a `c_select` whose options the legacy panel fetched with
 * `categoryList()` on mount and wrote into `selectConfig.list`. A panel may not
 * call a route, so the category tree comes from the `DiyDataSource` port
 * instead; `DiyCategoryPickerField` patches `activeValue` and leaves the stored
 * `list` exactly as it was, so a page saved by the old admin keeps the option
 * labels it was saved with.
 *
 * `likeSuccessColor` is the only tone-gated row (`:71-75`); the four text
 * colours below it are shown whatever the tone is, which reads like an
 * oversight in the Vue file but is what an operator's saved page was edited
 * against. Ported as-is.
 *
 * `goodsList` and `selectList` are in the default and reach `rCom` nowhere.
 */
export default defineDiyPanel<ArticleListComponent>({
  key: 'articleList',
  schema: articleListSchema,
  createDefault: () => structuredClone(articleListDefault),
  label: '文章列表',
  description: '按分类展示文章，三种版式',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const customTone = Number(value.toneConfig?.tabVal ?? 0) !== 0;

    return (
      <>
        <DiyTabsField {...f.bind('styleConfig')} label="选择风格" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleArticle ?? '文章设置'} when={f.tab === 0}>
          {/* `DiyCategoryPickerField` types `activeValue` as `unknown`, which
              is not assignable from the schema's `DiySelection`; spelled out
              rather than spread. See CR-1-g2, note 3. */}
          <DiyCategoryPickerField
            value={value.selectConfig}
            onChange={(next) =>
              f.patch({
                selectConfig: {
                  ...(value.selectConfig ?? {}),
                  activeValue: next.activeValue as never,
                },
              })
            }
            disabled={ctx.disabled}
            kind="article"
          />
          <DiyNumberField {...f.bind('numConfig')} />
        </DiySection>

        <DiySection title={value.titleList ?? '列表设置'} when={f.tab === 0}>
          <DiyCheckboxField {...f.bind('checkboxList')} />
        </DiySection>

        <DiySection title={value.titleRight ?? '样式设置'} when={f.tab === 1}>
          <DiyFilletField {...f.bind('filletImg')} />
          <DiyTabsField {...f.bind('nameConfig')} />
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? <DiyColourField {...f.bind('likeSuccessColor')} /> : null}
          <DiyColourField {...f.bind('nameColor')} />
          <DiyColourField {...f.bind('timeColor')} />
          <DiyColourField {...f.bind('browseColor')} />
          <DiyColourField {...f.bind('statisticColor')} />
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
