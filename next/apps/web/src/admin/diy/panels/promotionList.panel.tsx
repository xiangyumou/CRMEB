'use client';

import {
  promotionListSchema,
  type PromotionListComponent,
} from '@shop/contracts/diy/schema/promotionList.schema';

import { promotionListDefault } from '../defaults/promotionList.default';
import {
  DiyColourField,
  DiyCommonStyleSection,
  DiySection,
  DiySetUpTabs,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyPromotionTabsField } from './_fields';

/**
 * 商品选项卡 — ports `c_home_product.vue`, whose `getRComStyle` is a four-deep
 * nest over `styleConfig` × `toneConfig` × `cartConfig` × `toneCartConfig`:
 * 32 leaves, all of which say one of four things.
 *
 * - The colours (`decorateColor…` / `textColor…`) appear only for a custom
 *   `toneConfig`, and *which pair* is the style's: 样式一 decorate+textColor2,
 *   样式二 decorate+textColor, 样式三 decorate2+textColor2, 样式四以后
 *   decorate+textColor3.
 * - The 购物车按钮 heading and `toneCartConfig` appear when the cart button is
 *   shown **or** the tone is custom. The `||` is not a simplification: the
 *   `type2 != 0, type3 != 0` leaves all include `fourStyle` while the
 *   `type2 == 0, type3 != 0` leaves do not (`:341-367` against `:328-336`).
 *   Legacy quirk, reproduced.
 * - `goodsPriceColor` and `bntBgColor` need the cart button shown *and* a
 *   custom cart tone.
 *
 * `bntStyleConfig` is a `c_button_img`, a picker of three drawn button shapes;
 * its stored value is the index in `tabVal`, so it is a tab strip here. The
 * artwork is the storefront's, not the panel's.
 */
export default defineDiyPanel<PromotionListComponent>({
  key: 'promotionList',
  schema: promotionListSchema,
  createDefault: () => structuredClone(promotionListDefault),
  label: '商品选项卡',
  description: '按选项卡分组的商品列表，每个选项卡一条查询',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const style = Number(value.styleConfig?.tabVal ?? 0);
    const customTone = Number(value.toneConfig?.tabVal ?? 0) !== 0;
    const showsCart = Number(value.cartConfig?.tabVal ?? 0) === 0;
    const customCartTone = Number(value.toneCartConfig?.tabVal ?? 0) !== 0;

    return (
      <>
        <DiyTabsField {...f.bind('styleConfig')} label="选择风格" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '展示设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('slideConfig')} />
        </DiySection>

        <DiySection title={value.titleTab ?? '选项卡设置'} when={f.tab === 0}>
          <DiyPromotionTabsField {...f.bind('tabConfig')} style={style} />
        </DiySection>

        <DiySection title={value.titleCart ?? '购物车按钮'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('cartConfig')} />
          {showsCart ? (
            <>
              <DiyTabsField {...f.bind('bntStyleConfig')} />
              <DiyTabsField {...f.bind('bntConfig')} />
            </>
          ) : null}
        </DiySection>

        <DiySection title={value.titleRight ?? '选项卡样式'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField
                {...(style === 2 ? f.bind('decorateColor2') : f.bind('decorateColor'))}
              />
              <DiyColourField
                {...(style === 1
                  ? f.bind('textColor')
                  : style >= 3
                    ? f.bind('textColor3')
                    : f.bind('textColor2'))}
              />
            </>
          ) : null}
        </DiySection>

        <DiySection
          title={value.titleCart ?? '购物车按钮'}
          when={f.tab === 1 && (showsCart || customTone)}
        >
          <DiyTabsField {...f.bind('toneCartConfig')} />
          {showsCart && customCartTone ? (
            <>
              <DiyColourField {...f.bind('goodsPriceColor')} />
              <DiyColourField {...f.bind('bntBgColor')} />
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
