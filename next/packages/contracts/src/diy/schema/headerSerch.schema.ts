import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyInput,
  diyListBox,
  diySlider,
  diyTabs,
  diyUpload,
} from './primitives';

/**
 * `headerSerch` — 搜索框.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const headerSerchSchema = defineDiyComponent('headerSerch', {
  titleLeft: z.string().optional(),
  titleSearch: z.string().optional(),
  titleHotWords: z.string().optional(),
  titleRight: z.string().optional(),
  titleTxt: z.string().optional(),
  styleConfig: diyTabs.optional(),
  styleTypeConfig: diyTabs.optional(),
  logoConfig: diyUpload.optional(),
  titleConfig: diyInput.optional(),
  linkConfig: diyInput.optional(),
  tipConfig: diyInput.optional(),
  hotWords: diyListBox.optional(),
  numConfig: diySlider.optional(),
  txtFixConfig: diyTabs.optional(),
  txtStyleConfig: diyTabs.optional(),
  txtColor: diyColour.optional(),
  txtSize: diySlider.optional(),
  searchBoxColor: diyColour.optional(),
  tipColor: diyColour.optional(),
  hotWordsColor: diyColour.optional(),
  moduleColor: diyColour.optional(),
});

export type HeaderSerchComponent = z.infer<typeof headerSerchSchema>;
