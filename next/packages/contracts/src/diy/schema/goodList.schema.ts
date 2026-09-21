import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyFillet,
  diyGroup,
  diyListBox,
  diySelect,
  diySlider,
  diyTabs,
} from './primitives';

/**
 * `goodList` — 商品列表.
 *
 * Fields derived from `template/admin/src/components/mobilePage/home_goods_list.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const goodListSchema = defineDiyComponent('goodList', {
  titleLeft: z.string().optional(),
  titleGoods: z.string().optional(),
  titleContents: z.string().optional(),
  titleCart: z.string().optional(),
  titleRight: z.string().optional(),
  styleConfig: diyTabs.optional(),
  typeConfig: diySelect.optional(),
  goodsList: diyListBox.optional(),
  goodsSort: diyTabs.optional(),
  numberConfig: diySlider.optional(),
  classList: diyGroup.optional(),
  checkboxInfo: diyListBox.optional(),
  cartConfig: diyTabs.optional(),
  bntConfig: diyTabs.optional(),
  bntStyleConfig: diyTabs.optional(),
  filletImg: diyFillet.optional(),
  goodsName: diyTabs.optional(),
  toneConfig: diyTabs.optional(),
  goodsNameColor: diyColour.optional(),
  goodsPriceColor: diyColour.optional(),
  soldNumColor: diyColour.optional(),
  scoreColor: diyColour.optional(),
  toneCartConfig: diyTabs.optional(),
  bntBgColor: diyColour.optional(),
  moduleColor: diyColour.optional(),
  goodsLabel: diySelect.optional(),
  productList: diyListBox.optional(),
});

export type GoodListComponent = z.infer<typeof goodListSchema>;
