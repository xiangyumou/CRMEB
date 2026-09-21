'use client';

import { couponSchema, type CouponComponent } from '@shop/contracts/diy/schema/coupon.schema';

import { couponDefault } from '../defaults/coupon.default';
import { DiyColourField, DiySection, DiySetUpTabs, DiySliderField, DiyTabsField } from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyCommonStyleSection } from './_fields';

/**
 * 优惠券 — ports `c_home_coupon.vue`.
 *
 * The coupons themselves are not picked here: the component shows whatever the
 * storefront's live coupon list returns, capped by `numberConfig.val`. That is
 * `c_home_coupon.vue:62-68`, whose whole 内容设置 tab is a title and a slider,
 * and it matches `coupon.vue` in the renderer, which fetches on mount.
 *
 * Which colour rows appear depends on the style **and** the tone
 * (`getRComStyle`, `:186-215`): 风格三 has no button and no card background of
 * its own, 风格二 has a button but no card background. `spacingConfig` and
 * `moduleColor2` are declared in the Vue file but never reach `rCom`, so they
 * get no control here either and survive untouched.
 */
export default defineDiyPanel<CouponComponent>({
  key: 'coupon',
  schema: couponSchema,
  createDefault: () => structuredClone(couponDefault),
  label: '优惠券',
  description: '展示可领取的优惠券，数量与配色可调',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const style = Number(value.styleConfig?.tabVal ?? 0);
    const customTone = Number(value.toneConfig?.tabVal ?? 0) !== 0;
    const hasButton = style !== 2;
    const hasCardBg = style !== 1 && style !== 2;

    return (
      <>
        <DiyTabsField {...f.bind('styleConfig')} label="选择风格" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleData ?? '数据设置'} when={f.tab === 0}>
          <DiySliderField {...f.bind('numberConfig')} min={1} max={20} />
        </DiySection>

        <DiySection title={value.titleRight ?? '优惠券样式'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('couponMoneyColor')} />
              {hasButton ? <DiyColourField {...f.bind('bntBgColor')} /> : null}
              {hasCardBg ? <DiyColourField {...f.bind('couponBgColor')} /> : null}
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
