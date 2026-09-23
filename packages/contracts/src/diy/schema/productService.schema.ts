import { z } from 'zod';

import { defineDiyComponent, diyColour, diyListBox, diyTabs } from './primitives';

/**
 * `productService` — 商品服务.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const productServiceSchema = defineDiyComponent('productService', {
  openService: z.string().optional(),
  checkBoxConfig: diyListBox.optional(),
  serviceStyleTitle: z.string().optional(),
  generalStyleTitle: z.string().optional(),
  titleColor: diyColour.optional(),
  contentColor: diyColour.optional(),
  toneConfig: diyTabs.optional(),
  activityColor: diyColour.optional(),
  activityBgColor: diyColour.optional(),
});

export type ProductServiceComponent = z.infer<typeof productServiceSchema>;
