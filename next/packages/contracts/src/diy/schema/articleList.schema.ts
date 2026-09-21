import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyFillet,
  diyListBox,
  diySelect,
  diySlider,
  diyTabs,
} from './primitives';

/**
 * `articleList` — 文章列表.
 *
 * Fields derived from `template/admin/src/components/mobilePage/home_new_list.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const articleListSchema = defineDiyComponent('articleList', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  titleArticle: z.string().optional(),
  titleList: z.string().optional(),
  styleConfig: diyTabs.optional(),
  numConfig: diySlider.optional(),
  selectConfig: diySelect.optional(),
  goodsList: diyListBox.optional(),
  selectList: diyListBox.optional(),
  checkboxList: diyListBox.optional(),
  filletImg: diyFillet.optional(),
  nameConfig: diyTabs.optional(),
  toneConfig: diyTabs.optional(),
  likeSuccessColor: diyColour.optional(),
  nameColor: diyColour.optional(),
  timeColor: diyColour.optional(),
  browseColor: diyColour.optional(),
  statisticColor: diyColour.optional(),
});

export type ArticleListComponent = z.infer<typeof articleListSchema>;
