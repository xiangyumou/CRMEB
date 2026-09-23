import { z } from 'zod';

import { defineDiyComponent, diyColour, diySlider, diyTabs } from './primitives';

/**
 * `guide` — 辅助线.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const guideSchema = defineDiyComponent('guide', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  titleCurrent: z.string().optional(),
  lineColor: diyColour.optional(),
  lineBgColor: diyColour.optional(),
  lineStyle: diyTabs.optional(),
  heightConfig: diySlider.optional(),
});

export type GuideComponent = z.infer<typeof guideSchema>;
