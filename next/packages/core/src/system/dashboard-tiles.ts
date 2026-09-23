import { storageDashboardContributor } from '../storage/index';
import { countTile, registerDashboardContributor } from './dashboard';
import * as repo from './system.repo';

/**
 * The tiles `system` contributes, and the registration bucket for `system` and
 * `storage`.
 *
 * Registration is a side effect of import, exactly like config groups, so
 * `system/index.ts` imports this file and nothing else has to know. Any other
 * domain registers its own from its own `index.ts`, importing
 * `registerDashboardContributor` from `@shop/core/system`.
 *
 * `storage`'s contributor is registered from here rather than from its own
 * module so the dependency stays one-way: `system` already imports `storage`
 * for its config group, and a second edge back would be a cycle.
 */

registerDashboardContributor({
  key: 'system',
  permission: 'system:admin:read',
  order: 900,
  async tiles(ctx) {
    const admins = await repo.countAdmins(ctx.db);
    return [
      countTile({
        key: 'system.admins',
        label: '管理员',
        value: admins,
        href: '/admin/system/admins',
      }),
    ];
  },
});

registerDashboardContributor(storageDashboardContributor);
