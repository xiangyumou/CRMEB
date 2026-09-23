import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyFillet,
  diyGroup,
  diyListBox,
  diyTabs,
} from './primitives';

/**
 * `menus` — 导航组.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const menusSchema = defineDiyComponent('menus', {
  titleLeft: z.string().optional(),
  titleContent: z.string().optional(),
  titleRight: z.string().optional(),
  titlePointer: z.string().optional(),
  menuStyleConfig: diyTabs.optional(),
  navDisplayStyle: diyTabs.optional(),
  number: diyTabs.optional(),
  gridStyle: diyTabs.optional(),
  gridItemStyle: diyGroup.optional(),
  headerConfig: diyGroup.optional(),
  headerStyle: diyGroup.optional(),
  leftTopText: diyGroup.optional(),
  rightTopText: diyGroup.optional(),
  showConfig: diyTabs.optional(),
  rowsNum: diyTabs.optional(),
  filletImg: diyFillet.optional(),
  toneConfig: diyTabs.optional(),
  pointerBgColor: diyColour.optional(),
  pointerColor: diyColour.optional(),
  textColor: diyColour.optional(),
  menuConfig: diyListBox.optional(),
  iconStyleConfig: diyGroup.optional(),
});

export type MenusComponent = z.infer<typeof menusSchema>;
