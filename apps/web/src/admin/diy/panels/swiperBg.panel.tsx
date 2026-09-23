'use client';

import { swiperBgSchema, type SwiperBgComponent } from '@shop/contracts/diy/schema/swiperBg.schema';

import { swiperBgDefault } from '../defaults/swiperBg.default';
import {
  DiyColourField,
  DiyFilletField,
  DiyImageListField,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiySpacingField,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 轮播图 — the reference panel for "a component with an image list".
 *
 * Two rules decide which rows show: the indicator colours only exist when 色调 is 自定义, and the
 * gap slider only exists in 样式二 (the three-up carousel).
 */
export default defineDiyPanel<SwiperBgComponent>({
  key: 'swiperBg',
  schema: swiperBgSchema,
  createDefault: () => structuredClone(swiperBgDefault),
  label: '轮播图',
  description: '多张图片轮播展示，每张可单独设置跳转链接',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const style = Number(value.styleConfig?.tabVal ?? 0);
    const customTone = Number(value.toneConfig?.tabVal ?? 0) === 1;

    return (
      <>
        <DiyTabsField {...f.bind('styleConfig')} label="选择风格" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleContent ?? '内容设置'} when={f.tab === 0}>
          <DiyImageListField
            {...f.bind('swiperConfig')}
            tip="最多 10 张，建议宽度 750px"
            max={10}
          />
        </DiySection>

        <DiySection title={value.titleRight ?? '指示器设置'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('docConfig')} />
          <DiyTabsField {...f.bind('docPosition')} />
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('dotColor')} />
              <DiyColourField {...f.bind('dotBgColor')} />
            </>
          ) : null}
        </DiySection>

        <DiySection title={value.titleImg ?? '图片设置'} when={f.tab === 1}>
          <DiyFilletField {...f.bind('filletImg')} />
          {/* 样式二 lays three images side by side, so the gap is only meaningful there. */}
          {style === 1 ? <DiySliderField {...f.bind('imgConfig')} label="图片间距" /> : null}
        </DiySection>

        <DiySection title={value.titleCurrency ?? '通用样式'} when={f.tab === 1}>
          <DiyColourField {...f.bind('bgColor')} />
          <DiyColourField {...f.bind('bottomBgColor')} />
          <DiySpacingField {...f.bind('paddingConfig')} />
          <DiySpacingField {...f.bind('marginConfig')} />
          <DiyFilletField {...f.bind('fillet')} />
        </DiySection>
      </>
    );
  },
});
