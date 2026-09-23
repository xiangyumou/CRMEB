import { z } from 'zod';

import { defineDiyComponent, diyColour, diyGroup, diyListBox, diyTabs } from './primitives';

/**
 * `promotionList` — 商品选项卡.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const promotionListSchema = defineDiyComponent('promotionList', {
  titleLeft: z.string().optional(),
  titleTab: z.string().optional(),
  titleRight: z.string().optional(),
  titleCart: z.string().optional(),
  styleConfig: diyTabs.optional(),
  slideConfig: diyTabs.optional(),
  tabConfig: diyListBox.optional(),
  cartConfig: diyTabs.optional(),
  bntConfig: diyTabs.optional(),
  bntStyleConfig: diyGroup.optional(),
  toneConfig: diyTabs.optional(),
  goodsPriceColor: diyColour.optional(),
  decorateColor: diyColour.optional(),
  decorateColor2: diyColour.optional(),
  textColor: diyColour.optional(),
  textColor2: diyColour.optional(),
  textColor3: diyColour.optional(),
  toneCartConfig: diyTabs.optional(),
  bntBgColor: diyColour.optional(),
});

export type PromotionListComponent = z.infer<typeof promotionListSchema>;
