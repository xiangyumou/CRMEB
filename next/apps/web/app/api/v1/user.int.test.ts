import { AdminAuthService, hashPassword, UserSessionService } from '@shop/core/auth';
import {
  fakeSmsSender,
  registerSmsSender,
  resetSmsSender,
  type FakeSmsSender,
} from '@shop/core/sms';
import { smsConfig } from '@shop/core/system';
import { storefrontAuthConfig } from '@shop/core/user';
import { adminRoles, admins, auditLogs, rolePermissions, roles } from '@shop/db/schema/auth';
import { users } from '@shop/db/schema/user';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setContainer, type Container } from '../../../src/server/container';
import type { Env } from '../../../src/server/env';
import { ADMIN_COOKIE } from '../../../src/server/handle';

/**
 * The user and sign-in routes as HTTP, against a real database and Redis.
 *
 * The behaviour itself is pinned down in `@shop/core`; what a route file can
 * get wrong is narrower and is what this file proves: the contract is bound to
 * the right method and path, `auth` and `permission` are enforced before the
 * service runs, a body is validated before anything is written, the client IP
 * really reaches the throttle, and an admin write lands in `audit_logs`.
 *
 * Importing `@shop/core/user` for its side effect is what makes a storefront
 * token resolve at all: it installs the real `UserLookup`, where the other
 * route suites still register the fake.
 */

let harness: TestCtx;
let sms: FakeSmsSender;

const PASSWORD = 'crmeb123456';
const BCRYPT_COST = 4;
const ORIGIN = 'https://shop.example';
const PHONE = '13800138000';

const env: Env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'unused',
  REDIS_URL: 'unused',
  UPLOADS_DIR: '/tmp/uploads',
  UPLOADS_PUBLIC_PREFIX: '/uploads',
  APP_ORIGIN: ORIGIN,
  EXTRA_ALLOWED_ORIGINS: [],
  LOG_LEVEL: 'silent',
  LOG_PRETTY: false,
  VALIDATE_RESPONSES: true,
  DB_POOL_MAX: 5,
  QUEUE_NAME: 'shop',
  APP_VERSION: 'test',
};

beforeAll(async () => {
  harness = await createTestCtx({ now: '2026-06-01T00:00:00.000Z' });
  const container: Container = {
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
  setContainer(container);
}, 180_000);

afterAll(async () => {
  setContainer(undefined);
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
  sms = fakeSmsSender();
  registerSmsSender(sms);
  await harness.ctx.config.set(smsConfig, { templateVerifyCode: 'SMS_1' });
});

afterEach(() => {
  resetSmsSender();
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const json = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
  });

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { headers });

/** Sign in through the real routes and keep the bearer token. */
async function shopper(
  ip = '203.0.113.7',
): Promise<{ token: string; headers: Record<string, string> }> {
  const { POST: sendCode } = await import('./auth/sms-codes/route');
  await sendCode(
    json(
      'POST',
      '/api/v1/auth/sms-codes',
      { phone: PHONE, scene: 'login' },
      { 'x-forwarded-for': ip },
    ),
  );
  const { POST: smsLogin } = await import('./auth/sessions/sms/route');
  const response = await smsLogin(
    json(
      'POST',
      '/api/v1/auth/sessions/sms',
      { phone: PHONE, code: sms.lastCodeFor(PHONE) },
      { 'x-forwarded-for': ip },
    ),
  );
  // 201: the contract says a sign-in creates a session resource.
  expect(response.status).toBe(201);
  const body = await response.json();
  return { token: body.token, headers: { authorization: `Bearer ${body.token}` } };
}

/** An operator with exactly the permissions named, or a super admin with none named. */
async function adminCookie(permissions?: string[]): Promise<Record<string, string>> {
  const [admin] = await harness.ctx.db
    .insert(admins)
    .values({
      account: 'operator',
      passwordHash: await hashPassword(PASSWORD, BCRYPT_COST),
      name: '运营',
      isSuper: permissions === undefined,
    })
    .returning({ id: admins.id });

  if (permissions?.length) {
    const [role] = await harness.ctx.db
      .insert(roles)
      .values({ name: 'customer-operator' })
      .returning({ id: roles.id });
    await harness.ctx.db.insert(adminRoles).values({ adminId: admin!.id, roleId: role!.id });
    await harness.ctx.db
      .insert(rolePermissions)
      .values(permissions.map((permission) => ({ roleId: role!.id, permission })));
  }

  const { POST: login } = await import('../../admin-api/auth/login/route');
  const response = await login(
    json('POST', '/admin-api/auth/login', { account: 'operator', password: PASSWORD }),
  );
  const token = new RegExp(`${ADMIN_COOKIE}=([^;]+)`).exec(
    response.headers.get('set-cookie') ?? '',
  )?.[1];
  return { cookie: `${ADMIN_COOKIE}=${token}` };
}

// ---------------------------------------------------------------------------
// storefront
// ---------------------------------------------------------------------------

