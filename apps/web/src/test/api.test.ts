import { defineRoute, id } from '@shop/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { callRoute } from '@/admin/api/call-route';
import { resetApiConfig } from '@/admin/api/config';

import { on, respondWith, respondWithError, stubRoutes, takeFixtureFailures } from './api';

const widget = z.object({ id, name: z.string(), note: z.string().nullable() });

const widgetDetail = defineRoute({
  id: 'test.widgetDetail',
  method: 'GET',
  path: '/admin-api/widgets/:id',
  auth: 'admin',
  permission: 'test:widget:read',
  summary: '详情',
  tags: ['test'],
  params: z.object({ id }),
  response: widget,
  examples: [{ name: 'ok', params: { id: '1' }, response: { id: '1', name: 'a', note: null } }],
});

const widgetDelete = defineRoute({
  id: 'test.widgetDelete',
  method: 'DELETE',
  path: '/admin-api/widgets/:id',
  auth: 'admin',
  permission: 'test:widget:delete',
  summary: '删除',
  tags: ['test'],
  params: z.object({ id }),
  response: z.void(),
  status: 204,
  examples: [{ name: 'ok', params: { id: '1' }, response: undefined }],
});

afterEach(() => {
  resetApiConfig();
  // These tests provoke failures on purpose; do not let `setup.ts` report them.
  takeFixtureFailures();
});

describe('respondWith', () => {
  it('answers with the fixture when it matches the contract', async () => {
    const response = respondWith(widgetDetail, { id: '7', name: '组件', note: null });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: '7', name: '组件', note: null });
  });

  it('names the missing field when the fixture does not match', () => {
    // @ts-expect-error -- the point: `note` is required
    expect(() => respondWith(widgetDetail, { id: '7', name: '组件' })).toThrow(
      /test\.widgetDetail does not match its contract:\n {2}- note:/,
    );
    expect(takeFixtureFailures()).toHaveLength(1);
  });

  it('names a key the contract does not declare', () => {
    const fixture = { id: '7', name: '组件', note: null, retiredCode: 'x' };
    expect(() => respondWith(widgetDetail, fixture)).toThrow(
      /does not declare:\n {2}- retiredCode/,
    );
  });

  it('sends no body for a 204 route', async () => {
    const response = respondWith(widgetDelete, undefined);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('checks an error body against the error envelope', async () => {
    const response = respondWithError(409, { code: 'WIDGET_TAKEN', message: '已存在' });
    expect(response.status).toBe(409);
    // @ts-expect-error -- `message` is required on every error
    expect(() => respondWithError(500, { code: 'INTERNAL' })).toThrow(/a 500 error/);
  });
});

describe('stubRoutes', () => {
  it('routes by method and path and records path params', async () => {
    const calls = stubRoutes([
      on(widgetDelete, undefined),
      on(widgetDetail, (call) => ({ id: call.params.id ?? '', name: '组件', note: null })),
    ]);

    await expect(callRoute(widgetDetail, { params: { id: '9' } })).resolves.toEqual({
      id: '9',
      name: '组件',
      note: null,
    });
    await callRoute(widgetDelete, { params: { id: '9' } });

    expect(calls.map((call) => [call.method, call.routeId, call.params])).toEqual([
      ['GET', 'test.widgetDetail', { id: '9' }],
      ['DELETE', 'test.widgetDelete', { id: '9' }],
    ]);
  });

  it('fails the test when a request has no stub, even though the client swallows it', async () => {
    stubRoutes([on(widgetDelete, undefined)]);
    await expect(callRoute(widgetDetail, { params: { id: '9' } })).rejects.toMatchObject({
      status: 502,
    });
    expect(takeFixtureFailures()).toEqual(['no stub answers GET /admin-api/widgets/9']);
  });

  it('records a wrong fixture even when the client turns the throw into a network error', async () => {
    // @ts-expect-error -- `note` is missing
    stubRoutes([on(widgetDetail, { id: '1', name: '组件' })]);
    await expect(callRoute(widgetDetail, { params: { id: '1' } })).rejects.toMatchObject({
      status: 0,
    });
    expect(takeFixtureFailures()).toEqual([expect.stringContaining('- note:')]);
  });
});
