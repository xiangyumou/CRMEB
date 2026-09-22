import { admins } from '@shop/db/schema/auth';
import { couponTemplates, userCoupons } from '@shop/db/schema/coupon';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserSessionService } from '../auth/user-session.service';
import type { Actor, Ctx } from '../kernel/context';
import { fakeSmsSender, registerSmsSender, resetSmsSender, type FakeSmsSender } from '../sms';
import { smsConfig, wechatMiniConfig, wechatOaConfig } from '../system';
import { wechatConfig } from '../wechat';
import './index';
import * as auth from './storefront-auth.service';
import { storefrontAuthConfig } from './storefront-auth.config';
import * as admin from './user-admin.service';
import * as repo from './user.repo';
import * as service from './user.service';
import {
  fakeWechatIdentityPort,
  registerWechatIdentityPort,
  resetWechatIdentityPort,
} from './wechat-identity.port';

/**
 * Storefront sign-in, end to end, against a real PostgreSQL and a real Redis.
 *
 * The SMS provider and the WeChat API are the only two fakes: there are no
 * credentials for either and a test that hits them is a test that fails on a
 * Tuesday for reasons nobody can reproduce. Everything else — the Lua code
 * consumption, the throttle counters, the session rows, the `password_version`
 * bumps — is the production path.
 *
 * Importing `./index` is load bearing: it installs `registerUserLookup`, and
 * without it `UserSessionService.resolve` fails closed and every assertion
 * about a live token below would pass for the wrong reason.
 */

let harness: TestCtx;
let sms: FakeSmsSender;
let wechat: ReturnType<typeof fakeWechatIdentityPort>;

const NOW = '2026-06-01T00:00:00.000Z';
const PHONE = '13800138000';
const OTHER_PHONE = '13800138999';

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
  harness.clock.set(NOW);

  sms = fakeSmsSender();
  registerSmsSender(sms);
  wechat = fakeWechatIdentityPort();
  registerWechatIdentityPort(wechat);

  await harness.ctx.config.set(smsConfig, { templateVerifyCode: 'SMS_1' });
});

