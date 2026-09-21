import { z } from 'zod';

import { defineDiyComponent, diyFillet, diyGroup, diyListBox, diySlider } from './primitives';

/**
 * `pictureCube` — 图片魔方.
 *
 * Fields derived from `template/admin/src/components/mobilePage/picture_cube.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const pictureCubeSchema = defineDiyComponent('pictureCube', {
  titleLeft: z.string().optional(),
  titleShow: z.string().optional(),
  titleContent: z.string().optional(),
  titleRight: z.string().optional(),
  styleConfig: diyGroup.optional(),
  picStyle: diyGroup.optional(),
  menuConfig: diyListBox.optional(),
  imgConfig: diySlider.optional(),
  filletImg: diyFillet.optional(),
});

export type PictureCubeComponent = z.infer<typeof pictureCubeSchema>;
