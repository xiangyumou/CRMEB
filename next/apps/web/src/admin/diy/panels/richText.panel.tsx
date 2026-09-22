'use client';

import { richTextSchema, type RichTextComponent } from '@shop/contracts/diy/schema/richText.schema';

import { richTextDefault } from '../defaults/richText.default';
import { DiyCommonStyleSection, DiySection, DiySetUpTabs } from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyRichTextField } from './_fields';

/** 富文本 — ports `c_ueditor_box.vue`: the HTML body and 通用样式. */
export default defineDiyPanel<RichTextComponent>({
  key: 'richText',
  schema: richTextSchema,
  createDefault: () => structuredClone(richTextDefault),
  label: '富文本',
  description: '一段自由排版的图文',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '富文本内容'} when={f.tab === 0}>
          <DiyRichTextField {...f.bind('richText')} />
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
