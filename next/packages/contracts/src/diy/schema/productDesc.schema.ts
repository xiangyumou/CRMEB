import { z } from 'zod';

import { defineDiyComponent, diyColour, diySlider, diyTabs } from './primitives';

/**
 * `productDesc` — 产品介绍.
 *
 * Fields derived from `template/admin/src/components/mobilePage/home_product_desc.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const productDescSchema = defineDiyComponent('productDesc', {
  contentTitle: z.string().optional(),
  titleStyle: z.string().optional(),
  isShow: diyTabs.optional(),
  textPosition: diySlider.optional(),
  textColor: diyColour.optional(),
  fontSize: diySlider.optional(),
  moduleColor: diyColour.optional(),
  borderRadius: z.string().optional(),
});

export type ProductDescComponent = z.infer<typeof productDescSchema>;
