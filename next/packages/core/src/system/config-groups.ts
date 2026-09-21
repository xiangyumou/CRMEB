/**
 * The config-group bucket — a local stand-in for a `pnpm gen` aggregation.
 *
 * `defineConfigGroup` registers a group as a *side effect of the module being
 * imported*, so the generic settings screen can only list a group whose file
 * something imported. CR-2-c (accepted) asks the orchestrator's
 * `packages/core/scripts/gen.ts` to emit `config-groups.gen.ts` importing every
 * `src/**\/*.config.ts`, exactly the way `menu.gen.ts` and the worker's job
 * bucket already work. **CR-3-f1** carries the patch.
 *
 * Until that lands, this explicit list does the same job. It is the one file in
 * this stream that another stream will need to touch — adding a config group in
 * `catalog` or `payment` means one import line here — and it disappears the day
 * the generated bucket arrives.
 *
 * Import order does not matter: `describeGroup` sorts fields and
 * `allConfigGroups()` sorts groups by name.
 */

// system
import './agreement.config';
import './logistics.config';
import './map.config';
import './site.config';
import './sms.config';
import './trade.config';
import './wechat-mini.config';
import './wechat-oa.config';

// catalog — 商品设置.
import '../catalog/index';

// order — B1 owns `group: 'order'` (the pay window and the sweep limit); the
// screen still has to list it, so the bucket loads it through the domain index.
import '../order/index';

// storage — reached through its own index so the domain boundary is respected.
// Its conditional-visibility metadata is plain data on the other side (a
// registration call there would point the dependency back at `system`), so it
// is registered here alongside the import that loads the group.
import { storageConfigFieldExtras } from '../storage/index';
import { defineConfigFieldExtras } from './config-ui-extras';

defineConfigFieldExtras('storage', { ...storageConfigFieldExtras });
