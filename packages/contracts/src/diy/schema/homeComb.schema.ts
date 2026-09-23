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
 * `homeComb` — 轮播搜索.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const homeCombSchema = defineDiyComponent('homeComb', {
  titleLeft: z.string().optional(),
  titleSearch: z.string().optional(),
  titleHotWords: z.string().optional(),
  titleTab: z.string().optional(),
  titleImg: z.string().optional(),
  titleRight: z.string().optional(),
  titlePointer: z.string().optional(),
  titleGradient: z.string().optional(),
  styleConfig: diyTabs.optional(),
  classConfig: diyTabs.optional(),
  searchConfig: diyTabs.optional(),
  searchBox: diyTabs.optional(),
  searchFix: diyTabs.optional(),
  titleConfig: diyInput.optional(),
  logoConfig: diyUpload.optional(),
  logoUpConfig: diyUpload.optional(),
  inputConfig: diyInput.optional(),
  hotWords: diyListBox.optional(),
  gradientColor: diyColour.optional(),
  numConfig: diySlider.optional(),
  tabListConfig: diyListBox.optional(),
  contentConfig: diySlider.optional(),
  classColor: diyColour.optional(),
  docConfig: diyTabs.optional(),
  docPosition: diyTabs.optional(),
  toneConfig: diyTabs.optional(),
  dotColor: diyColour.optional(),
  dotBgColor: diyColour.optional(),
  filletImg: diyFillet.optional(),
  swiperConfig: diyListBox.optional(),
});

export type HomeCombComponent = z.infer<typeof homeCombSchema>;
