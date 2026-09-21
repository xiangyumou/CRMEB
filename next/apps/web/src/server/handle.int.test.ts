import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { admins, adminRoles, rolePermissions, roles } from '@shop/db/schema/auth';
import { auditLogs } from '@shop/db/schema/auth';
import { AdminAuthService, hashPassword, UserSessionService } from '@shop/core/auth';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { ADMIN_COOKIE } from './handle';
import type { Container } from './container';
import { setContainer } from './container';
import type { Env } from './env';

/**
 * `handle()` end to end: the real route modules, the real services, a real
 * PostgreSQL and Redis. The unit tests cover the binder's branches; this
 * covers the wiring — that a login really sets a cookie the next request can
 * present, that a permission really comes from the database, and that an
 * operation really lands in `audit_logs`.
 */

let harness: TestCtx;
let container: Container;

const PASSWORD = 'crmeb123456';
const BCRYPT_COST = 4;

const env: Env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'unused',
  REDIS_URL: 'unused',
  UPLOADS_DIR: '/tmp/uploads',
  UPLOADS_PUBLIC_PREFIX: '/uploads',
  APP_ORIGIN: 'https://shop.example',
  EXTRA_ALLOWED_ORIGINS: [],
  LOG_LEVEL: 'silent',
  LOG_PRETTY: false,
  VALIDATE_RESPONSES: true,
  DB_POOL_MAX: 5,
  QUEUE_NAME: 'shop',
  APP_VERSION: 'test',
};

beforeAll(async () => {
  harness = await createTestCtx();
  container = {
    env,
    dbHandle: harness.db.handle,
    db: harness.ctx.db,
    redis: harness.redis,
    clock: harness.clock,
    logger: harness.ctx.logger,
    queue: harness.ctx.queue,
    storage: harness.ctx.storage,
    config: harness.ctx.config,
    adminAuth: new AdminAuthService(harness.ctx, { bcryptCost: BCRYPT_COST }),
    userSessions: new UserSessionService(),
    close: async () => {},
  };
  // The route modules call `getContainer()`; give them this one.
  setContainer(container);
}, 180_000);

afterAll(async () => {
  setContainer(undefined);
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
});

async function seedAdmin(options: { isSuper: boolean; permissions?: string[] }): Promise<number> {
  const [admin] = await harness.ctx.db
    .insert(admins)
    .values({
      account: 'admin',
      passwordHash: await hashPassword(PASSWORD, BCRYPT_COST),
      name: '超级管理员',
      isSuper: options.isSuper,
    })
    .returning({ id: admins.id });

  if (options.permissions?.length) {
    const [role] = await harness.ctx.db
      .insert(roles)
      .values({ name: 'operator' })
      .returning({ id: roles.id });
    await harness.ctx.db.insert(adminRoles).values({ adminId: admin!.id, roleId: role!.id });
    await harness.ctx.db
      .insert(rolePermissions)
      .values(options.permissions.map((permission) => ({ roleId: role!.id, permission })));
  }
  return admin!.id;
}

/** Extracts the `admin_session` cookie value from a Set-Cookie header. */
function sessionCookie(response: Response): string | null {
  const header = response.headers.get('set-cookie');
  if (!header) return null;
  return new RegExp(`${ADMIN_COOKIE}=([^;]+)`).exec(header)?.[1] ?? null;
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://shop.example${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
  });

describe('the health routes', () => {
  it('answer on both surfaces without a session', async () => {
    const { GET: storefront } = await import('../../app/api/v1/health/route');
    const { GET: admin } = await import('../../app/admin-api/health/route');

    for (const [handler, path] of [
      [storefront, '/api/v1/health'],
      [admin, '/admin-api/health'],
    ] as const) {
      const response = await handler(new Request(`https://shop.example${path}`));
      expect(response.status, path).toBe(200);
      const payload = await response.json();
      expect(payload.status).toBe('ok');
      // The contract requires ISO-8601 with an offset; `Z` counts.
      expect(payload.time).toBe('2026-01-01T00:00:00.000Z');
    }
  });
});

