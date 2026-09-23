'use client';

import { reviewsSchema, type ReviewsComponent } from '@shop/contracts/diy/schema/reviews.schema';

import { reviewsDefault } from '../defaults/reviews.default';
import {
  DiyCheckboxField,
  DiyColourField,
  DiyCommonStyleSection,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 商品评价.
 *
 * `layoutConfig` is the card-select at the top of the panel, and it appears
 * only there, not again inside 评价列表.
 */
export default defineDiyPanel<ReviewsComponent>({
  key: 'reviews',
  schema: reviewsSchema,
  createDefault: () => structuredClone(reviewsDefault),
  label: '商品评价',
  description: '商品详情里的评价摘要与列表',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const customTone = Number(value.toneConfig?.tabVal ?? 0) === 1;

    return (
      <>
        <DiyTabsField {...f.bind('layoutConfig')} label="选择风格" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.headTitle ?? '头部设置'} when={f.tab === 0}>
          <DiyCheckboxField {...f.bind('checkBoxConfig')} />
        </DiySection>

        <DiySection title={value.listTitle ?? '评价列表'} when={f.tab === 0}>
          <DiySliderField {...f.bind('numConfig')} min={1} max={10} />
        </DiySection>

        <DiySection title={value.reviewStyleTitle ?? '评价样式'} when={f.tab === 1}>
          <DiyColourField {...f.bind('titleColor')} />
          <DiyColourField {...f.bind('countColor')} />
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('rateColor')} />
              <DiyColourField {...f.bind('starColor')} />
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
