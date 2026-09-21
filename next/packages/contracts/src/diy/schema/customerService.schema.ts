import { z } from 'zod';

import { defineDiyComponent, diyGroup, diyTabs } from './primitives';

/**
 * `customerService` — 悬浮按钮.
 *
 * Fields derived from `template/admin/src/components/mobilePage/home_service.vue`.
 * Loose by construction: unknown keys round-trip untouched.
 */
export const customerServiceSchema = defineDiyComponent('customerService', {
  titleLeft: z.string().optional(),
  titleRight: z.string().optional(),
  buttonConfig: diyTabs.optional(),
  locationConfig: diyTabs.optional(),
  logoConfig: diyGroup.optional(),
});

export type CustomerServiceComponent = z.infer<typeof customerServiceSchema>;
