import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyInput,
  diyListBox,
  diyTabs,
  diyUpload,
} from './primitives';

/**
 * `news` — 新闻公告.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const newsSchema = defineDiyComponent('news', {
  titleLeft: z.string().optional(),
  titleStyle: z.string().optional(),
  titleButton: z.string().optional(),
  titleContent: z.string().optional(),
  titleRight: z.string().optional(),
  styleConfig: diyTabs.optional(),
  titleConfig: diyTabs.optional(),
  imgConfig: diyUpload.optional(),
  titleTxtConfig: diyInput.optional(),
  rollConfig: diyTabs.optional(),
  buttonConfig: diyTabs.optional(),
  textConfig: diyInput.optional(),
  linkConfig: diyInput.optional(),
  listConfig: diyListBox.optional(),
  toneConfig: diyTabs.optional(),
  titleBgColor: diyColour.optional(),
  titleColor: diyColour.optional(),
  newsColor: diyColour.optional(),
  bntColor: diyColour.optional(),
  moduleColor: diyColour.optional(),
});

export type NewsComponent = z.infer<typeof newsSchema>;
