import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyListBox,
  diySelect,
  diySlider,
  diyTabs,
} from './primitives';

/**
 * `customComponent` — 超级组件.
 *
 * Fields derived from `template/admin/src/components/mobilePage/home_custom_component.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const customComponentSchema = defineDiyComponent('customComponent', {
  messageTitle: z.string().optional(),
  dataTitle: z.string().optional(),
  designTitle: z.string().optional(),
  commonTitle: z.string().optional(),
  dataStyleTitle: z.string().optional(),
  selectType: diySelect.optional(),
  articleDisplayMode: diyTabs.optional(),
  articleColumnStyle: diyTabs.optional(),
  articleDataSource: diyTabs.optional(),
  articleList: diyListBox.optional(),
  articleClass: diySelect.optional(),
  articleNum: diySlider.optional(),
  articleSort: diyTabs.optional(),
  articleSortRule: diyTabs.optional(),
  couponDisplayMode: diyTabs.optional(),
  couponColumnStyle: diyTabs.optional(),
  couponDataSource: diyTabs.optional(),
  couponList: diyListBox.optional(),
  couponType: diySelect.optional(),
  couponUserType: diySelect.optional(),
  couponSendType: diySelect.optional(),
  couponThreshold: diyTabs.optional(),
  couponThresholdValue: diySlider.optional(),
  couponTime: diySlider.optional(),
  couponSort: diyTabs.optional(),
  couponSortRule: diyTabs.optional(),
  couponNum: diySlider.optional(),
  goodsDisplayMode: diyTabs.optional(),
  goodsColumnStyle: diyTabs.optional(),
  goodsDataSource: diyTabs.optional(),
  goodsList: diyListBox.optional(),
  goodsClass: diySelect.optional(),
  goodsNum: diySlider.optional(),
  goodsSort: diyTabs.optional(),
  goodsSortRule: diyTabs.optional(),
  moduleColor: diyColour.optional(),
});

export type CustomComponentComponent = z.infer<typeof customComponentSchema>;
