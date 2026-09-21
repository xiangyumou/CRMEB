import { z } from 'zod';

import { defineDiyComponent, diyColour, diySpacing, diyTabs } from './primitives';

/**
 * `newVip`.
 *
 * Fields derived from uni `newVip.vue` + admin `c_new_vip.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const newVipSchema = defineDiyComponent('newVip', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  titleContent: z.string().optional(),
  titleCoupon: z.string().optional(),
  titleGoods: z.string().optional(),
  styleConfig: diyTabs.optional(),
  checkboxInfo: diyTabs.optional(),
  toneConfig: diyTabs.optional(),
  toneCouponConfig: diyTabs.optional(),
  toneGoodsConfig: diyTabs.optional(),
  vipBgColor: diyColour.optional(),
  moduleColor: diyColour.optional(),
  bntColor: diyColour.optional(),
  bntBgColor: diyColour.optional(),
  bntTxtColor: diyColour.optional(),
  priceColor: diyColour.optional(),
  tipsColor: diyColour.optional(),
  couponBgColor: diyColour.optional(),
  couponBgColor2: diyColour.optional(),
  couponMoneyColor: diyColour.optional(),
  couponTypeColor: diyColour.optional(),
  integralBgColor: diyColour.optional(),
  integralTxtColor: diyColour.optional(),
  spacingConfig: diySpacing.optional(),
  spacingConfig2: diySpacing.optional(),
});

export type NewVipComponent = z.infer<typeof newVipSchema>;
