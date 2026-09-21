import { createDiyPanelRegistry, type AnyDiyPanelDefinition } from '../panel-api';
import goodListPanel from './goodList.panel';
import swiperBgPanel from './swiperBg.panel';
import titlesPanel from './titles.panel';

/**
 * Every config panel the editor knows.
 *
 * **Owned by stream G2 from here on.** Adding a panel is two lines — an import
 * and a row in the array — and nothing else in the editor changes. A component
 * key with no panel is not broken: `<DiyPanelHost>` falls back to the raw JSON
 * editor, which is also what the three render-only keys (`newVip`, `presale`,
 * `swipers`) get, since they have no editor UI in the old admin either.
 */
export const diyPanels: readonly AnyDiyPanelDefinition[] = [
  swiperBgPanel,
  goodListPanel,
  titlesPanel,
];

export const diyPanelRegistry = createDiyPanelRegistry(diyPanels);
