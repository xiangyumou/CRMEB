import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyFillet,
  diyInput,
  diyListBox,
  diySlider,
  diyTabs,
  diyUpload,
} from './primitives';

/**
 * `combination` — 拼团.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const combinationSchema = defineDiyComponent('combination', {
  titleLeft: z.string().optional(),
  titleGoodsList: z.string().optional(),
  titleGoods: z.string().optional(),
  titleRight: z.string().optional(),
  bgTitle: z.string().optional(),
  titleGoodsStyle: z.string().optional(),
  styleConfig: diyTabs.optional(),
  imgBgConfig: diyUpload.optional(),
  titleConfig: diyTabs.optional(),
  imgConfig: diyUpload.optional(),
  imgColorConfig: diyUpload.optional(),
  titleTxtConfig: diyInput.optional(),
  rightBntConfig: diyInput.optional(),
  goodStyleConfig: diyTabs.optional(),
  numberConfig: diySlider.optional(),
  checkboxInfo: diyListBox.optional(),
  pinkConfig: diyTabs.optional(),
  headerBgColor: diyColour.optional(),
  titleText: diyTabs.optional(),
  titleColor: diyColour.optional(),
  titleNumber: diySlider.optional(),
  labelColor: diyColour.optional(),
  headerBntColor: diyColour.optional(),
  headerBntColor2: diyColour.optional(),
  bntNumber: diySlider.optional(),
  tipsColor: diyColour.optional(),
  tipsColor2: diyColour.optional(),
  dividerColor: diyColour.optional(),
  filletImg: diyFillet.optional(),
  goodsName: diyTabs.optional(),
  goodsNameColor: diyColour.optional(),
  goodsPriceColor: diyColour.optional(),
  toneConfig: diyTabs.optional(),
  pinkPriceColor: diyColour.optional(),
  goodsBntColor: diyColour.optional(),
  goodsBntTxtColor: diyColour.optional(),
  moduleColor: diyColour.optional(),
});

export type CombinationComponent = z.infer<typeof combinationSchema>;
