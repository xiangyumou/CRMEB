import { z } from 'zod';
import { defineRoute } from '../_conventions/route';
import { instant } from '../_conventions/common';

/**
 * The smallest possible real domain, one route per surface. It exists so the
 * `pnpm gen` aggregation, the OpenAPI build, the example checker and the mock
 * server all have something to chew on from day one — and so the container
 * healthcheck has a documented endpoint instead of an undocumented one.
 */

export const healthPayload = z.object({
  status: z.literal('ok'),
  /** Server time, so a client can spot a badly skewed clock. */
  time: instant,
  /** Build/commit marker; `dev` outside CI. */
  version: z.string(),
});
export type HealthPayload = z.infer<typeof healthPayload>;

const example = {
  name: 'ok',
  response: { status: 'ok', time: '2026-01-01T12:00:00+08:00', version: 'dev' },
} as const;

export const storefrontHealth = defineRoute({
  id: 'health.storefront',
  method: 'GET',
  path: '/api/v1/health',
  auth: 'public',
  summary: '商城端健康检查',
  tags: ['health'],
  response: healthPayload,
  examples: [example],
});

export const adminHealth = defineRoute({
  id: 'health.admin',
  method: 'GET',
  path: '/admin-api/health',
  // Public on purpose: the container healthcheck must not need a session, and
  // `defineRoute` requires a permission for every `auth: 'admin'` route.
  auth: 'public',
  summary: '后台健康检查',
  tags: ['health'],
  response: healthPayload,
  examples: [example],
});
