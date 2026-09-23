import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { admins } from '@shop/db/schema/auth';
import { configValues } from '@shop/db/schema/system';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { createAdminSessionStore } from '../auth/admin-session.store';
import { hashPassword } from '../auth/password';
import { anonymousActor, type Actor, type Ctx } from '../kernel/context';
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
import { configGet, configGroupList, configSave, describeGroup } from './config.service';
import { allConfigGroups } from '../kernel/config-registry';
import { agreementGet } from './agreement.service';
import { siteConfigGet, siteConfigSourceGroups } from './site.service';
import { fakeSmsSender, registerSmsSender, resetSmsSender } from '../sms';
import { dashboardHeader } from './dashboard';
import './index';
// Side-effect import: the same bootstrap `handle()` performs on every request.
// Without it no domain has registered anything — and `GET /api/v1/site/config`
// reports the pay buttons that `registerPaymentDomain()` announced, so a test
// that skipped this would be testing a process no deployment ever runs.
import '../domains.gen';

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

  /**
   * `site.publicOrigin` is a deployment fact.
   *
   * The screen renders it as plain text and never submits it — but that is the
   * half a stale tab or a `curl` does not honour, so the route refuses the key
   * itself, and refuses it even when the value sent happens to be the current
   * one.
   */
  it('refuses a read-only field, on presence and not on difference', async () => {
    const ctx = as(superId);
    const before = await configGet(ctx, { group: 'site' });
    const current = before.values['publicOrigin'];

    expect(
      await code(
        configSave(ctx, { group: 'site' }, { values: { publicOrigin: 'https://evil.test' } }),
      ),
    ).toBe('CONFIG_FIELD_READ_ONLY');
    // Same value back: still refused, and still nothing written.
    expect(
      await code(configSave(ctx, { group: 'site' }, { values: { publicOrigin: current } })),
    ).toBe('CONFIG_FIELD_READ_ONLY');
    expect(
      await code(
        configSave(
          ctx,
          { group: 'site' },
          { values: { siteName: '带着只读字段一起提交', extraOrigins: 'a.test' } },
        ),
      ),
    ).toBe('CONFIG_FIELD_READ_ONLY');

    expect(await harness.ctx.db.select().from(configValues)).toHaveLength(0);
    expect((await configGet(ctx, { group: 'site' })).values['publicOrigin']).toBe(current);
  });

  it('describes a read-only field as such, and says where its value comes from', async () => {
    const { descriptor } = await configGet(as(superId), { group: 'site' });
    const field = descriptor.fields.find((f) => f.key === 'publicOrigin');
    expect(field?.readOnly).toBe(true);
    expect(field?.help).toContain('env:PUBLIC_ORIGIN');
    // Everything else stays writable, or this flag would be a foot-gun.
    expect(descriptor.fields.find((f) => f.key === 'siteName')?.readOnly).toBeUndefined();
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

describe('站点公开配置', () => {
  /** The anonymous context a storefront request arrives with. */
  const anonymous = (): Ctx => harness.ctx.as(anonymousActor);

  it('answers a request with no session at all', async () => {
    // The app reads it before there is one: on launch, above the sign-in form
    // and on the splash screen.
    expect(anonymous().actor.kind).toBe('anonymous');
    const payload = await siteConfigGet(anonymous());
    expect(payload.name).toBe('CRMEB 商城');
    expect(payload.version).toBe('0');
  });

  it('serves what the operator typed, across three config groups', async () => {
    const ctx = as(superId);
    await configSave(
      ctx,
      { group: 'site' },
      {
        values: {
          siteName: '示例商城',
          logo: '/uploads/a.png',
          loginLogo: '/uploads/b.png',
          shareTitle: '好货不贵',
          copyrightText: '© 2026 示例',
          copyrightLink: 'https://example.test',
          icpNumber: '京ICP备00000000号',
          contactPhone: '400-000-0000',
          contactQrcode: '/uploads/support-qrcode.png',
          splashEnabled: true,
          splashImage: '/uploads/adv.png',
          splashSeconds: 5,
        },
      },
    );
    await configSave(ctx, { group: 'wechat-mini' }, { values: { enabled: false } });

    const payload = await siteConfigGet(anonymous());
    expect(payload).toMatchObject({
      name: '示例商城',
      logo: { main: '/uploads/a.png', login: '/uploads/b.png', square: null },
      copyright: { text: '© 2026 示例', link: 'https://example.test', imageUrl: null },
      share: { title: '好货不贵', synopsis: '', image: null },
      filing: { icpNumber: '京ICP备00000000号' },
      // No merchant credentials stored, so the cashier shows no pay button.
      payments: { wechat: false },
      support: { kind: 'phone', phone: '400-000-0000', qrcodeUrl: '/uploads/support-qrcode.png' },
      splashAd: { enabled: true, imageUrl: '/uploads/adv.png', link: null, seconds: 5 },
    });
    expect(payload.version).not.toBe('0');
  });

  it('keeps 开屏广告 off while there is no image to show', async () => {
    // An operator preparing next week's campaign turns the switch on before
    // the artwork exists; `pages/guide` must not render an empty splash.
    await configSave(as(superId), { group: 'site' }, { values: { splashEnabled: true } });
    expect((await siteConfigGet(anonymous())).splashAd.enabled).toBe(false);
  });

  it('prefers the mini-program 客服 window when the mini-program is on', async () => {
    await configSave(
      as(superId),
      { group: 'wechat-mini' },
      { values: { enabled: true, contactType: 'mini-program' } },
    );
    expect((await siteConfigGet(anonymous())).support.kind).toBe('mini-program');
  });

  it('caches for a minute and drops the cache the moment a source group is saved', async () => {
    const ctx = as(superId);
    await configSave(ctx, { group: 'site' }, { values: { siteName: '第一版' } });
    expect((await siteConfigGet(anonymous())).name).toBe('第一版');

    // Writing behind the service's back proves the second read was cached…
    await harness.ctx.db
      .update(configValues)
      .set({ value: '第二版' })
      .where(and(eq(configValues.group, 'site'), eq(configValues.key, 'siteName')));
    await harness.ctx.config.invalidate('site');
    expect((await siteConfigGet(anonymous())).name).toBe('第一版');

    // …and that a save through the real path drops it.
    await configSave(ctx, { group: 'site' }, { values: { siteName: '第三版' } });
    expect((await siteConfigGet(anonymous())).name).toBe('第三版');
  });

  it('is built from exactly the groups that drop its cache', async () => {
    // `payment` registers the pay button; `sms`, `wechat` and `wechat-oa`
    // arrive with the sign-in methods.
    expect([...siteConfigSourceGroups()].sort()).toEqual([
      'payment',
      'site',
      'sms',
      'wechat',
      'wechat-mini',
      'wechat-oa',
    ]);
  });

  /**
   * The property the whole route stands on.
   *
   * Rather than "we checked the fields we send", every `secret: true` field of
   * every registered group is given a value that exists nowhere else, written
   * straight into `config_values` so no schema can refuse it, and the
   * serialised payload must contain none of them. A future field added to the
   * payload from a group that happens to hold a credential fails here.
   */
  it('cannot leak any secret in any registered group', async () => {
    const markers: string[] = [];
    const rows: { group: string; key: string; value: unknown; updatedAt: Date }[] = [];
    for (const group of allConfigGroups()) {
      for (const field of describeGroup(group).fields) {
        if (field.secret !== true) continue;
        const marker = `LEAKED-${group.group}-${field.key}-${markers.length}`;
        markers.push(marker);
        rows.push({
          group: group.group,
          key: field.key,
          value: marker,
          updatedAt: harness.ctx.clock.now(),
        });
      }
    }
    // The test is only worth anything if it is actually checking something.
    expect(markers.length).toBeGreaterThan(5);

    await harness.ctx.db.insert(configValues).values(rows);
    for (const group of allConfigGroups()) await harness.ctx.config.invalidate(group.group);

    const serialised = JSON.stringify(await siteConfigGet(anonymous()));
    for (const marker of markers) expect(serialised).not.toContain(marker);
  });

  it('says WeChat Pay is available only once the credentials are complete', async () => {
    const ctx = as(superId);
    expect((await siteConfigGet(anonymous())).payments.wechat).toBe(false);

    // Half a credential is not a payment method: the button would fail at the
    // till rather than be absent.
    await configSave(ctx, { group: 'payment' }, { values: { mchId: '1900000109' } });
    expect((await siteConfigGet(anonymous())).payments.wechat).toBe(false);
  });
});

// ---------------------------------------------------------------------------

/**
 * `auth` on `GET /api/v1/site/config`: which sign-in methods the app may offer.
 * Each flag is raised by a probe its owner registers — `wechat` for the two
 * WeChat logins, `sms` for 手机号登录 — so this also proves the registrations
 * are really installed by `domains.gen`.
 */
describe('站点公开配置 — 登录方式', () => {
  const anonymous = (): Ctx => harness.ctx.as(anonymousActor);
  const auth = async () => (await siteConfigGet(anonymous())).auth;

  const OA_APP_ID = 'wx-oa-appid-7f3c1e';
  const OA_SECRET = 'oa-secret-c0ffee-9d41';
  const MINI_APP_ID = 'wx-mini-appid-51b2aa';
  const MINI_SECRET = 'mini-secret-beef-7a3e';
  const SMS_KEY_ID = 'LTAI-key-id-3e9d';
  const SMS_KEY_SECRET = 'sms-secret-feed-1b2c';

  afterEach(() => resetSmsSender());

  it('offers nothing on a fresh install', async () => {
    expect(await auth()).toEqual({ wechatOa: false, wechatMini: false, phone: false });
  });

  it('offers 公众号 login once it is switched on and its app id and secret are both set', async () => {
    const ctx = as(superId);
    await configSave(ctx, { group: 'wechat' }, { values: { oaAppId: OA_APP_ID } });
    await configSave(ctx, { group: 'wechat-oa' }, { values: { enabled: true } });
    // An app id with no secret cannot exchange a code: not offered.
    expect((await auth()).wechatOa).toBe(false);

    // Saving the `wechat` group drops the cached payload.
    await configSave(ctx, { group: 'wechat' }, { values: { oaAppSecret: OA_SECRET } });
    expect(await auth()).toEqual({ wechatOa: true, wechatMini: false, phone: false });

    // The operator's switch off again: the sign-in refuses, so the app must not
    // offer it.
    await configSave(ctx, { group: 'wechat-oa' }, { values: { enabled: false } });
    expect((await auth()).wechatOa).toBe(false);
  });

  it('offers mini-program login once it is switched on and its app id and secret are both set', async () => {
    const ctx = as(superId);
    await configSave(
      ctx,
      { group: 'wechat' },
      { values: { miniAppId: MINI_APP_ID, miniAppSecret: MINI_SECRET } },
    );
    // Credentials alone are not enough: 启用小程序 is off.
    expect((await auth()).wechatMini).toBe(false);

    await configSave(ctx, { group: 'wechat-mini' }, { values: { enabled: true } });
    expect(await auth()).toEqual({ wechatOa: false, wechatMini: true, phone: false });

    // The 公众号 credentials say nothing about the mini program, and vice versa.
    // (A blank secret on save means "not retyped" and keeps it; the app id clears.)
    await configSave(ctx, { group: 'wechat' }, { values: { miniAppId: '' } });
    await configSave(
      ctx,
      { group: 'wechat' },
      { values: { oaAppId: OA_APP_ID, oaAppSecret: OA_SECRET } },
    );
    expect((await auth()).wechatMini).toBe(false);
  });

  it('offers 手机号登录 exactly when resolveSender would return a sender that delivers', async () => {
    const ctx = as(superId);
    await configSave(
      ctx,
      { group: 'sms' },
      { values: { provider: 'aliyun', aliyunAccessKeyId: SMS_KEY_ID } },
    );
    expect((await auth()).phone).toBe(false);

    await configSave(
      ctx,
      { group: 'sms' },
      { values: { aliyunAccessKeySecret: SMS_KEY_SECRET, aliyunSignName: '示例商城' } },
    );
    expect(await auth()).toEqual({ wechatOa: false, wechatMini: false, phone: true });

    await configSave(ctx, { group: 'sms' }, { values: { provider: 'none' } });
    expect((await auth()).phone).toBe(false);
  });

  it('offers 手机号登录 when a sender is registered at boot (tests, SHOP_FAKE_SMS)', async () => {
    registerSmsSender(fakeSmsSender());
    expect((await auth()).phone).toBe(true);
  });

  it('carries booleans, never the credentials that decide them', async () => {
    const ctx = as(superId);
    await configSave(
      ctx,
      { group: 'wechat' },
      {
        values: {
          oaAppId: OA_APP_ID,
          oaAppSecret: OA_SECRET,
          miniAppId: MINI_APP_ID,
          miniAppSecret: MINI_SECRET,
        },
      },
    );
    await configSave(ctx, { group: 'wechat-oa' }, { values: { enabled: true } });
    await configSave(ctx, { group: 'wechat-mini' }, { values: { enabled: true } });
    await configSave(
      ctx,
      { group: 'sms' },
      {
        values: {
          provider: 'aliyun',
          aliyunAccessKeyId: SMS_KEY_ID,
          aliyunAccessKeySecret: SMS_KEY_SECRET,
          aliyunSignName: '示例商城',
        },
      },
    );

    const payload = await siteConfigGet(anonymous());
    expect(payload.auth).toEqual({ wechatOa: true, wechatMini: true, phone: true });
    // The app ids and the SMS key id are not `secret: true`, so the registry
    // property test above does not cover them; they must not appear either.
    const serialised = JSON.stringify(payload);
    for (const value of [
      OA_APP_ID,
      OA_SECRET,
      MINI_APP_ID,
      MINI_SECRET,
      SMS_KEY_ID,
      SMS_KEY_SECRET,
    ]) {
      expect(serialised).not.toContain(value);
    }
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
