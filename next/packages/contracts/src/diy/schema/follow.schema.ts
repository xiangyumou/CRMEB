import { z } from 'zod';

import { defineDiyComponent, diyColour, diyInput, diyTabs, diyUpload } from './primitives';

/**
 * `follow` — 关注公众号.
 *
 * Fields derived from `template/admin/src/components/mobilePage/z_wechat_attention.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const followSchema = defineDiyComponent('follow', {
  titleLeft: z.string().optional(),
  positionTitle: z.string().optional(),
  pictrueTitle: z.string().optional(),
  codeTitle: z.string().optional(),
  titleRight: z.string().optional(),
  positionConfig: diyTabs.optional(),
  titleConfig: diyInput.optional(),
  imgConfig: diyUpload.optional(),
  codeConfig: diyUpload.optional(),
  themeColor: diyColour.optional(),
});

export type FollowComponent = z.infer<typeof followSchema>;
