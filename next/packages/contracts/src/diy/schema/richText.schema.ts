import { z } from 'zod';

import { defineDiyComponent, diySlider } from './primitives';

/**
 * `richText` — 富文本.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const richTextSchema = defineDiyComponent('richText', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  richText: diySlider.optional(),
});

export type RichTextComponent = z.infer<typeof richTextSchema>;
