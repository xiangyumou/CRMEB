'use client';

import {
  articleListSchema,
  type ArticleListComponent,
} from '@shop/contracts/diy/schema/articleList.schema';

import { articleListDefault } from '../defaults/articleList.default';
import {
  DiyCategoryPickerField,
  DiyCheckboxField,
  DiyColourField,
  DiyCommonStyleSection,
  DiyFilletField,
  DiyNumberField,
  DiySection,
  DiySetUpTabs,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 文章列表.
 *
 * `selectConfig` is a `c_select` whose stored `selectConfig.list` holds the
 * category options. A panel may not call a route, so the category tree comes
 * from the `DiyDataSource` port; `DiyCategoryPickerField` patches
 * `activeValue` and leaves the stored `list` exactly as it was, so a stored
 * page keeps the option labels it was saved with.
 *
 * `likeSuccessColor` is the only tone-gated row; the four text colours below
 * it are shown whatever the tone is, which is what operators' saved pages were
 * edited against.
 *
 * `goodsList` and `selectList` are in the default but are not operator
 * settings.
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
              rather than spread. */}
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
