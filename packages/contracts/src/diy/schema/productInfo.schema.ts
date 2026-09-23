import { type z } from 'zod';

import { defineDiyComponent, diyGroup, diyListBox, diyTabs } from './primitives';

/**
 * `productInfo` — 商品信息.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const productInfoSchema = defineDiyComponent('productInfo', {
  indicatorConfig: diyGroup.optional(),
  titleConfig: diyGroup.optional(),
  specStyle: diyTabs.optional(),
  specSettings: diyGroup.optional(),
  sortList: diyListBox.optional(),
});

export type ProductInfoComponent = z.infer<typeof productInfoSchema>;
