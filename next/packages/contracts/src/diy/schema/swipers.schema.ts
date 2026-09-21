import { type z } from 'zod';

import { defineDiyComponent, diyGroup, diySlider, diyTabs } from './primitives';

/**
 * `swipers`.
 *
 * Fields derived from uni `swipers.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const swipersSchema = defineDiyComponent('swipers', {
  swiperConfig: diyGroup.optional(),
  docConfig: diyTabs.optional(),
  tabConfig: diyTabs.optional(),
  itemEdge: diyGroup.optional(),
  lrConfig: diySlider.optional(),
  imgConfig: diySlider.optional(),
});

export type SwipersComponent = z.infer<typeof swipersSchema>;
