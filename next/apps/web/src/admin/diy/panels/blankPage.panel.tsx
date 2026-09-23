'use client';

import {
  blankPageSchema,
  type BlankPageComponent,
} from '@shop/contracts/diy/schema/blankPage.schema';

import { blankPageDefault } from '../defaults/blankPage.default';
import { DiyCommonStyleSection, DiySection, DiySetUpTabs, DiySliderField } from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/** 辅助空白: one height slider and 通用样式. */
export default defineDiyPanel<BlankPageComponent>({
  key: 'blankPage',
  schema: blankPageSchema,
  createDefault: () => structuredClone(blankPageDefault),
  label: '辅助空白',
  description: '一段可调高度的空白，用来隔开上下组件',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '高度设置'} when={f.tab === 0}>
          <DiySliderField {...f.bind('heightConfig')} min={1} max={100} />
        </DiySection>

        <DiyCommonStyleSection
          value={value}
          onChange={onChange}
          disabled={ctx.disabled}
          title={value.titleRight}
          when={f.tab === 1}
        />
      </>
    );
  },
});