afterEach(() => {
  resetSmsSender();
  resetWechatIdentityPort();
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const anonymous: Actor = { kind: 'anonymous', id: null, permissions: [], isSuper: false };

function asAnonymous(meta: { platform?: Ctx['platform'] } = {}): Ctx {
  const base = harness.as(anonymous);
  return meta.platform === undefined ? base : { ...base, platform: meta.platform };
}

function asUser(id: number): Ctx {
  return harness.as({ kind: 'user', id, permissions: [], isSuper: false });
}

/**
 * Ask for a code and read it out of the fake provider.
 *
 * The resend guard is a real Redis TTL of a real minute, and these tests ask
 * for several codes for one number in a few milliseconds. Clearing the guard
 * key is the only honest way to do that — shortening it to zero would take the
 * guard out of every test that follows, including the one that asserts it.
 */
async function codeFor(scene: string, phone = PHONE, as: Ctx = asAnonymous()): Promise<string> {
  await harness.redis.del(`sms:resend:${scene}:${phone}`);
  await auth.sendSmsCode(as, { phone, scene: scene as never });
  const code = sms.lastCodeFor(phone);
  if (!code) throw new Error(`fixture: no code was sent to ${phone}`);
  return code;
}

/** A registered customer with a password, arrived at through the real flow. */
async function registerCustomer(phone = PHONE, password = 'crmeb654321') {
  const code = await codeFor('register', phone);
  const result = await auth.register(asAnonymous(), { phone, code, password });
  return { ...result, userId: Number(result.user.id) };
}

function sessions(): UserSessionService {
  return new UserSessionService(30 * 24 * 60 * 60 * 1000);
}

async function resolves(token: string): Promise<boolean> {
  return (await sessions().resolve(harness.ctx, token)) !== null;
}

// ---------------------------------------------------------------------------
// SMS codes
// ---------------------------------------------------------------------------

describe('sendSmsCode', () => {
  it('answers identically for a registered and an unregistered number', async () => {
    // No account enumeration: the legacy endpoint refused with 手机号已注册 and
    // turned the login screen into a free customer lookup.
    const unknown = await auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'register' });
    await registerCustomer();
    await harness.redis.del(`sms:resend:register:${PHONE}`);
    const known = await auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'register' });
    expect(known).toEqual(unknown);
  });

  it('refuses a second code inside the resend window and allows one after it', async () => {
    await auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'login' });
    await expect(
      auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'login' }),
    ).rejects.toMatchObject({ code: 'AUTH_SMS_TOO_FREQUENT' });

    // The resend guard is a Redis TTL, so a test has to really wait it out —
    // shortening the window is what the config field is for.
    await harness.ctx.config.set(storefrontAuthConfig, { codeResendSec: 30 });
    await harness.redis.del('sms:resend:login:13800138000');
    await expect(
      auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'login' }),
    ).resolves.toBeDefined();
  });

  it('keeps a separate resend window per scene', async () => {
    // The legacy system keyed on the phone number alone; a code sent for one
    // purpose blocked — and could be replayed against — another.
    await auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'login' });
    await expect(
      auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'register' }),
    ).resolves.toBeDefined();
  });

  it('enforces the per-phone hourly budget', async () => {
    await harness.ctx.config.set(smsConfig, { perPhonePerHour: 2 });
    await harness.ctx.config.set(storefrontAuthConfig, { codeResendSec: 30 });
    for (let i = 0; i < 2; i += 1) {
      await harness.redis.del(`sms:resend:login:${PHONE}`);
      await auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'login' });
    }
    await harness.redis.del(`sms:resend:login:${PHONE}`);
    await expect(
      auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'login' }),
    ).rejects.toMatchObject({ code: 'AUTH_SMS_TOO_FREQUENT' });
  });

  it('does not leave a usable code behind when the provider refuses', async () => {
    // Otherwise the shopper is told to wait 60 seconds for a code that was
    // never sent, and the stored one is dead weight an attacker can guess at.
    sms.failNext(1, { ok: false, providerCode: 'isv.OUT_OF_SERVICE' });
    await expect(
      auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'login' }),
    ).rejects.toMatchObject({ code: 'AUTH_SMS_SEND_FAILED' });
    expect(await harness.redis.exists(`sms:code:login:${PHONE}`)).toBe(0);
    expect(await harness.redis.exists(`sms:resend:login:${PHONE}`)).toBe(0);
  });

  it('requires a session for the scenes that act on the current account', async () => {
    await expect(
      auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'bind-phone' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('refuses when no provider is configured rather than logging the code', async () => {
    resetSmsSender();
    await expect(
      auth.sendSmsCode(asAnonymous(), { phone: PHONE, scene: 'login' }),
    ).rejects.toMatchObject({ code: 'AUTH_SMS_SEND_FAILED' });
  });
});

describe('code verification', () => {
  it('destroys the code on use, so it cannot be replayed', async () => {
    const code = await codeFor('login');
    await auth.smsLogin(asAnonymous(), { phone: PHONE, code });
    await expect(auth.smsLogin(asAnonymous(), { phone: PHONE, code })).rejects.toMatchObject({
      code: 'AUTH_SMS_CODE_INVALID',
    });
  });

  it('destroys the code after the configured number of wrong guesses', async () => {
    await harness.ctx.config.set(storefrontAuthConfig, { codeMaxAttempts: 3 });
    const code = await codeFor('login');
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 2; i += 1) {
      await expect(
        auth.smsLogin(asAnonymous(), { phone: PHONE, code: wrong }),
      ).rejects.toMatchObject({ code: 'AUTH_SMS_CODE_INVALID' });
    }
    await expect(auth.smsLogin(asAnonymous(), { phone: PHONE, code: wrong })).rejects.toMatchObject(
      {
        code: 'AUTH_SMS_CODE_ATTEMPTS_EXCEEDED',
      },
    );
    // The right code is worthless now: brute force costs a fresh SMS.
    await expect(auth.smsLogin(asAnonymous(), { phone: PHONE, code })).rejects.toMatchObject({
      code: 'AUTH_SMS_CODE_INVALID',
    });
  });

  it('will not let a code minted for one scene work in another', async () => {
    const code = await codeFor('register');
    await expect(auth.smsLogin(asAnonymous(), { phone: PHONE, code })).rejects.toMatchObject({
      code: 'AUTH_SMS_CODE_INVALID',
    });
  });
});

// ---------------------------------------------------------------------------
// registration and code login
// ---------------------------------------------------------------------------

