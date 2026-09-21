import type { Actor, Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { authPermissions } from './permissions';

/**
 * The permission check. Two rules and nothing else:
 *
 *  1. a super admin passes everything;
 *  2. otherwise the atom must be in the actor's granted set.
 *
 * There is no wildcard, no hierarchy and no "implies". A screen that needs two
 * things checks two atoms. Cleverness here is how the old system ended up with
 * permissions nobody could reason about.
 */

/**
 * Atoms every authenticated admin holds without a grant. They only let an
 * admin see and end their own session, which is a precondition for the admin
 * UI to function at all — and `defineRoute` (frozen) demands a permission on
 * every `auth: 'admin'` route, so `/admin-api/auth/me` has to name something.
 */
export const IMPLICIT_ADMIN_PERMISSIONS: readonly string[] = Object.freeze([
  authPermissions['session:read'],
  authPermissions['session:delete'],
]);

export function hasPermission(actor: Actor, atom: string): boolean {
  if (actor.kind === 'system') return true;
  if (actor.kind !== 'admin') return false;
  if (actor.isSuper) return true;
  if (IMPLICIT_ADMIN_PERMISSIONS.includes(atom)) return true;
  return actor.permissions.includes(atom);
}

export function hasEveryPermission(actor: Actor, atoms: readonly string[]): boolean {
  return atoms.every((atom) => hasPermission(actor, atom));
}

export function hasSomePermission(actor: Actor, atoms: readonly string[]): boolean {
  return atoms.some((atom) => hasPermission(actor, atom));
}

/** 401 when nobody is logged in, 403 when somebody is but may not do this. */
export function requirePermission(ctx: Ctx, atom: string): void {
  if (ctx.actor.kind === 'anonymous') throw new DomainError('UNAUTHENTICATED');
  if (!hasPermission(ctx.actor, atom)) {
    throw new DomainError('FORBIDDEN', { details: { permission: atom } });
  }
}

/**
 * The effective list the admin shell receives in `/admin-api/auth/me`. A super
 * admin gets every granted atom *plus* `isSuper: true`; `<Can>` must
 * short-circuit on the flag rather than trying to enumerate everything.
 */
export function effectivePermissions(granted: readonly string[]): string[] {
  return [...new Set([...IMPLICIT_ADMIN_PERMISSIONS, ...granted])].sort();
}
