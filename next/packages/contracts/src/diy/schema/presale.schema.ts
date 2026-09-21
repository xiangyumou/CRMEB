import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyFillet,
  diyGroup,
  diySlider,
  diyTabs,
} from './primitives';

/**
 * `presale`.
 *
 * Fields derived from uni `presale.vue` + admin `c_presale.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const presaleSchema = defineDiyComponent('presale', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  titleText: z.string().optional(),
  titleNumber: z.string().optional(),
  titleGoods: z.string().optional(),
  titleGoodsList: z.string().optional(),
  titleGoodsStyle: z.string().optional(),
  titleConfig: z.string().optional(),
  titleTxtConfig: z.string().optional(),
  titleColor: diyColour.optional(),
  presaleConfig: diyTabs.optional(),
  styleConfig: diyTabs.optional(),
  goodStyleConfig: diyTabs.optional(),
  checkboxInfo: diyTabs.optional(),
  toneConfig: diyTabs.optional(),
  imgConfig: diySlider.optional(),
  imgBgConfig: diyGroup.optional(),
  imgColorConfig: diyGroup.optional(),
  filletImg: diyFillet.optional(),
  numberConfig: diyGroup.optional(),
  bntNumber: diyGroup.optional(),
  rightBntConfig: diyGroup.optional(),
  tipTxtConfig: diyGroup.optional(),
  tipsColor: diyColour.optional(),
  tipsColor2: diyColour.optional(),
  dividerColor: diyColour.optional(),
  moduleColor: diyColour.optional(),
  headerBgColor: diyColour.optional(),
  headerBntColor: diyColour.optional(),
  headerBntColor2: diyColour.optional(),
  goodsName: diyGroup.optional(),
  goodsNameColor: diyColour.optional(),
  goodsPriceColor: diyColour.optional(),
  goodsBntColor: diyColour.optional(),
  goodsBntTxtColor: diyColour.optional(),
  presalePriceColor: diyColour.optional(),
});

export type PresaleComponent = z.infer<typeof presaleSchema>;
