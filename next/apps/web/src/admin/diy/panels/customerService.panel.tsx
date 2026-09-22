'use client';

import {
  customerServiceSchema,
  type CustomerServiceComponent,
} from '@shop/contracts/diy/schema/customerService.schema';

import { customerServiceDefault } from '../defaults/customerService.default';
import {
  DiyCommonStyleSection,
  DiyLinkField,
  DiySection,
  DiySetUpTabs,
  DiyTabsField,
  DiyUploadField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 悬浮按钮 — ports `c_home_service.vue`, the smallest panel in the set: one
 * index (`setUp.tabVal`) and five rows.
 *
 * The link row is not part of `c_upload_img` in general. That widget carries a
 * hard-coded special case (`c_upload_img.vue:22`)
 *
 *     defaults.name == 'customerService' && defaults.buttonConfig.tabVal == 0
 *
 * — the only component whose upload box also edits a link, and only while the
 * button is a 页面链接 rather than the 客服入口. The condition lives here instead,
 * where it is readable, and `DiyUploadField` stays the generic one it is.
 *
 * `zIndexConfig` is in the default and gets no control (see g2.md, decision 2).
 */
export default defineDiyPanel<CustomerServiceComponent>({
  key: 'customerService',
  schema: customerServiceSchema,
  createDefault: () => structuredClone(customerServiceDefault),
  label: '悬浮按钮',
  description: '悬浮在页面上的圆形按钮，跳链接或开客服',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const linksToPage = Number(value.buttonConfig?.tabVal ?? 0) === 0;

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '按钮设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('buttonConfig')} />
          <DiyUploadField {...f.bind('logoConfig')} label="图片" tip={value.logoConfig?.title} />
          {linksToPage ? (
            <DiyLinkField
              value={String(value.logoConfig?.link ?? '')}
              onChange={(link) => f.patch({ logoConfig: { ...(value.logoConfig ?? {}), link } })}
              disabled={ctx.disabled}
              label="链接"
            />
          ) : null}
        </DiySection>

        <DiySection title={value.titleRight ?? '位置设置'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('locationConfig')} />
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
