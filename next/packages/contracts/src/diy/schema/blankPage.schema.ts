import { z } from 'zod';

import { defineDiyComponent, diySlider } from './primitives';

/**
 * `blankPage` — 辅助空白.
 *
 * Fields derived from `template/admin/src/components/mobilePage/z_auxiliary_box.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const blankPageSchema = defineDiyComponent('blankPage', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  heightConfig: diySlider.optional(),
});

export type BlankPageComponent = z.infer<typeof blankPageSchema>;
