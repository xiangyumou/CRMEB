import { z } from 'zod';

import { defineDiyComponent, diyColour, diyListBox, diySlider, diyTabs } from './primitives';

/**
 * `reviews` — 商品评价.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const reviewsSchema = defineDiyComponent('reviews', {
  headTitle: z.string().optional(),
  checkBoxConfig: diyListBox.optional(),
  listTitle: z.string().optional(),
  layoutConfig: diyTabs.optional(),
  numConfig: diySlider.optional(),
  reviewStyleTitle: z.string().optional(),
  generalStyleTitle: z.string().optional(),
  titleColor: diyColour.optional(),
  countColor: diyColour.optional(),
  toneConfig: diyTabs.optional(),
  rateColor: diyColour.optional(),
  starColor: diyColour.optional(),
});

export type ReviewsComponent = z.infer<typeof reviewsSchema>;
