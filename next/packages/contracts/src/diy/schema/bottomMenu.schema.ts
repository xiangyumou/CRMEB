import { z } from 'zod';

import {
  defineDiyComponent,
  diyColour,
  diyFillet,
  diyListBox,
  diySlider,
  diyTabs,
} from './primitives';

/**
 * `bottomMenu` — 底部菜单.
 *
 * Loose by construction: unknown keys round-trip untouched.
 */
export const bottomMenuSchema = defineDiyComponent('bottomMenu', {
  entryConfig: diyTabs.optional(),
  styleTitle: z.string().optional(),
  iconColor: diyColour.optional(),
  iconSize: diySlider.optional(),
  iconRotate: diySlider.optional(),
  padding: diySlider.optional(),
  contentConfigTitle: z.string().optional(),
  showContent: diyListBox.optional(),
  cartButton: diyTabs.optional(),
  menuConfig: diyListBox.optional(),
  buttonStyleTitle: z.string().optional(),
  toneConfig: diyTabs.optional(),
  cartColor: diyColour.optional(),
  buyColor: diyColour.optional(),
  generalStyleTitle: z.string().optional(),
  moduleColor: diyColour.optional(),
  menuPcFillet: diyFillet.optional(),
});

export type BottomMenuComponent = z.infer<typeof bottomMenuSchema>;
