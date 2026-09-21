import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allRoutes } from '@shop/contracts/routes';
import { adminProfileExample } from '@shop/contracts/auth/schemas';
import {
  compileRoute,
  matchRoute,
  pickExample,
  startMockServer,
  type RunningMockServer,
} from './index';

/**
 * The mock server is what the uni-app and admin-shell streams build against
 * before any handler exists, so "it answers, and it validates" is a promise to
 * two other streams.
 */

let server: RunningMockServer;

beforeAll(async () => {
  server = await startMockServer({ port: 0 });
});

afterAll(async () => {
  await server?.close();
});

const get = (path: string, init?: RequestInit) => fetch(`${server.url}${path}`, init);

describe('serving examples', () => {
  it('answers GET /api/v1/health with the contract example', async () => {
    const response = await get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      status: 'ok',
      time: '2026-01-01T12:00:00+08:00',
      version: 'dev',
    });
  });

  it('answers the admin surface too', async () => {
    expect((await get('/admin-api/health')).status).toBe(200);
  });

  it('answers the admin auth routes the shell needs', async () => {
    const login = await get('/admin-api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'admin', password: 'crmeb123456' }),
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual(adminProfileExample);

    expect(await (await get('/admin-api/auth/me')).json()).toEqual(adminProfileExample);

    const logout = await get('/admin-api/auth/logout', { method: 'POST' });
    expect(await logout.json()).toEqual({ ok: true });
  });

  it('selects another example with X-Mock-Example', async () => {
    const limited = await get('/admin-api/auth/me', { headers: { 'x-mock-example': 'limited' } });
    const payload = await limited.json();
    expect(payload.account).toBe('operator');
    expect(payload.isSuper).toBe(false);
  });

  it('404s a named example that does not exist, and says which do', async () => {
    const response = await get('/admin-api/auth/me', { headers: { 'x-mock-example': 'nope' } });
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe('NOT_FOUND');
    expect(payload.details.available).toEqual(['super', 'limited']);
  });

  it('serves every registered route from its first example', async () => {
    for (const route of allRoutes) {
      if (route.params) continue; // covered separately; needs a concrete id
      // A route with a required query only answers 200 when its own example's query is sent.
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(route.examples[0]?.query ?? {})) {
        for (const item of Array.isArray(value) ? value : [value]) query.append(key, String(item));
      }
      const response = await fetch(`${server.url}${route.path}?${query.toString()}`, {
        method: route.method,
        ...(route.body
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(route.examples[0]?.body ?? {}),
            }
          : {}),
      });
      expect(response.status, `${route.method} ${route.path}`).toBe(route.status ?? 200);
    }
  });
});

describe('validating what the client sent', () => {
  it('422s a body that does not parse, in the standard error shape', async () => {
    const response = await get('/admin-api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: '', password: '' }),
    });
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.code).toBe('VALIDATION_FAILED');
    expect(payload.message).toBe('提交的数据有误');
    expect(payload.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'account',
      'password',
    ]);
  });

  it('422s a missing body', async () => {
    const response = await get('/admin-api/auth/login', { method: 'POST' });
    expect(response.status).toBe(422);
  });

  it('422s a body that is not JSON', async () => {
    const response = await get('/admin-api/auth/login', { method: 'POST', body: 'nonsense' });
    expect(response.status).toBe(422);
    expect((await response.json()).details[0].field).toBe('<body>');
  });
});

describe('routing', () => {
  it('404s an unknown path and 405s a known path with the wrong method', async () => {
    expect((await get('/api/v1/nothing-here')).status).toBe(404);
    expect((await get('/api/v1/health', { method: 'POST' })).status).toBe(405);
  });

  it('answers CORS preflight, so a browser client can develop against it', async () => {
    const response = await get('/api/v1/health', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('lists its routes for discovery', async () => {
    const listed = await (await get('/__mock/routes')).json();
    expect(listed).toHaveLength(allRoutes.length);
    expect(listed.find((r: { id: string }) => r.id === 'auth.adminMe').examples).toEqual([
      'super',
      'limited',
    ]);
  });
});

describe('matchRoute', () => {
  const compiled = allRoutes.map(compileRoute);

  it('matches an exact path', () => {
    const match = matchRoute(compiled, 'GET', '/api/v1/health');
    expect(match).not.toBeNull();
    expect(match).not.toBe('method-not-allowed');
    expect((match as { route: { id: string } }).route.id).toBe('health.storefront');
  });

  it('distinguishes "no such path" from "wrong method"', () => {
    expect(matchRoute(compiled, 'GET', '/api/v1/nope')).toBeNull();
    expect(matchRoute(compiled, 'DELETE', '/api/v1/health')).toBe('method-not-allowed');
  });

  it('extracts and decodes :params', () => {
    const withParam = compileRoute({
      id: 'x',
      method: 'GET',
      path: '/api/v1/things/:id/parts/:partId',
      auth: 'public',
      summary: '',
      tags: [],
      response: {} as never,
      examples: [{ name: 'a', response: {} }],
    });
    const match = matchRoute([withParam], 'GET', '/api/v1/things/42/parts/a%20b');
    expect((match as { params: Record<string, string> }).params).toEqual({
      id: '42',
      partId: 'a b',
    });
  });

  it('does not let a param swallow a path separator', () => {
    const withParam = compileRoute({
      id: 'x',
      method: 'GET',
      path: '/api/v1/things/:id',
      auth: 'public',
      summary: '',
      tags: [],
      response: {} as never,
      examples: [{ name: 'a', response: {} }],
    });
    expect(matchRoute([withParam], 'GET', '/api/v1/things/1/2')).toBeNull();
  });
});

describe('pickExample', () => {
  const route = allRoutes.find((r) => r.id === 'auth.adminMe')!;

  it('defaults to the first example', () => {
    expect(pickExample(route, undefined)?.name).toBe('super');
  });

  it('selects by name and returns null for an unknown one', () => {
    expect(pickExample(route, 'limited')?.name).toBe('limited');
    expect(pickExample(route, 'nope')).toBeNull();
  });
});
