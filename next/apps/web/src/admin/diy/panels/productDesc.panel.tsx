'use client';

import {
  productDescSchema,
  type ProductDescComponent,
} from '@shop/contracts/diy/schema/productDesc.schema';

import { productDescDefault } from '../defaults/productDesc.default';
import { DiyColourField, DiySection, DiySetUpTabs, DiySliderField, DiyTabsField } from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyAlignField, DiyCommonStyleSection } from './_fields';

/**
 * 产品介绍 — ports `c_product_desc.vue`. A商品详情 component: one switch on the
 * content tab, the title's own style on the style tab, then 通用样式.
 *
 * `borderRadius` is a bare `"0"` string in the default and reaches `rCom`
 * nowhere; `fillet` is the radius the panel actually edits. Left untouched.
 */
export default defineDiyPanel<ProductDescComponent>({
  key: 'productDesc',
  schema: productDescSchema,
  createDefault: () => structuredClone(productDescDefault),
  label: '产品介绍',
  description: '商品详情里的图文介绍区',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.contentTitle ?? '内容设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('isShow')} />
        </DiySection>

        <DiySection title={value.titleStyle ?? '标题样式'} when={f.tab === 1}>
          <DiyAlignField {...f.bind('textPosition')} />
          <DiyColourField {...f.bind('textColor')} />
          <DiySliderField {...f.bind('fontSize')} min={12} max={40} />
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
