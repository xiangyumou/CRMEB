/**
 * Contracts that merged ahead of the code that serves them.
 *
 * Three streams were split after their contracts had already landed on
 * `rewrite/integration`: **D2** (presale, whose contracts came in with D),
 * **F3** (statistics, whose contracts came in with F2) and **E3** (the WeChat
 * OA webhook, whose contracts came in with E2). The routes, the permission
 * atoms and the services are theirs to write.
 *
 * Without this list the `contracts` and `permissions` checks are right and
 * useless: right, because a contract with no route file really is a 404 and an
 * atom no `permissions.ts` declares really can never be granted; useless,
 * because both are true of every stream in flight and a guard that fails on
 * work in progress gets turned off.
 *
 * So each one is named here, with its owner, and reported as `pending(<stream>)`
 * instead. Exactly compared in both directions: an entry whose route file has
 * appeared, or whose atom is now declared, **fails** and must be deleted. The
 * list can only shrink, and K2 expects it empty.
 */

export interface PendingImplementation {
  /** Contract id, as `allRoutes` reports it. */
  id: string;
  /** Stream that owes the route file, the atom and the service. */
  stream: string;
  why: string;
}

export const PENDING_IMPLEMENTATIONS: readonly PendingImplementation[] = [
  // Empty since D2, F3 and E3 merged (2026-09-23). A contract whose route file
  // is owed by a stream still in flight goes here with the stream's name.
];

const BY_ID = new Map(PENDING_IMPLEMENTATIONS.map((entry) => [entry.id, entry]));

export function pendingImplementation(id: string): PendingImplementation | undefined {
  return BY_ID.get(id);
}
