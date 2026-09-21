import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyFillet,
  diyListBox,
  diySlider,
  diyTabs,
} from './primitives';

/**
 * `swiperBg` — 轮播图.
 *
 * Fields derived from `template/admin/src/components/mobilePage/banner.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const swiperBgSchema = defineDiyComponent('swiperBg', {
  titleLeft: z.string().optional(),
  titleContent: z.string().optional(),
  titleRight: z.string().optional(),
  titleImg: z.string().optional(),
  styleConfig: diyTabs.optional(),
  swiperConfig: diyListBox.optional(),
  docConfig: diyTabs.optional(),
  docPosition: diyTabs.optional(),
  toneConfig: diyTabs.optional(),
  dotColor: diyColour.optional(),
  dotBgColor: diyColour.optional(),
  filletImg: diyFillet.optional(),
  imgConfig: diySlider.optional(),
  txtStyle: diyListBox.optional(),
});

export type SwiperBgComponent = z.infer<typeof swiperBgSchema>;
