import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyListBox,
  diySlider,
  diyTabs,
  diyUpload,
} from './primitives';

/**
 * `member` — 会员中心.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const memberSchema = defineDiyComponent('member', {
  titleLeft: z.string().optional(),
  titleImg: z.string().optional(),
  titleRight: z.string().optional(),
  infoStyleText: z.string().optional(),
  memberStyleText: z.string().optional(),
  iconStyleText: z.string().optional(),
  assetConfigText: z.string().optional(),
  styleConfig: diyTabs.optional(),
  memberStyleConfig: diyTabs.optional(),
  menuConfig: diyListBox.optional(),
  checkboxInfo: diyListBox.optional(),
  logoConfig: diyUpload.optional(),
  assetIconColor: diyColour.optional(),
  assetIconSize: diySlider.optional(),
  assetTextColor: diyColour.optional(),
  assetTextSize: diySlider.optional(),
});

export type MemberComponent = z.infer<typeof memberSchema>;
