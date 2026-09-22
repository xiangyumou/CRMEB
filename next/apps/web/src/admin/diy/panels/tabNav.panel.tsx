'use client';

import { tabNavSchema, type TabNavComponent } from '@shop/contracts/diy/schema/tabNav.schema';

import { tabNavDefault } from '../defaults/tabNav.default';
import {
  DiyColourField,
  DiyCommonStyleSection,
  DiySection,
  DiySetUpTabs,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyTabListField } from './_fields';

/**
 * 选项卡 — ports `c_nav_bar.vue`.
 *
 * Three watchers write the same nine-branch tree, which is one rule: the style
 * tab shows a decoration colour and a selected-text colour, and *which pair* it
 * shows depends on `styleConfig.tabVal` — 风格一 `decorateColor` + `textColor`,
 * 风格二 `decorateColor2` + `textColor2`, 风格三 `decorateColor` + `textColor3`.
 * Both only when `toneConfig.tabVal` is custom; following the theme shows
 * neither. The three text colours exist separately because each style's default
 * differs (#333 / #E93323 / #FFF) and the operator's edit to one must not follow
 * them to another.
 *
 * `titleLeft` is commented out in the Vue file (`:12-15`, `:83-86`, …) so the
 * 展示设置 section has no heading of its own there; it is given one here because
 * a heading-less section in the new shell would sit flush against the tabs.
 * That is presentation only — no key changes.
 */
export default defineDiyPanel<TabNavComponent>({
  key: 'tabNav',
  schema: tabNavSchema,
  createDefault: () => structuredClone(tabNavDefault),
  label: '选项卡',
  description: '分类选项卡，切换微页面或商品分类',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const style = Number(value.styleConfig?.tabVal ?? 0);
    const customTone = Number(value.toneConfig?.tabVal ?? 0) !== 0;

    return (
      <>
        <DiyTabsField {...f.bind('styleConfig')} label="选择风格" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '展示设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('stickyConfig')} />
        </DiySection>

        <DiySection title={value.titleTab ?? '选项卡设置'} when={f.tab === 0}>
          <DiyTabListField {...f.bind('tabListConfig')} />
        </DiySection>

        <DiySection title={value.titleRight ?? '选项卡样式'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField
                {...(style === 1 ? f.bind('decorateColor2') : f.bind('decorateColor'))}
              />
              <DiyColourField
                {...(style === 1
                  ? f.bind('textColor2')
                  : style === 2
                    ? f.bind('textColor3')
                    : f.bind('textColor'))}
              />
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
