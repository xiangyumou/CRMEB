import { z } from 'zod';

import { defineDiyComponent, diyTabs, diyUpload } from './primitives';

/**
 * `videos` — 视频.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const videosSchema = defineDiyComponent('videos', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  imgConfig: diyUpload.optional(),
  videoConfig: diyUpload.optional(),
  scaleConfig: diyTabs.optional(),
});

export type VideosComponent = z.infer<typeof videosSchema>;
