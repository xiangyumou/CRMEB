import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminRoles, admins, auditLogs, rolePermissions, roles } from '@shop/db/schema/auth';
import { diyPages } from '@shop/db/schema/diy';
import { AdminAuthService, hashPassword, UserSessionService } from '@shop/core/auth';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { ADMIN_COOKIE } from '../../../src/server/handle';
import { setContainer, type Container } from '../../../src/server/container';
import type { Env } from '../../../src/server/env';

/**
 * The DIY routes as HTTP, against a real database.
 *
 * The domain behaviour is pinned down in `packages/core/src/diy/diy.int.test.ts`.
 * What is proved here is only what a route file can get wrong: that the
 * contract is bound to the right method and path, that `auth` and `permission`
 * run before the service, that a body is validated before anything is written,
 * that a domain refusal arrives as its declared status with its Chinese
 * message, that a write lands in `audit_logs`, and that the storefront read is
 * public.
 */

let harness: TestCtx;

const PASSWORD = 'crmeb123456';
const BCRYPT_COST = 4;
const ORIGIN = 'https://shop.example';

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

let roleSeq = 0;

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
      .values({ name: `diy-operator-${(roleSeq += 1)}` })
      .returning({ id: roles.id });
    await harness.ctx.db.insert(adminRoles).values({ adminId: admin!.id, roleId: role!.id });
    await harness.ctx.db
      .insert(rolePermissions)
      .values(permissions.map((permission) => ({ roleId: role!.id, permission })));
  }

  const { POST: login } = await import('../auth/login/route');
  const response = await login(
    json('POST', '/admin-api/auth/login', { account: 'operator', password: PASSWORD }),
  );
  const token = new RegExp(`${ADMIN_COOKIE}=([^;]+)`).exec(
    response.headers.get('set-cookie') ?? '',
  )?.[1];
  return { cookie: `${ADMIN_COOKIE}=${token}` };
}

/** One real node, keyed by its own timestamp exactly as the editor saves it. */
const CONTENT = {
  '1740448022001': {
    name: 'titles',
    timestamp: 1740448022001,
    cname: '标题',
    setUp: { tabVal: 0 },
    titleConfig: { val: '今日推荐' },
  },
};

async function createPage(
  headers: Record<string, string>,
  body: Record<string, unknown> = { name: '活动专题页', kind: 'micro' },
): Promise<{ id: string; version: string }> {
  const { POST } = await import('./pages/route');
  const response = await POST(json('POST', '/admin-api/diy/pages', body, headers));
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; version: string };
}

// ---------------------------------------------------------------------------
// the admin surface
// ---------------------------------------------------------------------------

describe('/admin-api/diy/pages', () => {
  it('401s without a session and 403s without the permission', async () => {
    const { GET } = await import('./pages/route');

    expect((await GET(get('/admin-api/diy/pages?page=1&pageSize=20'))).status).toBe(401);

    const headers = await adminCookie(['catalog:product:read']);
    const forbidden = await GET(get('/admin-api/diy/pages?page=1&pageSize=20', headers));
    expect(forbidden.status).toBe(403);
    expect(((await forbidden.json()) as { code: string }).code).toBe('FORBIDDEN');
  });

  it('lists for an admin holding diy:page:read', async () => {
    const headers = await adminCookie(['diy:page:read']);
    const { GET } = await import('./pages/route');

    const response = await GET(get('/admin-api/diy/pages?page=1&pageSize=20', headers));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('creates with 201 and writes an audit row', async () => {
    const headers = await adminCookie(['diy:page:create']);
    const created = await createPage(headers);

    const audit = (await harness.ctx.db.select().from(auditLogs)).filter(
      // Sign-ins are audited too (CR-12-k2); this test is about the operation.
      (row) => row.routeId !== 'auth.adminLogin',
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      routeId: 'diy.adminPageCreate',
      target: `diy:page:${created.id}`,
    });
  });

  it('422s a form the schema refuses, before writing anything', async () => {
    const headers = await adminCookie(['diy:page:create']);
    const { POST } = await import('./pages/route');

    const response = await POST(
      json('POST', '/admin-api/diy/pages', { name: '', kind: 'micro' }, headers),
    );
    expect(response.status).toBe(422);
    expect(((await response.json()) as { code: string }).code).toBe('VALIDATION_FAILED');
    expect(await harness.ctx.db.select().from(diyPages)).toHaveLength(0);
  });

  it('reports a missing page as the contract declares, in Chinese', async () => {
    const headers = await adminCookie();
    const { GET } = await import('./pages/[id]/route');

    const response = await GET(get('/admin-api/diy/pages/999', headers), {
      params: Promise.resolve({ id: '999' }),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: 'DIY_PAGE_NOT_FOUND',
      message: '模板不存在',
    });
  });
});

describe('/admin-api/diy/pages/:id/content', () => {
  it('saves the envelope, audits it, and refuses a stale version with 409', async () => {
    const headers = await adminCookie();
    const created = await createPage(headers);
    const { PUT } = await import('./pages/[id]/content/route');
    const params = { params: Promise.resolve({ id: created.id }) };

    const saved = await PUT(
      json(
        'PUT',
        `/admin-api/diy/pages/${created.id}/content`,
        { content: CONTENT, version: created.version },
        headers,
      ),
      params,
    );
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { version: string; content: unknown };
    // Deep equality, not bytes: `jsonb` sorts the keys inside a node, so what
    // comes back out of PostgreSQL is the same page with `timestamp` moved
    // (invariants DIY-008, CR-1-g1). No value is lost or coerced.
    expect(body.content).toEqual(CONTENT);
    expect(body.version).not.toBe(created.version);

    const audit = (await harness.ctx.db.select().from(auditLogs)).filter(
      // Sign-ins are audited too (CR-12-k2); this test is about the operation.
      (row) => row.routeId !== 'auth.adminLogin',
    );
    expect(audit.at(-1)).toMatchObject({
      routeId: 'diy.adminPageSaveContent',
      target: `diy:page:${created.id}`,
    });

    // The editor that loaded the first version now loses.
    const stale = await PUT(
      json(
        'PUT',
        `/admin-api/diy/pages/${created.id}/content`,
        { content: CONTENT, version: created.version },
        headers,
      ),
      params,
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      code: 'DIY_VERSION_CONFLICT',
      message: '页面已被其他人修改，请刷新后重新保存',
    });
  });

  it('403s an operator who may read but not edit', async () => {
    const owner = await adminCookie();
    const created = await createPage(owner);
    await harness.ctx.db.delete(admins);

    const headers = await adminCookie(['diy:page:read']);
    const { PUT } = await import('./pages/[id]/content/route');
    const response = await PUT(
      json('PUT', `/admin-api/diy/pages/${created.id}/content`, { content: CONTENT }, headers),
      { params: Promise.resolve({ id: created.id }) },
    );
    expect(response.status).toBe(403);
  });
});

