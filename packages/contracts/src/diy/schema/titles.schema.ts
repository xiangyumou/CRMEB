import { z } from 'zod';

import { defineDiyComponent, diyColour, diyInput, diySlider, diyTabs } from './primitives';

/**
 * `titles` — 文本标题.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const titlesSchema = defineDiyComponent('titles', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  titleConfig: diyInput.optional(),
  titleConfigRight: diyInput.optional(),
  buttonConfig: diyTabs.optional(),
  linkConfig: diyInput.optional(),
  themeColor: diyColour.optional(),
  buttonColor: diyColour.optional(),
  moduleColor: diyColour.optional(),
  buttonText: diySlider.optional(),
  textPosition: diyTabs.optional(),
  textStyle: diyTabs.optional(),
  fontSize: diySlider.optional(),
});

export type TitlesComponent = z.infer<typeof titlesSchema>;
