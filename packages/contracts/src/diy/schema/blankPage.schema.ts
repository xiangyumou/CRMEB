import { z } from 'zod';

import { defineDiyComponent, diySlider } from './primitives';

/**
 * `blankPage` — 辅助空白.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const blankPageSchema = defineDiyComponent('blankPage', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  heightConfig: diySlider.optional(),
});

export type BlankPageComponent = z.infer<typeof blankPageSchema>;