describe('the admin auth routes', () => {
  it('logs in, sets an httpOnly cookie and returns the profile', async () => {
    const id = await seedAdmin({ isSuper: true });
    const { POST: login } = await import('../../app/admin-api/auth/login/route');

    const response = await login(
      post('/admin-api/auth/login', { account: 'admin', password: PASSWORD }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: String(id),
      account: 'admin',
      isSuper: true,
    });

    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    // NODE_ENV is `test`, so not Secure — it must be Secure in production.
    expect(cookie).not.toContain('Secure');
    expect(sessionCookie(response)).toMatch(/^[a-z2-9]{40}$/);
  });

  it('refuses a wrong password with the contract error', async () => {
    await seedAdmin({ isSuper: true });
    const { POST: login } = await import('../../app/admin-api/auth/login/route');
    const response = await login(
      post('/admin-api/auth/login', { account: 'admin', password: 'no' }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      code: 'AUTH_INVALID_CREDENTIALS',
      message: '账号或密码不正确',
    });
  });

  it('422s a malformed login body before touching the database', async () => {
    const { POST: login } = await import('../../app/admin-api/auth/login/route');
    const response = await login(post('/admin-api/auth/login', { account: '' }));
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.code).toBe('VALIDATION_FAILED');
    expect(payload.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'account',
      'password',
    ]);
  });

  it('carries the session from login to /me and back out through /logout', async () => {
    await seedAdmin({ isSuper: false, permissions: ['catalog:product:read'] });
    const { POST: login } = await import('../../app/admin-api/auth/login/route');
    const { GET: me } = await import('../../app/admin-api/auth/me/route');
    const { POST: logout } = await import('../../app/admin-api/auth/logout/route');

    const loggedIn = await login(
      post('/admin-api/auth/login', { account: 'admin', password: PASSWORD }),
    );
    const token = sessionCookie(loggedIn)!;
    const withCookie = { cookie: `${ADMIN_COOKIE}=${token}` };

    const profile = await me(
      new Request('https://shop.example/admin-api/auth/me', { headers: withCookie }),
    );
    expect(profile.status).toBe(200);
    expect((await profile.json()).permissions).toEqual([
      'auth:session:delete',
      'auth:session:read',
      'catalog:product:read',
    ]);

    const goodbye = await logout(post('/admin-api/auth/logout', undefined, withCookie));
    expect(goodbye.status).toBe(200);
    expect(await goodbye.json()).toEqual({ ok: true });
    expect(goodbye.headers.get('set-cookie')).toContain('Max-Age=0');

    // The session really is gone.
    const after = await me(
      new Request('https://shop.example/admin-api/auth/me', { headers: withCookie }),
    );
    expect(after.status).toBe(401);
    expect((await after.json()).code).toBe('AUTH_SESSION_EXPIRED');
  });

  it('401s /me without a cookie', async () => {
    const { GET: me } = await import('../../app/admin-api/auth/me/route');
    const response = await me(new Request('https://shop.example/admin-api/auth/me'));
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe('UNAUTHENTICATED');
  });

  it('blocks a cross-site logout that carries the cookie', async () => {
    await seedAdmin({ isSuper: true });
    const { POST: login } = await import('../../app/admin-api/auth/login/route');
    const { POST: logout } = await import('../../app/admin-api/auth/logout/route');

    const loggedIn = await login(
      post('/admin-api/auth/login', { account: 'admin', password: PASSWORD }),
    );
    const token = sessionCookie(loggedIn)!;

    const response = await logout(
      post('/admin-api/auth/logout', undefined, {
        cookie: `${ADMIN_COOKIE}=${token}`,
        'sec-fetch-site': 'cross-site',
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('AUTH_CROSS_SITE_BLOCKED');
  });

  it('writes an audit row for the logout, with no secret in it', async () => {
    await seedAdmin({ isSuper: true });
    const { POST: login } = await import('../../app/admin-api/auth/login/route');
    const { POST: logout } = await import('../../app/admin-api/auth/logout/route');

    const loggedIn = await login(
      post('/admin-api/auth/login', { account: 'admin', password: PASSWORD }),
    );
    await logout(
      post('/admin-api/auth/logout', undefined, {
        cookie: `${ADMIN_COOKIE}=${sessionCookie(loggedIn)}`,
      }),
    );

    const rows = await harness.ctx.db.select().from(auditLogs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      adminAccount: 'admin',
      routeId: 'auth.adminLogout',
      method: 'POST',
      path: '/admin-api/auth/logout',
      status: 200,
    });
    expect(JSON.stringify(rows[0])).not.toContain(PASSWORD);
  });

  it('does NOT audit the login itself — the body holds the password', async () => {
    await seedAdmin({ isSuper: true });
    const { POST: login } = await import('../../app/admin-api/auth/login/route');
    await login(post('/admin-api/auth/login', { account: 'admin', password: PASSWORD }));
    // `auth: 'public'` means no admin actor at the time of the write, so no row.
    expect(await harness.ctx.db.select().from(auditLogs)).toHaveLength(0);
  });

  it('parks the account after five wrong passwords, through the route', async () => {
    await seedAdmin({ isSuper: true });
    const { POST: login } = await import('../../app/admin-api/auth/login/route');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login(post('/admin-api/auth/login', { account: 'admin', password: 'no' }));
    }
    const response = await login(
      post('/admin-api/auth/login', { account: 'admin', password: PASSWORD }),
    );
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe('AUTH_TOO_MANY_ATTEMPTS');
  });
});
