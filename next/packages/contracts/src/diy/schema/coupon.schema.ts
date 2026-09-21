import { z } from 'zod';

import { defineDiyComponent, diyColour, diySlider, diyTabs } from './primitives';

/**
 * `coupon` — 优惠券.
 *
 * Fields derived from `template/admin/src/components/mobilePage/home_coupon.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const couponSchema = defineDiyComponent('coupon', {
  titleLeft: z.string().optional(),
  titleData: z.string().optional(),
  titleRight: z.string().optional(),
  styleConfig: diyTabs.optional(),
  numberConfig: diySlider.optional(),
  toneConfig: diyTabs.optional(),
  couponMoneyColor: diyColour.optional(),
  bntBgColor: diyColour.optional(),
  couponBgColor: diyColour.optional(),
  spacingConfig: diySlider.optional(),
  moduleColor: diyColour.optional(),
});

export type CouponComponent = z.infer<typeof couponSchema>;
