'use client';

import {
  goodRecommendSchema,
  type GoodRecommendComponent,
} from '@shop/contracts/diy/schema/goodRecommend.schema';

import { goodRecommendDefault } from '../defaults/goodRecommend.default';
import {
  DiyCheckboxField,
  DiyColourField,
  DiyCommonStyleSection,
  DiyFilletField,
  DiyInputField,
  DiyProductPickerField,
  DiySection,
  DiySelectField,
  DiySetUpTabs,
  DiySliderField,
  DiyTabsField,
  DiyUploadField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyClassListField, DiyGoodsLabelField } from './_fields';

/**
 * 优品推荐, four indices.
 *
 * - `headerType.tabVal` — `0` 文字 uses `headerText` and unlocks the three
 *   header-text style rows; anything else is an image and hides all four.
 * - `typeConfig.activeValue` — `1` 指定商品 picks products, `3` 指定分类 picks
 *   categories and `4` 商品标签 picks labels; the latter two also get 数量 and
 *   排序. Stored pages carry the value as the string `'1'` as easily as the
 *   number, so it is compared loosely.
 * - `cartConfig.tabVal` — `0` 显示 adds the button style rows on both tabs.
 * - `toneConfig` / `toneCartConfig` — the two independent colour groups.
 *
 * `productList` is in the default but is not an operator setting; the picked
 * products live in `goodsList`. Refetching the preview list on every change is
 * a preview concern, not a panel one.
 */
export default defineDiyPanel<GoodRecommendComponent>({
  key: 'goodRecommend',
  schema: goodRecommendSchema,
  createDefault: () => structuredClone(goodRecommendDefault),
  label: '优品推荐',
  description: '一组推荐商品，按指定商品、分类或标签取数',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const textHeader = Number(value.headerType?.tabVal ?? 0) === 0;
    const source = Number(value.typeConfig?.activeValue ?? 1);
    const showsCart = Number(value.cartConfig?.tabVal ?? 0) === 0;
    const customTone = Number(value.toneConfig?.tabVal ?? 0) === 1;
    const customCartTone = Number(value.toneCartConfig?.tabVal ?? 0) === 1;

    return (
      <>
        <DiyTabsField {...f.bind('styleConfig')} label="列表样式" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.headerTitle ?? '头部设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('headerType')} />
          {textHeader ? (
            <DiyInputField {...f.bind('headerText')} />
          ) : (
            <DiyUploadField {...f.bind('headerImg')} label="上传图片" />
          )}
        </DiySection>

        <DiySection title={value.titleGoods ?? '商品设置'} when={f.tab === 0}>
          <DiySelectField {...f.bind('typeConfig')} />
          {source === 1 ? <DiyProductPickerField {...f.bind('goodsList')} max={20} /> : null}
          {source === 3 ? <DiyClassListField {...f.bind('classList')} /> : null}
          {source === 4 ? <DiyGoodsLabelField {...f.bind('goodsLabel')} /> : null}
          {source === 3 || source === 4 ? (
            <>
              <DiySliderField {...f.bind('numberConfig')} min={1} max={50} />
              <DiyTabsField {...f.bind('goodsSort')} />
            </>
          ) : null}
          <DiyCheckboxField {...f.bind('checkboxInfo')} />
          <DiyTabsField {...f.bind('cartConfig')} />
          {showsCart ? (
            <>
              <DiyTabsField {...f.bind('bntStyleConfig')} />
              <DiyTabsField {...f.bind('bntConfig')} />
            </>
          ) : null}
        </DiySection>

        <DiySection title={value.headerStyleTitle ?? '头部样式'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('headerAlign')} />
          {textHeader ? (
            <>
              <DiyTabsField {...f.bind('headerTextConfig')} />
              <DiyColourField {...f.bind('headerColor')} />
              <DiySliderField {...f.bind('headerFontSize')} min={12} max={30} />
            </>
          ) : null}
          <DiyTabsField {...f.bind('goodsName')} />
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('goodsNameColor')} />
              <DiyColourField {...f.bind('goodsPriceColor')} />
              <DiyColourField {...f.bind('soldNumColor')} />
              <DiyColourField {...f.bind('scoreColor')} />
            </>
          ) : null}
        </DiySection>

        <DiySection title={value.cartStyleTitle ?? '购物车按钮'} when={f.tab === 1 && showsCart}>
          <DiyTabsField {...f.bind('toneCartConfig')} />
          {customCartTone ? <DiyColourField {...f.bind('bntBgColor')} /> : null}
        </DiySection>

        <DiySection title={value.goodsStyleTitle ?? '商品图样式'} when={f.tab === 1}>
          <DiyFilletField {...f.bind('filletImg')} />
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
