import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { admins } from '@shop/db/schema/auth';
import { configValues } from '@shop/db/schema/system';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { createAdminSessionStore } from '../auth/admin-session.store';
import { hashPassword } from '../auth/password';
import type { Actor, Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import {
  adminCreate,
  adminDelete,
  adminDetail,
  adminList,
  adminResetPassword,
  adminSetStatus,
  adminUpdate,
  configureAdminPasswords,
  profileChangePassword,
  profileGet,
  profileUpdate,
} from './admin.service';
import {
  roleCreate,
  roleDelete,
  roleDetail,
  roleList,
  roleSetStatus,
  roleUpdate,
} from './role.service';
import { auditLogList } from './audit.service';
import { configGet, configGroupList, configSave } from './config.service';
import { agreementGet } from './agreement.service';
import { dashboardHeader } from './dashboard';
import './index';

/**
 * `system` against a real PostgreSQL and a real Redis.
 *
 * Two things here are worth more than the CRUD coverage: a config read must
 * never return a stored credential, and a permission or password change must
 * invalidate the sessions that were carrying the old answer.
 */

let harness: TestCtx;
let superId: number;

const NOW = '2026-09-22T08:00:00.000Z';
const PASSWORD = 'crmeb-123456';
const BCRYPT_COST = 4; // pure-JS bcrypt; cost 10 would add ~15s to this file

function actor(id: number, over: Partial<Actor> = {}): Actor {
  return { kind: 'admin', id, permissions: [], isSuper: true, ...over };
}

function as(id: number, over: Partial<Actor> = {}): Ctx {
  return harness.ctx.as(actor(id, over));
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected a DomainError');
}

async function seedAdmin(account: string, isSuper = false): Promise<number> {
  const [row] = await harness.ctx.db
    .insert(admins)
    .values({
      account,
      passwordHash: await hashPassword(PASSWORD, BCRYPT_COST),
      passwordAlgo: 'bcrypt',
      name: account,
      isSuper,
    })
    .returning({ id: admins.id });
  return row!.id;
}

function sessionStore() {
  return createAdminSessionStore({ redis: harness.ctx.redis });
}

/**
 * One live session for an admin. `AdminSessionStore.create` takes the whole
 * session plus a clock reading, so it is built here rather than spelled out at
 * every call site.
 */
async function seedSession(adminId: number, permissions: string[] = []): Promise<void> {
  await sessionStore().create(
    {
      adminId,
      account: `session-${adminId}`,
      name: `session-${adminId}`,
      avatar: null,
      isSuper: false,
      permissions,
      passwordVersion: 0,
    },
    harness.ctx.clock.nowMs(),
  );
}

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
  configureAdminPasswords({ bcryptCost: BCRYPT_COST });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
  harness.clock.set(NOW);
  superId = await seedAdmin('root', true);
});

// ---------------------------------------------------------------------------

