import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { admins, auditLogs } from '@shop/db/schema/auth';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { AdminAuthService } from './admin-auth.service';
import { hashPassword } from './password';

/**
 * The console sign-in, read as somebody guessing passwords (K2, AUDIT.md
 * K-SEC-A4).
 *
 * The per-account window parks an account after five misses, and that part
 * works. What it leaves behind is nothing: a failure only throws, the route is
 * `auth: 'public'` so `handle()` writes no audit row (by design — the body
 * holds the password), and the lockout itself is a Redis counter that expires.
 * An operator asked "was somebody trying our admin passwords last week" has no
 * row to read, and neither does the successful login that follows a run of
 * failures.
 *
 * The `it.fails` is CR-12-k2: record the *outcome* of each attempt — account,
 * result, address, never the body — somewhere an operator can read.
 */

let harness: TestCtx;
let auth: AdminAuthService;

const PASSWORD = 'crmeb123456';
const GUESS = 'guess-0001';

beforeAll(async () => {
  harness = await createTestCtx();
  auth = new AdminAuthService(harness.ctx, { bcryptCost: 4 });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
  await harness.ctx.db.insert(admins).values({
    account: 'admin',
    passwordHash: await hashPassword(PASSWORD, 4),
    passwordAlgo: 'bcrypt',
    name: '超级管理员',
    isSuper: true,
    status: 1,
  });
});

describe('K-SEC-A4 — what a password-guessing run leaves behind', () => {
  it('parks the account after five misses', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await auth.login(harness.ctx, { account: 'admin', password: GUESS }).catch(() => undefined);
    }
    await expect(
      auth.login(harness.ctx, { account: 'admin', password: PASSWORD }),
    ).rejects.toMatchObject({ code: 'AUTH_TOO_MANY_ATTEMPTS' });
  });

  it.fails('leaves a readable trail of the failed attempts, without the password', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await auth.login(harness.ctx, { account: 'admin', password: GUESS }).catch(() => undefined);
    }

    const rows = await harness.ctx.db.select().from(auditLogs);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(rows)).toContain('admin');
    expect(JSON.stringify(rows)).not.toContain(GUESS);
  });
});
