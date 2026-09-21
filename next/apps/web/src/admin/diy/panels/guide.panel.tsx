'use client';

import { guideSchema, type GuideComponent } from '@shop/contracts/diy/schema/guide.schema';

import { guideDefault } from '../defaults/guide.default';
import { DiyColourField, DiySection, DiySetUpTabs, DiySliderField, DiyTabsField } from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyCommonStyleSection } from './_fields';

/**
 * 辅助线 — ports `c_auxiliary_line.vue`.
 *
 * `lineStyle.tabList` carries the CSS the renderer uses (`dashed` / `solid` /
 * `dotted`) on each tab, so the stored `tabVal` is an index into that list and
 * nothing else needs writing.
 *
 * `lineBgColor` (底部背景) is in the default and reaches `rCom` nowhere; the
 * bottom background an operator can actually edit is the one `c_common_style`
 * draws, and 辅助线 has no `bottomBgColor`. Left untouched.
 */
export default defineDiyPanel<GuideComponent>({
  key: 'guide',
  schema: guideSchema,
  createDefault: () => structuredClone(guideDefault),
  label: '辅助线',
  description: '一条分隔线，实线、虚线或点状',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '展示设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('lineStyle')} />
        </DiySection>

        <DiySection title={value.titleRight ?? '线条样式'} when={f.tab === 1}>
          <DiyColourField {...f.bind('lineColor')} />
          <DiySliderField {...f.bind('heightConfig')} min={1} max={100} />
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
