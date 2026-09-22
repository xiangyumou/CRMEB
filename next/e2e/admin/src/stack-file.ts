import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The handoff between `scripts/serve.ts` (which owns the containers) and the
 * specs (which need the same database to arrange fixtures and to read back
 * audit rows).
 *
 * A file rather than an environment variable, because Playwright spawns the
 * `webServer` command as a child: the parent cannot read anything the child
 * later discovers, and the ports are only known once the containers are up.
 *
 * It lives in the system temp directory, not in the repository, so no run can
 * leave something behind that `git status` would show or `prettier` would
 * reformat. `SHOP_E2E_STACK` overrides it when two suites must not collide.
 */

export const STACK_FILE = process.env.SHOP_E2E_STACK ?? path.join(tmpdir(), 'shop-e2e-admin.json');

export const PORT = Number(process.env.SHOP_E2E_PORT ?? 3210);

export const BASE_URL = process.env.SHOP_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/** Everything the specs need that only the serve script can know. */
export interface StackInfo {
  /** The database the server is talking to. */
  databaseUrl: string;
  /** The Redis the server is talking to, including the logical db index. */
  redisUrl: string;
  baseUrl: string;
  /** Where uploads land, so a spec can assert a file really was written. */
  uploadsDir: string;
  /** Seeded accounts, by role. Passwords are fixtures, never real secrets. */
  accounts: Record<string, { account: string; password: string; id: number }>;
  /** Seeded ids the specs address by name instead of by guessing. */
  fixtures: Record<string, number>;
}
