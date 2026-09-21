/**
 * LOCAL STAND-IN for `@shop/contracts/src/auth/*.contract.ts`, which executor
 * P0-A owns and which does not exist in this worktree yet.
 *
 * Route ids, methods, paths and body shapes are the ones agreed with P0-A:
 *   auth.adminLogin   POST /admin-api/auth/login   { account, password, captchaToken? }
 *   auth.adminLogout  POST /admin-api/auth/logout
 *   auth.adminMe      GET  /admin-api/auth/me
 *
 * At merge the orchestrator deletes this file and repoints the single re-export
 * in `src/admin/api/contracts.ts` at `@shop/contracts`. Nothing else in the app
 * imports this path.
 *
 * Note on `auth`: `defineRoute` demands a `permission` whenever `auth === 'admin'`,
 * and session endpoints have no sensible permission atom, so they are declared
 * `public` here (the handler still 401s without a cookie). If P0-A models them
 * differently it changes nothing on the client — `callRoute` only reads
 * `method`, `path` and the zod schemas.
 */
import { defineRoute } from '@shop/contracts';
import { z } from 'zod';

import { id } from '@shop/contracts';

/** Who the browser is logged in as. Drives `SessionProvider`, `<Can>` and the menu. */
export const adminIdentity = z.object({
  id,
  account: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  /** Super admins bypass every permission check, client-side and server-side. */
  isSuper: z.boolean(),
  /** Flat list of `<domain>:<resource>:<action>` atoms. */
  permissions: z.array(z.string()),
});
export type AdminIdentity = z.output<typeof adminIdentity>;

const exampleIdentity = {
  id: '1',
  account: 'admin',
  name: '超级管理员',
  isSuper: true,
  permissions: [],
};

export const adminLogin = defineRoute({
  id: 'auth.adminLogin',
  method: 'POST',
  path: '/admin-api/auth/login',
  auth: 'public',
  summary: '管理员登录',
  tags: ['auth'],
  body: z.object({
    account: z.string().min(1, '请输入账号'),
    password: z.string().min(1, '请输入密码'),
    captchaToken: z.string().optional(),
  }),
  response: adminIdentity,
  examples: [{ name: '成功', body: { account: 'admin', password: '******' }, response: exampleIdentity }],
});

export const adminLogout = defineRoute({
  id: 'auth.adminLogout',
  method: 'POST',
  path: '/admin-api/auth/logout',
  auth: 'public',
  summary: '管理员退出登录',
  tags: ['auth'],
  body: z.object({}),
  response: z.object({ ok: z.literal(true) }),
  examples: [{ name: '成功', body: {}, response: { ok: true } }],
});

export const adminMe = defineRoute({
  id: 'auth.adminMe',
  method: 'GET',
  path: '/admin-api/auth/me',
  auth: 'public',
  summary: '当前登录的管理员',
  tags: ['auth'],
  response: adminIdentity,
  examples: [{ name: '成功', response: exampleIdentity }],
});
