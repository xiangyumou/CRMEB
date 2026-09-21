import { z } from 'zod';

import { defineDiyComponent, diyColour, diyGroup, diyTabs, diyUnknown } from './primitives';

/**
 * `pageFoot` — 底部导航.
 *
 * Fields derived from `template/admin/src/store/module/mobildConfig.js`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const pageFootSchema = defineDiyComponent('pageFoot', {
  titleLeft: z.string().optional(),
  titleNav: z.string().optional(),
  titleRight: z.string().optional(),
  effectConfig: diyTabs.optional(),
  navConfig: diyTabs.optional(),
  navStyleConfig: diyTabs.optional(),
  toneConfig: diyTabs.optional(),
  txtColor: diyColour.optional(),
  activeTxtColor: diyColour.optional(),
  bgColor2: diyColour.optional(),
  status: diyGroup.optional(),
  menuList: z.array(diyUnknown).optional(),
});

export type PageFootComponent = z.infer<typeof pageFootSchema>;
