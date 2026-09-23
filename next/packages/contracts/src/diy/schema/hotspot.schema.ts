import { z } from 'zod';

import { defineDiyComponent, diyListBox } from './primitives';

/**
 * `hotspot` — 热区.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const hotspotSchema = defineDiyComponent('hotspot', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  picStyle: diyListBox.optional(),
});

export type HotspotComponent = z.infer<typeof hotspotSchema>;
