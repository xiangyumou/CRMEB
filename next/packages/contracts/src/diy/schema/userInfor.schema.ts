import { z } from 'zod';

import { defineDiyComponent, diyColour, diyListBox, diyTabs, diyUpload } from './primitives';

/**
 * `userInfor` — 用户信息.
 *
 * Fields derived from `template/admin/src/components/mobilePage/home_userInfor.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const userInforSchema = defineDiyComponent('userInfor', {
  titleLeft: z.string().optional(),
  titleImg: z.string().optional(),
  titleRight: z.string().optional(),
  styleConfig: diyTabs.optional(),
  checkboxInfo: diyListBox.optional(),
  logoConfig: diyUpload.optional(),
  toneConfig: diyTabs.optional(),
  progressColor: diyColour.optional(),
  progressBgColor: diyColour.optional(),
  moduleColor: diyColour.optional(),
});

export type UserInforComponent = z.infer<typeof userInforSchema>;
