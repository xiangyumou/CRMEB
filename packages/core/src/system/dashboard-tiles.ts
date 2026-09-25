import { paymentEffectScopes } from '@shop/contracts/payment/schemas';
import { hasPermission } from '../auth/rbac';
import { countParkedEffects } from '../effects';
import type { Ctx } from '../kernel/context';
import { countUnresolvedFailedJobs } from '../kernel/failed-jobs.repo';
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

/** The console that lists parked effects, and the atom it needs. */
const EFFECTS_CONSOLE = { href: '/admin/trade/effects', atom: 'payment:effect:handle' } as const;
const FAILED_JOBS_PAGE = { href: '/admin/system/failed-jobs', atom: 'system:job:handle' } as const;

/**
 * 「异常待处理」: work that stopped and waits for a person (AGENTS.md rule 9).
 *
 * Two sources: effects parked after their retries ran out, in the scopes the
 * 待处理任务 console shows (`paymentEffectScopes` — refunds that never left,
 * WeChat 发货信息 never recorded, groupbuys never settled…), and background
 * jobs that failed every retry (`failed_jobs`). Each half is counted only for an
 * admin who may open its screen, and the tile links to the screen with work in
 * it. Two `count(*)`s on indexed or tiny sets; nothing for an admin who holds
 * neither atom.
 */
export async function attentionTiles(ctx: Ctx) {
  const canEffects = hasPermission(ctx.actor, EFFECTS_CONSOLE.atom);
  const canJobs = hasPermission(ctx.actor, FAILED_JOBS_PAGE.atom);
  if (!canEffects && !canJobs) return [];
  const [parked, failed] = await Promise.all([
    canEffects ? countParkedEffects(ctx, paymentEffectScopes) : 0,
    canJobs ? countUnresolvedFailedJobs(ctx.db) : 0,
  ]);
  const href =
    canEffects && (parked > 0 || failed === 0 || !canJobs)
      ? EFFECTS_CONSOLE.href
      : FAILED_JOBS_PAGE.href;
  return [
    {
      ...countTile({ key: 'system.attention', label: '异常待处理', value: parked + failed, href }),
      attention: true,
    },
  ];
}

registerDashboardContributor({
  key: 'attention',
  // First on the page: it is the one figure that asks somebody to act.
  order: 0,
  tiles: attentionTiles,
});
