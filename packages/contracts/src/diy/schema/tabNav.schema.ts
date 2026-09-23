import { z } from 'zod';

import { defineDiyComponent, diyColour, diyListBox, diyTabs } from './primitives';

/**
 * `tabNav` — 选项卡.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const tabNavSchema = defineDiyComponent('tabNav', {
  titleLeft: z.string().optional(),
  titleTab: z.string().optional(),
  titleRight: z.string().optional(),
  styleConfig: diyTabs.optional(),
  stickyConfig: diyTabs.optional(),
  tabListConfig: diyListBox.optional(),
  toneConfig: diyTabs.optional(),
  decorateColor: diyColour.optional(),
  decorateColor2: diyColour.optional(),
  textColor: diyColour.optional(),
  textColor2: diyColour.optional(),
  textColor3: diyColour.optional(),
  moduleColor: diyColour.optional(),
});

export type TabNavComponent = z.infer<typeof tabNavSchema>;