describe('POST /api/v1/auth/sms-codes', () => {
  it('sends a code anonymously and refuses the bound-account scenes', async () => {
    const { POST } = await import('./auth/sms-codes/route');

    const sent = await POST(
      json('POST', '/api/v1/auth/sms-codes', { phone: PHONE, scene: 'login' }),
    );
    // 202: the code is handed to the provider, not delivered by this response.
    expect(sent.status).toBe(202);
    expect(sms.sent).toHaveLength(1);

    const refused = await POST(
      json('POST', '/api/v1/auth/sms-codes', { phone: PHONE, scene: 'bind-phone' }),
    );
    expect(refused.status).toBe(401);
    expect((await refused.json()).code).toBe('UNAUTHENTICATED');
  });

  it('422s a phone number the schema refuses, without sending anything', async () => {
    const { POST } = await import('./auth/sms-codes/route');
    const response = await POST(
      json('POST', '/api/v1/auth/sms-codes', { phone: '1234', scene: 'login' }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('VALIDATION_FAILED');
    expect(sms.sent).toHaveLength(0);
  });

  it('counts the per-IP budget against the address the proxy forwarded', async () => {
    // The route reads the *first* `x-forwarded-for` entry. Reading the last
    // would put every shopper behind the proxy into one bucket, and the first
    // few dozen codes of the day would lock out the shop.
    await harness.ctx.config.set(storefrontAuthConfig, { codePerIpPerDay: 10 });
    const { POST } = await import('./auth/sms-codes/route');
    const fromClient = (phone: string, client: string) =>
      POST(
        json(
          'POST',
          '/api/v1/auth/sms-codes',
          { phone, scene: 'login' },
          { 'x-forwarded-for': `${client}, 10.0.0.1` },
        ),
      );

    for (let i = 0; i < 10; i += 1) {
      expect((await fromClient(`1380013${8100 + i}`, '203.0.113.9')).status).toBe(202);
    }
    expect((await fromClient('13800138200', '203.0.113.9')).status).toBe(429);
    // The next shopper through the same proxy is unaffected.
    expect((await fromClient('13800138201', '203.0.113.10')).status).toBe(202);
  });
});

describe('/api/v1/profile', () => {
  it('401s without a token and answers the caller with one', async () => {
    const { GET } = await import('./profile/route');
    expect((await GET(get('/api/v1/profile'))).status).toBe(401);

    const { headers } = await shopper();
    const response = await GET(get('/api/v1/profile', headers));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ phone: PHONE, hasPassword: false });
  });

  it('edits the nickname and refuses an empty one', async () => {
    const { PUT } = await import('./profile/route');
    const { headers } = await shopper();

    const ok = await PUT(json('PUT', '/api/v1/profile', { nickname: '小明' }, headers));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ nickname: '小明' });

    const bad = await PUT(json('PUT', '/api/v1/profile', { nickname: '' }, headers));
    expect(bad.status).toBe(422);
  });
});

describe('DELETE /api/v1/auth/sessions/current', () => {
  it('revokes the bearer token it was called with, and only that one', async () => {
    const first = await shopper();
    await harness.redis.del(`sms:resend:login:${PHONE}`);
    const second = await shopper();

    const { DELETE } = await import('./auth/sessions/current/route');
    const response = await DELETE(
      json('DELETE', '/api/v1/auth/sessions/current', undefined, first.headers),
    );
    expect(response.status).toBe(200);

    const { GET } = await import('./profile/route');
    expect((await GET(get('/api/v1/profile', first.headers))).status).toBe(401);
    expect((await GET(get('/api/v1/profile', second.headers))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

describe('/admin-api/users', () => {
  it('401s without a session and 403s without the permission', async () => {
    const { GET } = await import('../../admin-api/users/route');
    expect((await GET(get('/admin-api/users?page=1&pageSize=20'))).status).toBe(401);

    const headers = await adminCookie(['catalog:product:read']);
    const forbidden = await GET(get('/admin-api/users?page=1&pageSize=20', headers));
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).code).toBe('FORBIDDEN');
  });

  it('lists customers for an operator holding user:customer:read', async () => {
    await shopper();
    const headers = await adminCookie(['user:customer:read']);
    const { GET } = await import('../../admin-api/users/route');

    const response = await GET(get('/admin-api/users?page=1&pageSize=20', headers));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ total: 1, page: 1, pageSize: 20 });
  });

  it('disables an account, writes the audit row and kills the live token', async () => {
    const { headers: shopperHeaders } = await shopper();
    const [row] = await harness.ctx.db.select({ id: users.id }).from(users);
    const headers = await adminCookie(['user:customer:status']);
    const { POST } = await import('../../admin-api/users/[id]/status/route');

    const response = await POST(
      json('POST', `/admin-api/users/${row!.id}/status`, { status: 'disabled' }, headers),
      { params: { id: String(row!.id) } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'disabled' });

    const audit = await harness.ctx.db.select().from(auditLogs);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ routeId: 'user.adminSetStatus', target: `user:${row!.id}` });

    // The ban takes effect on the session the shopper already holds.
    const { GET } = await import('./profile/route');
    expect((await GET(get('/api/v1/profile', shopperHeaders))).status).toBe(401);
  });
});