describe('smsLogin', () => {
  it('registers an unknown number and logs in a known one', async () => {
    const first = await auth.smsLogin(asAnonymous(), {
      phone: PHONE,
      code: await codeFor('login'),
    });
    expect(first.registered).toBe(true);
    expect(first.user.phone).toBe(PHONE);
    expect(first.user.nickname).toBe('用户8000');

    await harness.redis.del(`sms:resend:login:${PHONE}`);
    const second = await auth.smsLogin(asAnonymous(), {
      phone: PHONE,
      code: await codeFor('login'),
    });
    expect(second.registered).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it('records where the account came from', async () => {
    const ctx = asAnonymous({ platform: 'wechat-mini' });
    await auth.sendSmsCode(ctx, { phone: PHONE, scene: 'login' });
    const result = await auth.smsLogin(ctx, { phone: PHONE, code: sms.lastCodeFor(PHONE)! });
    expect(result.user.registerSource).toBe('wechat_mini');
  });

  it('issues a token that resolves', async () => {
    const result = await auth.smsLogin(asAnonymous(), {
      phone: PHONE,
      code: await codeFor('login'),
    });
    expect(await resolves(result.token)).toBe(true);
  });
});

describe('register', () => {
  it('refuses a number that already has an account', async () => {
    await registerCustomer();
    await harness.redis.del(`sms:resend:register:${PHONE}`);
    const code = await codeFor('register');
    await expect(
      auth.register(asAnonymous(), { phone: PHONE, code, password: 'crmeb654321' }),
    ).rejects.toMatchObject({ code: 'AUTH_PHONE_TAKEN' });
  });

  it('refuses a password the legacy validator would have accepted', async () => {
    const code = await codeFor('register');
    await expect(
      auth.register(asAnonymous(), { phone: PHONE, code, password: '123456' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('issues the newcomer coupon to the new account and to nobody else', async () => {
    // INVARIANT USER-001. The grant runs inside the registration transaction,
    // so a registration that rolls back leaves no coupons and one that commits
    // needs no second request to earn them.
    const [template] = await harness.ctx.db
      .insert(couponTemplates)
      .values({
        name: '新人券',
        status: 'active',
        claimMode: 'new_user',
        discountAmount: '10.00',
        minSpend: '0.00',
        validityMode: 'days_after_claim',
        validDays: 30,
        isUnlimitedSupply: false,
        totalCount: 5,
        remainingCount: 5,
        perUserLimit: 1,
      })
      .returning({ id: couponTemplates.id });

    const bystander = await auth.smsLogin(asAnonymous(), {
      phone: OTHER_PHONE,
      code: await codeFor('login', OTHER_PHONE),
    });
    const newcomer = await registerCustomer();

    const granted = await harness.ctx.db
      .select({ userId: userCoupons.userId, templateId: userCoupons.templateId })
      .from(userCoupons);
    expect(granted).toHaveLength(2); // one each, and only through registration
    expect(granted.every((row) => row.templateId === template!.id)).toBe(true);
    expect(granted.map((row) => row.userId).sort()).toEqual(
      [newcomer.userId, Number(bystander.user.id)].sort(),
    );

    // The retry the shopper makes when the response was lost: refused, and it
    // issues nothing a second time.
    await harness.redis.del(`sms:resend:register:${PHONE}`);
    await expect(
      auth.register(asAnonymous(), {
        phone: PHONE,
        code: await codeFor('register'),
        password: 'crmeb654321',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_PHONE_TAKEN' });
    expect(await harness.ctx.db.select().from(userCoupons)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// password login
// ---------------------------------------------------------------------------

describe('passwordLogin', () => {
  it('accepts the account name and the phone number, in any case', async () => {
    const { userId } = await registerCustomer();
    for (const account of [PHONE, PHONE.toUpperCase()]) {
      const session = await auth.passwordLogin(asAnonymous(), {
        account,
        password: 'crmeb654321',
      });
      expect(Number(session.user.id)).toBe(userId);
    }
  });

  it('gives one error for a missing account and a wrong password', async () => {
    await registerCustomer();
    const missing = await auth
      .passwordLogin(asAnonymous(), { account: OTHER_PHONE, password: 'crmeb654321' })
      .catch((e: { code: string }) => e.code);
    const wrong = await auth
      .passwordLogin(asAnonymous(), { account: PHONE, password: 'wrong-one-1' })
      .catch((e: { code: string }) => e.code);
    expect(missing).toBe('AUTH_INVALID_CREDENTIALS');
    expect(wrong).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('gives the same error for an account that has no password at all', async () => {
    // A WeChat- or SMS-created account. Saying `AUTH_PASSWORD_NOT_SET` here
    // would confirm the account exists.
    await auth.smsLogin(asAnonymous(), { phone: PHONE, code: await codeFor('login') });
    await expect(
      auth.passwordLogin(asAnonymous(), { account: PHONE, password: 'anything-1' }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });

  it('only reveals that an account is disabled once the password is right', async () => {
    const { userId } = await registerCustomer();
    const reviewer = await makeAdminRow();
    await admin.adminSetStatus(
      harness.as({ kind: 'admin', id: reviewer, permissions: [], isSuper: true }),
      { id: String(userId) },
      { status: 'disabled' },
    );

    await expect(
      auth.passwordLogin(asAnonymous(), { account: PHONE, password: 'wrong-one-1' }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    await expect(
      auth.passwordLogin(asAnonymous(), { account: PHONE, password: 'crmeb654321' }),
    ).rejects.toMatchObject({ code: 'USER_DISABLED' });
  });

  it('upgrades a legacy md5 hash on the first successful login', async () => {
    const md5OfSecret = '5ebe2294ecd0e0f08eab7690d2a6ee69'; // md5('secret')
    const user = await harness.ctx.withTx((tx) =>
      repo.insertUser(tx, {
        account: PHONE,
        phone: PHONE,
        passwordHash: md5OfSecret,
        passwordAlgo: 'md5_legacy',
        nickname: null,
        avatarUrl: null,
        registerSource: 'h5',
        registerIp: null,
        now: harness.clock.now(),
      }),
    );

    await auth.passwordLogin(asAnonymous(), { account: PHONE, password: 'secret' });
    const after = await repo.findById(harness.ctx.db, user!.id);
    expect(after!.passwordAlgo).toBe('bcrypt');
    expect(after!.passwordHash).not.toBe(md5OfSecret);
    // The password did not change, so other devices stay signed in.
    expect(after!.passwordVersion).toBe(user!.passwordVersion);
    // And the same password still works through the new hash.
    await expect(
      auth.passwordLogin(asAnonymous(), { account: PHONE, password: 'secret' }),
    ).resolves.toBeDefined();
  });
});

describe('login throttling', () => {
  it('counts the account window and the account+IP window separately', async () => {
    // INVARIANT USER-013. One shared reverse proxy means an IP-only bucket
    // throttles the whole shop; an account-only bucket lets a botnet spread
    // the guesses across machines.
    await registerCustomer();
    await harness.ctx.config.set(storefrontAuthConfig, { loginMaxAttempts: 3 });

    const wrong = { account: PHONE, password: 'wrong-one-1' };
    for (let i = 0; i < 3; i += 1) {
      await expect(
        auth.passwordLogin(asAnonymous(), wrong, { ip: '203.0.113.1' }),
      ).rejects.toThrow();
    }

    // The account window is spent, so moving to a fresh address does not help…
    await expect(
      auth.passwordLogin(asAnonymous(), wrong, { ip: '203.0.113.2' }),
    ).rejects.toMatchObject({ code: 'AUTH_TOO_MANY_ATTEMPTS' });
    // …and neither does the right password, which is the point of a lockout.
    await expect(
      auth.passwordLogin(asAnonymous(), { account: PHONE, password: 'crmeb654321' }),
    ).rejects.toMatchObject({ code: 'AUTH_TOO_MANY_ATTEMPTS' });

    // Two distinct keys, and the account one is checked first — so the second
    // address never even gets a counter.
    expect(await harness.redis.get(`user:login:fail:${PHONE}`)).not.toBeNull();
    expect(await harness.redis.get(`user:login:fail:${PHONE}:203.0.113.1`)).toBe('3');
    expect(await harness.redis.get(`user:login:fail:${PHONE}:203.0.113.2`)).toBeNull();
  });

  it('parks one address without parking the account', async () => {
    // The other half of the pair: a single machine burns through its own
    // window first, and a shopper on a different connection is unaffected.
    await registerCustomer();
    await harness.ctx.config.set(storefrontAuthConfig, { loginMaxAttempts: 6 });
    const wrong = { account: PHONE, password: 'wrong-one-1' };

    for (let i = 0; i < 6; i += 1) {
      await auth.passwordLogin(asAnonymous(), wrong, { ip: '203.0.113.1' }).catch(() => undefined);
    }
    // The account counter is at 6 as well, so raise the account budget to
    // isolate the address counter and prove it is the one refusing.
    await harness.redis.del(`user:login:fail:${PHONE}`);
    await expect(
      auth.passwordLogin(asAnonymous(), wrong, { ip: '203.0.113.1' }),
    ).rejects.toMatchObject({ code: 'AUTH_TOO_MANY_ATTEMPTS' });
    await expect(
      auth.passwordLogin(
        asAnonymous(),
        { account: PHONE, password: 'crmeb654321' },
        { ip: '203.0.113.9' },
      ),
    ).resolves.toBeDefined();
  });

  it('uses the configured window, defaulting to the legacy 900 seconds', async () => {
    await registerCustomer();
    await auth
      .passwordLogin(asAnonymous(), { account: PHONE, password: 'wrong-one-1' })
      .catch(() => undefined);
    const ttl = await harness.redis.pttl(`user:login:fail:${PHONE}`);
    expect(ttl).toBeGreaterThan(890_000);
    expect(ttl).toBeLessThanOrEqual(900_000);
  });

  it('clears both counters on a successful login', async () => {
    await registerCustomer();
    await auth
      .passwordLogin(
        asAnonymous(),
        { account: PHONE, password: 'wrong-one-1' },
        { ip: '203.0.113.1' },
      )
      .catch(() => undefined);
    await auth.passwordLogin(
      asAnonymous(),
      { account: PHONE, password: 'crmeb654321' },
      { ip: '203.0.113.1' },
    );
    expect(await harness.redis.get(`user:login:fail:${PHONE}`)).toBeNull();
    expect(await harness.redis.get(`user:login:fail:${PHONE}:203.0.113.1`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

describe('sessions', () => {
  it('kills every session when the password changes', async () => {
    // INVARIANT USER-011.
    const first = await registerCustomer();
    const second = await auth.passwordLogin(asAnonymous(), {
      account: PHONE,
      password: 'crmeb654321',
    });
    expect(await resolves(first.token)).toBe(true);
    expect(await resolves(second.token)).toBe(true);

    await auth.changePassword(asUser(first.userId), {
      oldPassword: 'crmeb654321',
      password: 'crmeb-new-99',
    });

    expect(await resolves(first.token)).toBe(false);
    expect(await resolves(second.token)).toBe(false);
    await expect(
      auth.passwordLogin(asAnonymous(), { account: PHONE, password: 'crmeb-new-99' }),
    ).resolves.toBeDefined();
  });

  it('rejects a live token the moment the account is disabled', async () => {
    // INVARIANT USER-012.
    const { token, userId } = await registerCustomer();
    expect(await resolves(token)).toBe(true);

    const reviewer = await makeAdminRow();
    await admin.adminSetStatus(
      harness.as({ kind: 'admin', id: reviewer, permissions: [], isSuper: true }),
      { id: String(userId) },
      { status: 'disabled' },
    );
    expect(await resolves(token)).toBe(false);
  });

  it('rejects a live token once a cancellation is approved', async () => {
    const { token, userId } = await registerCustomer();
    const request = await service.requestCancellation(asUser(userId), {});
    const reviewer = await makeAdminRow();
    await admin.adminApproveCancellation(
      harness.as({ kind: 'admin', id: reviewer, permissions: [], isSuper: true }),
      { id: request.id },
      {},
    );
    expect(await resolves(token)).toBe(false);
  });

  it('logs one device out without touching the others', async () => {
    const first = await registerCustomer();
    const second = await auth.passwordLogin(asAnonymous(), {
      account: PHONE,
      password: 'crmeb654321',
    });
    await auth.logout(asUser(first.userId), first.token);
    expect(await resolves(first.token)).toBe(false);
    expect(await resolves(second.token)).toBe(true);
  });

  it('logs every device out on request, including the caller', async () => {
    const first = await registerCustomer();
    const second = await auth.passwordLogin(asAnonymous(), {
      account: PHONE,
      password: 'crmeb654321',
    });
    const result = await auth.logoutEverywhere(asUser(first.userId));
    expect(result.revoked).toBeGreaterThanOrEqual(2);
    expect(await resolves(first.token)).toBe(false);
    expect(await resolves(second.token)).toBe(false);
  });
});

describe('changePassword', () => {
  it('accepts an SMS code from an account that has no password to quote', async () => {
    const login = await auth.smsLogin(asAnonymous(), {
      phone: PHONE,
      code: await codeFor('login'),
    });
    const userId = Number(login.user.id);
    expect(login.user.hasPassword).toBe(false);

    const code = await codeFor('reset-password');
    await auth.changePassword(asUser(userId), { code, password: 'crmeb654321' });
    await expect(
      auth.passwordLogin(asAnonymous(), { account: PHONE, password: 'crmeb654321' }),
    ).resolves.toBeDefined();
  });

  it('refuses the old password when it is wrong, and refuses a no-op change', async () => {
    const { userId } = await registerCustomer();
    await expect(
      auth.changePassword(asUser(userId), { oldPassword: 'nope-12345', password: 'crmeb-new-99' }),
    ).rejects.toMatchObject({ code: 'AUTH_OLD_PASSWORD_INVALID' });
    await expect(
      auth.changePassword(asUser(userId), { oldPassword: 'crmeb654321', password: 'crmeb654321' }),
    ).rejects.toMatchObject({ code: 'AUTH_PASSWORD_UNCHANGED' });
  });
});

describe('resetPassword', () => {
  it('sets a new password from a code sent to the bound number', async () => {
    const { token, userId } = await registerCustomer();
    const code = await codeFor('reset-password');
    await auth.resetPassword(asAnonymous(), { phone: PHONE, code, password: 'crmeb-new-99' });

    expect(await resolves(token)).toBe(false);
    const session = await auth.passwordLogin(asAnonymous(), {
      account: PHONE,
      password: 'crmeb-new-99',
    });
    expect(Number(session.user.id)).toBe(userId);
  });

  it('refuses a number with no account, after consuming the code', async () => {
    const code = await codeFor('reset-password', OTHER_PHONE);
    await expect(
      auth.resetPassword(asAnonymous(), { phone: OTHER_PHONE, code, password: 'crmeb654321' }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// phone binding
// ---------------------------------------------------------------------------

describe('phone binding', () => {
  async function wechatCustomer(): Promise<number> {
    await harness.ctx.config.set(storefrontAuthConfig, { requirePhoneForWechat: false });
    await harness.ctx.config.set(wechatMiniConfig, { enabled: true, appId: 'wx-mini' });
    wechat.setMiniSession('code-1', { openid: 'o_mini_bind' });
    const result = await auth.miniLogin(asAnonymous(), { code: 'code-1' });
    return Number(result.session!.user.id);
  }

  it('binds a number and takes the synthetic account name with it', async () => {
    const userId = await wechatCustomer();
    const before = await repo.findById(harness.ctx.db, userId);
    expect(before!.account).toMatch(/^wx_[0-9a-f]{16}$/);

    const code = await codeFor('bind-phone', PHONE, asUser(userId));
    await auth.bindPhone(asUser(userId), { phone: PHONE, code });

    const after = await repo.findById(harness.ctx.db, userId);
    expect(after!.phone).toBe(PHONE);
    // The account name follows, so the shopper can now sign in with the number.
    expect(after!.account).toBe(PHONE);
  });

  it('refuses a number that belongs to somebody else', async () => {
    await registerCustomer();
    const userId = await wechatCustomer();
    const code = await codeFor('bind-phone', PHONE, asUser(userId));
    await expect(auth.bindPhone(asUser(userId), { phone: PHONE, code })).rejects.toMatchObject({
      code: 'AUTH_PHONE_TAKEN',
    });
  });

  it('refuses to bind twice and refuses to rebind what is not bound', async () => {
    const { userId } = await registerCustomer();
    const bind = await codeFor('bind-phone', OTHER_PHONE, asUser(userId));
    await expect(
      auth.bindPhone(asUser(userId), { phone: OTHER_PHONE, code: bind }),
    ).rejects.toMatchObject({ code: 'AUTH_PHONE_ALREADY_BOUND' });

    const wechatUserId = await wechatCustomer();
    const change = await codeFor('change-phone', PHONE, asUser(wechatUserId));
    await expect(
      auth.changePhone(asUser(wechatUserId), { phone: PHONE, code: change }),
    ).rejects.toMatchObject({ code: 'AUTH_PHONE_NOT_BOUND' });
  });

  it('rebinds on a code sent to the new number only', async () => {
    const { userId } = await registerCustomer();
    const code = await codeFor('change-phone', OTHER_PHONE, asUser(userId));
    await auth.changePhone(asUser(userId), { phone: OTHER_PHONE, code });
    const after = await repo.findById(harness.ctx.db, userId);
    expect(after!.phone).toBe(OTHER_PHONE);
  });

  it('leaves an account name the customer chose alone', async () => {
    const user = await harness.ctx.withTx((tx) =>
      repo.insertUser(tx, {
        account: 'xiaoming',
        phone: null,
        passwordHash: null,
        passwordAlgo: null,
        nickname: null,
        avatarUrl: null,
        registerSource: 'h5',
        registerIp: null,
        now: harness.clock.now(),
      }),
    );
    const code = await codeFor('bind-phone', PHONE, asUser(user!.id));
    await auth.bindPhone(asUser(user!.id), { phone: PHONE, code });
    const after = await repo.findById(harness.ctx.db, user!.id);
    expect(after!.account).toBe('xiaoming');
    expect(after!.phone).toBe(PHONE);
  });
});

// ---------------------------------------------------------------------------
// WeChat
// ---------------------------------------------------------------------------

describe('WeChat mini-program sign-in', () => {
  beforeEach(async () => {
    await harness.ctx.config.set(wechatMiniConfig, { enabled: true, appId: 'wx-mini' });
  });

  it('asks for a phone number first when the shop requires one', async () => {
    wechat.setMiniSession('code-1', { openid: 'o_mini_1' });
    const result = await auth.miniLogin(asAnonymous(), { code: 'code-1' });
    expect(result.status).toBe('phone-required');
    expect(result.session).toBeNull();
    expect(result.bindToken).toBeTruthy();
    // Nothing was created: a half-finished sign-in must not leave an account.
    expect(
      await repo.findIdentityByOpenid(harness.ctx.db, {
        platform: 'mini',
        openid: 'o_mini_1',
      }),
    ).toBeNull();
  });

  it('creates the account once the number comes back from WeChat', async () => {
    wechat.setMiniSession('code-1', { openid: 'o_mini_1' });
    wechat.setPhone('phone-code-1', { phone: PHONE });
    const started = await auth.miniLogin(asAnonymous(), { code: 'code-1' });
    const finished = await auth.miniPhoneLogin(asAnonymous(), {
      bindToken: started.bindToken!,
      phoneCode: 'phone-code-1',
    });

    expect(finished.status).toBe('signed-in');
    expect(finished.registered).toBe(true);
    expect(finished.session!.user.phone).toBe(PHONE);
    expect(finished.session!.user.boundWechat).toEqual(['mini']);
  });

  it('attaches to the existing account when the number is already registered', async () => {
    const { userId } = await registerCustomer();
    wechat.setMiniSession('code-1', { openid: 'o_mini_1' });
    wechat.setPhone('phone-code-1', { phone: PHONE });
    const started = await auth.miniLogin(asAnonymous(), { code: 'code-1' });
    const finished = await auth.miniPhoneLogin(asAnonymous(), {
      bindToken: started.bindToken!,
      phoneCode: 'phone-code-1',
    });
    expect(Number(finished.session!.user.id)).toBe(userId);
    expect(finished.registered).toBe(false);
  });

  it('signs a returning openid straight in', async () => {
    wechat.setMiniSession('code-1', { openid: 'o_mini_1' });
    wechat.setPhone('phone-code-1', { phone: PHONE });
    const started = await auth.miniLogin(asAnonymous(), { code: 'code-1' });
    const first = await auth.miniPhoneLogin(asAnonymous(), {
      bindToken: started.bindToken!,
      phoneCode: 'phone-code-1',
    });

    wechat.setMiniSession('code-2', { openid: 'o_mini_1' });
    const second = await auth.miniLogin(asAnonymous(), { code: 'code-2' });
    expect(second.status).toBe('signed-in');
    expect(second.session!.user.id).toBe(first.session!.user.id);
  });

  it('spends the bind token exactly once', async () => {
    wechat.setMiniSession('code-1', { openid: 'o_mini_1' });
    wechat.setPhone('phone-code-1', { phone: PHONE });
    const started = await auth.miniLogin(asAnonymous(), { code: 'code-1' });
    await auth.miniPhoneLogin(asAnonymous(), {
      bindToken: started.bindToken!,
      phoneCode: 'phone-code-1',
    });
    await expect(
      auth.miniPhoneLogin(asAnonymous(), {
        bindToken: started.bindToken!,
        phoneCode: 'phone-code-1',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_WECHAT_BIND_EXPIRED' });
  });

  it('refuses a spent WeChat code', async () => {
    await expect(auth.miniLogin(asAnonymous(), { code: 'never-issued' })).rejects.toMatchObject({
      code: 'AUTH_WECHAT_CODE_INVALID',
    });
  });

  it('refuses when the mini-program is not configured', async () => {
    await harness.ctx.config.set(wechatMiniConfig, { enabled: false });
    await expect(auth.miniLogin(asAnonymous(), { code: 'code-1' })).rejects.toMatchObject({
      code: 'AUTH_WECHAT_NOT_CONFIGURED',
    });
  });
});

describe('WeChat Official Account sign-in', () => {
  beforeEach(async () => {
    // The switch is the OA group's; the app id is the `wechat` group's (CR-1-j).
    await harness.ctx.config.set(wechatOaConfig, { enabled: true });
    await harness.ctx.config.set(wechatConfig, { oaAppId: 'wx-oa' });
    await harness.ctx.config.set(storefrontAuthConfig, { siteUrl: 'https://shop.example.com' });
  });

  it('builds an authorisation URL only for the configured origin', async () => {
    const { url, state } = await auth.oaAuthorizeUrl(asAnonymous(), {
      redirectUrl: 'https://shop.example.com/pages/me',
      scope: 'userinfo',
    });
    expect(url).toContain('appid=wx-oa');
    expect(url).toContain('scope=snsapi_userinfo');
    expect(url).toContain(`state=${state}`);
    expect(url.endsWith('#wechat_redirect')).toBe(true);

    await expect(
      auth.oaAuthorizeUrl(asAnonymous(), {
        redirectUrl: 'https://attacker.test/steal',
        scope: 'base',
      }),
    ).rejects.toMatchObject({ code: 'AUTH_REDIRECT_NOT_ALLOWED' });
  });

  it('finishes with an SMS code, because a browser cannot prove a number', async () => {
    wechat.setOaUser('oa-code-1', { openid: 'o_oa_1', nickname: '小明' });
    const started = await auth.oaLogin(asAnonymous(), { code: 'oa-code-1' });
    expect(started.status).toBe('phone-required');

    const code = await codeFor('login');
    const finished = await auth.oaPhoneLogin(asAnonymous(), {
      bindToken: started.bindToken!,
      phone: PHONE,
      code,
    });
    expect(finished.status).toBe('signed-in');
    expect(finished.session!.user.nickname).toBe('小明');
  });

  it('keeps the bind token alive when the SMS code is mistyped', async () => {
    // Otherwise a typo costs a fresh WeChat authorisation, which is the loop
    // the legacy flow was famous for.
    wechat.setOaUser('oa-code-1', { openid: 'o_oa_1' });
    const started = await auth.oaLogin(asAnonymous(), { code: 'oa-code-1' });
    const code = await codeFor('login');
    const wrong = code === '000000' ? '111111' : '000000';

    await expect(
      auth.oaPhoneLogin(asAnonymous(), {
        bindToken: started.bindToken!,
        phone: PHONE,
        code: wrong,
      }),
    ).rejects.toMatchObject({ code: 'AUTH_SMS_CODE_INVALID' });
    await expect(
      auth.oaPhoneLogin(asAnonymous(), { bindToken: started.bindToken!, phone: PHONE, code }),
    ).resolves.toMatchObject({ status: 'signed-in' });
  });

  it('recognises the same person on the other WeChat app through the unionid', async () => {
    // The legacy system gave this shopper a second, empty account with none of
    // their orders in it.
    await harness.ctx.config.set(wechatMiniConfig, { enabled: true, appId: 'wx-mini' });
    wechat.setOaUser('oa-code-1', { openid: 'o_oa_1', unionid: 'u_1' });
    const started = await auth.oaLogin(asAnonymous(), { code: 'oa-code-1' });
    const code = await codeFor('login');
    const first = await auth.oaPhoneLogin(asAnonymous(), {
      bindToken: started.bindToken!,
      phone: PHONE,
      code,
    });

    wechat.setMiniSession('mini-code-1', { openid: 'o_mini_1', unionid: 'u_1' });
    const second = await auth.miniLogin(asAnonymous(), { code: 'mini-code-1' });
    expect(second.status).toBe('signed-in');
    expect(second.session!.user.id).toBe(first.session!.user.id);
    // `order by platform` is an enum column, so PostgreSQL sorts by the order the
    // labels were declared in, not alphabetically. Which of the two comes first
    // is not a promise this API makes, so the assertion does not depend on it.
    expect([...second.session!.user.boundWechat].sort()).toEqual(['mini', 'oa']);
  });

  it('refuses to attach an openid that already belongs to somebody', async () => {
    wechat.setOaUser('oa-code-1', { openid: 'o_oa_1' });
    const started = await auth.oaLogin(asAnonymous(), { code: 'oa-code-1' });
    await auth.oaPhoneLogin(asAnonymous(), {
      bindToken: started.bindToken!,
      phone: PHONE,
      code: await codeFor('login'),
    });

    wechat.setOaUser('oa-code-2', { openid: 'o_oa_2' });
    const again = await auth.oaLogin(asAnonymous(), { code: 'oa-code-2' });
    await expect(
      auth.oaPhoneLogin(asAnonymous(), {
        bindToken: again.bindToken!,
        phone: PHONE,
        code: await codeFor('login'),
      }),
    ).rejects.toMatchObject({ code: 'AUTH_WECHAT_ALREADY_BOUND' });
  });

  it('fails closed when no WeChat adapter is registered', async () => {
    // A WeChat login route that signs somebody in without ever talking to
    // WeChat is not a degraded mode, it is an authentication bypass.
    resetWechatIdentityPort();
    await expect(auth.oaLogin(asAnonymous(), { code: 'oa-code-1' })).rejects.toMatchObject({
      code: 'AUTH_WECHAT_NOT_CONFIGURED',
    });
  });
});

async function makeAdminRow(): Promise<number> {
  const [row] = await harness.ctx.db
    .insert(admins)
    .values({
      account: `reviewer-${Math.random().toString(36).slice(2, 10)}`,
      passwordHash: 'x',
      name: '审核员',
      createdAt: harness.clock.now(),
      updatedAt: harness.clock.now(),
    })
    .returning({ id: admins.id });
  return row!.id;
}