describe('/admin-api/diy/pages/:id/publish', () => {
  it('needs diy:page:publish, not diy:page:update', async () => {
    const owner = await adminCookie();
    const created = await createPage(owner, { name: '首页', kind: 'home' });
    await harness.ctx.db.delete(admins);

    const { POST } = await import('./pages/[id]/publish/route');
    const params = { params: Promise.resolve({ id: created.id }) };

    const editor = await adminCookie(['diy:page:update']);
    expect((await POST(json('POST', '/publish', undefined, editor), params)).status).toBe(403);

    await harness.ctx.db.delete(admins);
    const publisher = await adminCookie(['diy:page:publish', 'diy:page:read']);
    const response = await POST(json('POST', '/publish', undefined, publisher), params);
    expect(response.status).toBe(200);
    expect((await response.json()) as { status: string }).toMatchObject({ status: 'published' });
  });
});

describe('/admin-api/diy/links', () => {
  it('refuses a duplicate url with 409 rather than a 500', async () => {
    const headers = await adminCookie();
    const { POST } = await import('./links/route');
    const body = { name: '商城首页', url: '/pages/index/index' };

    expect((await POST(json('POST', '/admin-api/diy/links', body, headers))).status).toBe(201);

    const duplicate = await POST(
      json('POST', '/admin-api/diy/links', { ...body, name: '首页' }, headers),
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      code: 'DIY_LINK_URL_EXISTS',
      message: '该页面链接已存在',
    });
  });
});

// ---------------------------------------------------------------------------
// the storefront surface
// ---------------------------------------------------------------------------

describe('/api/v1/diy', () => {
  it('serves the published home page without a session', async () => {
    const headers = await adminCookie();
    const created = await createPage(headers, { name: '首页', kind: 'home' });
    const { PUT } = await import('./pages/[id]/content/route');
    await PUT(
      json(
        'PUT',
        `/admin-api/diy/pages/${created.id}/content`,
        { content: CONTENT, version: created.version, publish: true },
        headers,
      ),
      { params: Promise.resolve({ id: created.id }) },
    );
    const { POST: setHome } = await import('./pages/[id]/home/route');
    await setHome(json('POST', '/home', undefined, headers), {
      params: Promise.resolve({ id: created.id }),
    });

    const { GET } = await import('../../api/v1/diy/pages/home/route');
    const response = await GET(get('/api/v1/diy/pages/home'));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { content: unknown }).content).toEqual(CONTENT);
  });

  it('says so in Chinese when no page has been made the home page', async () => {
    const { GET } = await import('../../api/v1/diy/pages/home/route');

    const response = await GET(get('/api/v1/diy/pages/home'));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: 'DIY_HOME_PAGE_MISSING',
      message: '尚未设置首页模板',
    });
  });
});
