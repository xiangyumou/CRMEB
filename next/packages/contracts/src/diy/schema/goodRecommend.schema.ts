import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyFillet,
  diyGroup,
  diyInput,
  diyListBox,
  diySelect,
  diySlider,
  diyTabs,
  diyUpload,
} from './primitives';

/**
 * `goodRecommend` — 优品推荐.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const goodRecommendSchema = defineDiyComponent('goodRecommend', {
  headerTitle: z.string().optional(),
  headerType: diyTabs.optional(),
  headerText: diyInput.optional(),
  headerImg: diyUpload.optional(),
  titleGoods: z.string().optional(),
  goodsList: diyListBox.optional(),
  productList: diyListBox.optional(),
  typeConfig: diySelect.optional(),
  goodsSort: diyTabs.optional(),
  numberConfig: diySlider.optional(),
  classList: diyGroup.optional(),
  goodsLabel: diySelect.optional(),
  checkboxInfo: diyListBox.optional(),
  cartConfig: diyTabs.optional(),
  bntStyleConfig: diyTabs.optional(),
  bntConfig: diyTabs.optional(),
  titleRight: z.string().optional(),
  styleConfig: diyTabs.optional(),
  headerStyleTitle: z.string().optional(),
  headerTextConfig: diyTabs.optional(),
  headerColor: diyColour.optional(),
  headerAlign: diyTabs.optional(),
  headerFontSize: diySlider.optional(),
  cartStyleTitle: z.string().optional(),
  goodsStyleTitle: z.string().optional(),
  toneCartConfig: diyTabs.optional(),
  bntBgColor: diyColour.optional(),
  generalStyleTitle: z.string().optional(),
  filletImg: diyFillet.optional(),
  goodsName: diyTabs.optional(),
  toneConfig: diyTabs.optional(),
  goodsNameColor: diyColour.optional(),
  goodsPriceColor: diyColour.optional(),
  soldNumColor: diyColour.optional(),
  scoreColor: diyColour.optional(),
});

export type GoodRecommendComponent = z.infer<typeof goodRecommendSchema>;