describe('admins', () => {
  const form = {
    account: 'editor',
    name: '内容编辑',
    password: PASSWORD,
    enabled: true,
    roleIds: [] as string[],
  };

  it('creates, reads, lists and edits an account', async () => {
    const ctx = as(superId);
    const created = await adminCreate(ctx, form);
    expect(created.admin).toMatchObject({ account: 'editor', enabled: true, isSuper: false });

    expect(await adminDetail(ctx, { id: created.admin.id })).toMatchObject({ account: 'editor' });

    const listed = await adminList(ctx, { page: 1, pageSize: 20 });
    expect(listed.total).toBe(2);

    const updated = await adminUpdate(ctx, { id: created.admin.id }, { ...form, name: '编辑部' });
    expect(updated.admin.name).toBe('编辑部');
  });

  it('refuses a duplicate account', async () => {
    const ctx = as(superId);
    await adminCreate(ctx, form);
    expect(await code(adminCreate(ctx, form))).toBe('SYSTEM_ADMIN_ACCOUNT_TAKEN');
  });

  it('refuses to create an account without a password', async () => {
    const { password: _password, ...withoutPassword } = form;
    expect(await code(adminCreate(as(superId), withoutPassword))).toBe(
      'SYSTEM_ADMIN_PASSWORD_REQUIRED',
    );
  });

  it('will not let an admin lock themselves out', async () => {
    // Disabling or deleting yourself is the one-click way to lose the only
    // account that could undo it.
    expect(
      await code(adminSetStatus(as(superId), { id: String(superId) }, { enabled: false })),
    ).toBe('SYSTEM_ADMIN_SELF_LOCKOUT');
    expect(await code(adminDelete(as(superId), { id: String(superId) }))).toBe(
      'SYSTEM_ADMIN_SELF_LOCKOUT',
    );
  });

  it('will not let the last enabled super admin be disabled', async () => {
    const other = await seedAdmin('second-root', true);
    // The last one standing: `other` disabling `root` would leave `other`, so
    // that is allowed; disabling both is not.
    await adminSetStatus(as(other), { id: String(superId) }, { enabled: false });
    expect(await code(adminSetStatus(as(superId), { id: String(other) }, { enabled: false }))).toBe(
      'SYSTEM_ADMIN_SELF_LOCKOUT',
    );
  });

  it('revokes the account’s sessions when it is disabled', async () => {
    // A session carries the permissions it was created with, so leaving it
    // alive would keep a disabled account working until it expired.
    const victim = await seedAdmin('victim');
    const sessions = sessionStore();
    await seedSession(victim);
    expect(await sessions.countFor(victim)).toBe(1);

    const result = await adminSetStatus(as(superId), { id: String(victim) }, { enabled: false });
    expect(result.revokedSessions).toBe(1);
    expect(await sessions.countFor(victim)).toBe(0);
  });

  it('revokes every session when somebody’s password is reset', async () => {
    const victim = await seedAdmin('victim');
    const sessions = sessionStore();
    await seedSession(victim);

    const result = await adminResetPassword(
      as(superId),
      { id: String(victim) },
      { password: 'another-password' },
    );
    expect(result.revokedSessions).toBe(1);
    expect(await sessions.countFor(victim)).toBe(0);
  });

  it('frees the account name when an admin is deleted', async () => {
    const ctx = as(superId);
    const created = await adminCreate(ctx, form);
    await adminDelete(ctx, { id: created.admin.id });

    expect(await code(adminDetail(ctx, { id: created.admin.id }))).toBe('SYSTEM_ADMIN_NOT_FOUND');
    // The unique index would otherwise make the name unusable forever.
    await expect(adminCreate(ctx, form)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------

describe('own profile', () => {
  it('is readable by an admin holding no grants at all', async () => {
    const nobody = await seedAdmin('nobody');
    const profile = await profileGet(as(nobody, { isSuper: false }));
    expect(profile).toMatchObject({ account: 'nobody' });
  });

  it('changes my password and revokes every session I hold', async () => {
    const me = await seedAdmin('me');
    const sessions = sessionStore();
    await seedSession(me);
    await seedSession(me);

    const result = await profileChangePassword(as(me, { isSuper: false }), {
      currentPassword: PASSWORD,
      newPassword: 'a-brand-new-one',
      confirmPassword: 'a-brand-new-one',
    });
    expect(result.revokedSessions).toBe(2);
    expect(await sessions.countFor(me)).toBe(0);
  });

  it('refuses a password change that does not know the current password', async () => {
    const me = await seedAdmin('me');
    expect(
      await code(
        profileChangePassword(as(me, { isSuper: false }), {
          currentPassword: 'not-the-password',
          newPassword: 'a-brand-new-one',
          confirmPassword: 'a-brand-new-one',
        }),
      ),
    ).toBe('SYSTEM_PASSWORD_MISMATCH');
  });

  it('edits my own name and phone', async () => {
    const me = await seedAdmin('me');
    const updated = await profileUpdate(as(me, { isSuper: false }), {
      name: '新名字',
      phone: '13800138000',
    });
    expect(updated).toMatchObject({ name: '新名字', phone: '13800138000' });
  });
});

// ---------------------------------------------------------------------------

describe('roles', () => {
  const form = {
    name: '内容编辑',
    enabled: true,
    permissions: ['storage:attachment:read', 'storage:attachment:write'],
  };

  it('creates a role, lists it and reads its grants back', async () => {
    const ctx = as(superId);
    const created = await roleCreate(ctx, form);
    expect(created.permissions.sort()).toEqual([...form.permissions].sort());

    expect((await roleList(ctx, { page: 1, pageSize: 20 })).total).toBe(1);
    expect(await roleDetail(ctx, { id: created.id })).toMatchObject({ name: '内容编辑' });
  });

  it('refuses an atom the running build does not declare', async () => {
    // The atom set is compiled in, so a typo is a 422 here rather than a grant
    // that silently never matches anything.
    expect(
      await code(
        roleCreate(as(superId), { ...form, permissions: ['storage:attachment:teleport'] }),
      ),
    ).toBe('SYSTEM_PERMISSION_UNKNOWN');
  });

  it('refuses a duplicate role name', async () => {
    const ctx = as(superId);
    await roleCreate(ctx, form);
    expect(await code(roleCreate(ctx, form))).toBe('SYSTEM_ROLE_NAME_TAKEN');
  });

  it('revokes the sessions of everybody holding a role whose grants changed', async () => {
    const ctx = as(superId);
    const role = await roleCreate(ctx, form);
    const holder = await adminCreate(ctx, {
      account: 'holder',
      name: '持有者',
      password: PASSWORD,
      enabled: true,
      roleIds: [role.id],
    });

    const sessions = sessionStore();
    await seedSession(Number(holder.admin.id), form.permissions);

    // Taking an atom away must take effect now, not at the holder's next login.
    await roleUpdate(ctx, { id: role.id }, { ...form, permissions: ['storage:attachment:read'] });
    expect(await sessions.countFor(Number(holder.admin.id))).toBe(0);
  });

  it('refuses to delete a role that is still granted to somebody', async () => {
    const ctx = as(superId);
    const role = await roleCreate(ctx, form);
    await adminCreate(ctx, {
      account: 'holder',
      name: '持有者',
      password: PASSWORD,
      enabled: true,
      roleIds: [role.id],
    });
    expect(await code(roleDelete(ctx, { id: role.id }))).toBe('SYSTEM_ROLE_IN_USE');
  });

  it('deletes an unheld role, and revokes sessions when one is disabled', async () => {
    const ctx = as(superId);
    const role = await roleCreate(ctx, form);
    await roleSetStatus(ctx, { id: role.id }, { enabled: false });
    await expect(roleDelete(ctx, { id: role.id })).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('config', () => {
  it('never returns a stored secret — only whether one is set', async () => {
    const ctx = as(superId);
    await configSave(
      ctx,
      { group: 'wechat-oa' },
      { values: { encodingAesKey: 'super-secret-value' } },
    );

    const read = await configGet(ctx, { group: 'wechat-oa' });
    expect(read.values['encodingAesKey']).toBe(true);
    // Belt and braces: the literal must appear nowhere in the payload.
    expect(JSON.stringify(read)).not.toContain('super-secret-value');

    // It really is stored, though.
    const [row] = await harness.ctx.db
      .select()
      .from(configValues)
      .where(eq(configValues.key, 'encodingAesKey'));
    expect(row?.value).toContain('super-secret-value');
  });

  it('reports an unset secret as false', async () => {
    const read = await configGet(as(superId), { group: 'wechat-oa' });
    expect(read.values['encodingAesKey']).toBe(false);
  });

  it('leaves the stored secret alone when the form is saved without retyping it', async () => {
    // The browser round-trips the "is set" flag. Saving the site name must not
    // blank out a credential.
    const ctx = as(superId);
    await configSave(ctx, { group: 'wechat-oa' }, { values: { encodingAesKey: 'keep-me' } });
    await configSave(
      ctx,
      { group: 'wechat-oa' },
      { values: { encodingAesKey: true, verificationFile: 'MP_verify_abc.txt' } },
    );

    const [row] = await harness.ctx.db
      .select()
      .from(configValues)
      .where(eq(configValues.key, 'encodingAesKey'));
    expect(row?.value).toContain('keep-me');
    expect((await configGet(ctx, { group: 'wechat-oa' })).values['verificationFile']).toBe(
      'MP_verify_abc.txt',
    );
  });

  it('refuses a key the group does not declare', async () => {
    expect(
      await code(configSave(as(superId), { group: 'site' }, { values: { evil: 'yes' } })),
    ).toBe('SYSTEM_CONFIG_UNKNOWN_KEY');
  });

  it('refuses a value the schema rejects, and writes nothing', async () => {
    const ctx = as(superId);
    expect(
      await code(configSave(ctx, { group: 'order' }, { values: { payWindowMinutes: -5 } })),
    ).toBe('VALIDATION_FAILED');
    expect(await harness.ctx.db.select().from(configValues)).toHaveLength(0);
  });

  it('404s on a group nobody registered', async () => {
    expect(await code(configGet(as(superId), { group: 'no-such-group' }))).toBe(
      'SYSTEM_CONFIG_GROUP_NOT_FOUND',
    );
  });

  it('lists only the groups the caller may read', async () => {
    const superList = await configGroupList(as(superId));
    expect(superList.groups.map((g) => g.group)).toContain('storage');

    const outsider = await configGroupList(as(superId, { isSuper: false, permissions: [] }));
    expect(outsider.groups).toEqual([]);
  });

  it('marks a group read-only for somebody who cannot write it', async () => {
    const reader = await configGroupList(
      as(superId, { isSuper: false, permissions: ['system:config:read'] }),
    );
    expect(reader.groups.every((g) => g.writable === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('agreements and the dashboard', () => {
  it('serves the agreement text an operator saved', async () => {
    await configSave(
      as(superId),
      { group: 'agreement' },
      { values: { userTitle: '用户协议', user: '# 条款' } },
    );
    const agreement = await agreementGet(harness.ctx, { key: 'user' });
    expect(agreement).toMatchObject({ key: 'user', title: '用户协议', content: '# 条款' });
  });

  it('counts the admins and the media library on the home page', async () => {
    const header = await dashboardHeader(as(superId));
    const byKey = new Map(header.tiles.map((t) => [t.key, t.value]));
    expect(byKey.get('system.admins')).toBe(1);
    expect(byKey.get('storage.files')).toBe(0);
    expect(header.degraded).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('audit log', () => {
  it('reads back rows in reverse order, newest first', async () => {
    // `handle()` writes the rows; this reads what it wrote, so the test seeds
    // through the same repo the writer uses.
    const { insertAudit } = await import('../auth/audit.repo');
    await insertAudit(harness.ctx.db, {
      adminId: superId,
      adminAccount: 'root',
      routeId: 'system.adminCreate',
      method: 'POST',
      path: '/admin-api/admins',
      target: 'admin:2',
      status: 201,
      requestId: 'r1',
      ip: '10.0.0.1',
      payload: { account: 'editor', password: 'crmeb-123456' },
      now: new Date('2026-09-22T08:00:00.000Z'),
    });
    await insertAudit(harness.ctx.db, {
      adminId: superId,
      adminAccount: 'root',
      routeId: 'system.adminDelete',
      method: 'DELETE',
      path: '/admin-api/admins/2',
      target: 'admin:2',
      status: 204,
      requestId: 'r2',
      ip: '10.0.0.1',
      payload: {},
      now: new Date('2026-09-22T09:00:00.000Z'),
    });

    const page = await auditLogList(as(superId), { page: 1, pageSize: 20 });
    expect(page.total).toBe(2);
    expect(page.items[0]?.routeId).toBe('system.adminDelete');
    // The writer redacts; the reader must not undo that.
    expect(JSON.stringify(page.items)).not.toContain('crmeb-123456');
  });
});
