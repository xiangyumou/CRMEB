'use client';

import {
  productServiceSchema,
  type ProductServiceComponent,
} from '@shop/contracts/diy/schema/productService.schema';

import { productServiceDefault } from '../defaults/productService.default';
import { DiyColourField, DiySection, DiySetUpTabs, DiyTabsField } from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyCheckboxField, DiyCommonStyleSection } from './_fields';

/**
 * 商品服务 — ports `c_product_service.vue`: the 活动 / 选择 / 参数 / 服务 rows of a
 * product page, which of them show, and their colours.
 *
 * `componentBgColor` is pushed into the style branch by `c_product_service.vue`
 * but is not in the factory default, so the row draws only for a node that has
 * one; `c_common_style` covers the background for everything else.
 */
export default defineDiyPanel<ProductServiceComponent>({
  key: 'productService',
  schema: productServiceSchema,
  createDefault: () => structuredClone(productServiceDefault),
  label: '商品服务',
  description: '商品详情里的活动、规格、参数与服务行',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const customTone = Number(value.toneConfig?.tabVal ?? 0) === 1;

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.openService ?? '开启服务'} when={f.tab === 0}>
          <DiyCheckboxField {...f.bind('checkBoxConfig')} />
        </DiySection>

        <DiySection title={value.serviceStyleTitle ?? '服务样式'} when={f.tab === 1}>
          <DiyColourField {...f.bind('titleColor')} />
          <DiyColourField {...f.bind('contentColor')} />
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('activityColor')} />
              <DiyColourField {...f.bind('activityBgColor')} />
            </>
          ) : null}
        </DiySection>

        <DiyCommonStyleSection
          value={value}
          onChange={onChange}
          disabled={ctx.disabled}
          title={value.generalStyleTitle}
          when={f.tab === 1}
        />
      </>
    );
  },
});
