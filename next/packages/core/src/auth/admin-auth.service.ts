import type { AdminLoginBody, AdminProfile } from '@shop/contracts/auth/schemas';
import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { toId } from '../kernel/ids';
import { fixedWindow, resetFixedWindow } from '../kernel/rate-limit';
import * as adminRepo from './admin.repo';
import {
  createAdminSessionStore,
  DEFAULT_ADMIN_SESSION_TTL_MS,
  type AdminSession,
  type AdminSessionStore,
} from './admin-session.store';
import { captchaRequired, getCaptchaVerifier } from './captcha';
import { hashPassword, verifyPassword, type PasswordAlgo } from './password';
import { effectivePermissions } from './rbac';

/**
 * Admin sign-in.
 *
 * The throttle is **per account, not per IP**: every request arrives through
 * one shared reverse proxy, so an IP bucket would either be useless (one IP for
 * everybody) or a self-inflicted outage. Five wrong passwords parks that
 * account for fifteen minutes; a correct password clears the counter.
 *
 * A wrong account and a wrong password return the same error and take a
 * similar amount of work, so the endpoint does not enumerate accounts.
 */

export interface AdminAuthOptions {
  sessionTtlMs?: number;
  maxAttempts?: number;
  attemptWindowMs?: number;
  /** Lowered to 4 in tests; pure-JS bcrypt at cost 10 is ~250ms. */
  bcryptCost?: number;
}

const DEFAULTS = {
  sessionTtlMs: DEFAULT_ADMIN_SESSION_TTL_MS,
  maxAttempts: 5,
  attemptWindowMs: 15 * 60 * 1000,
} as const;

/** Exactly the contract's request body — one source of truth, no drift. */
export type LoginInput = AdminLoginBody;

export interface LoginResult {
  /** Opaque token for the `admin_session` cookie. Never logged, never returned in a body. */
  token: string;
  profile: AdminProfile;
  expiresInMs: number;
}

export class AdminAuthService {
  private readonly store: AdminSessionStore;
  private readonly options: Required<AdminAuthOptions>;

  constructor(ctx: Pick<Ctx, 'redis'>, options: AdminAuthOptions = {}) {
    this.options = {
      sessionTtlMs: options.sessionTtlMs ?? DEFAULTS.sessionTtlMs,
      maxAttempts: options.maxAttempts ?? DEFAULTS.maxAttempts,
      attemptWindowMs: options.attemptWindowMs ?? DEFAULTS.attemptWindowMs,
      bcryptCost: options.bcryptCost ?? 10,
    };
    this.store = createAdminSessionStore({
      redis: ctx.redis,
      ttlMs: this.options.sessionTtlMs,
    });
  }

  private throttleKey(account: string): string {
    return `admin:login:fail:${account.trim().toLowerCase()}`;
  }

  async login(ctx: Ctx, input: LoginInput): Promise<LoginResult> {
    const account = input.account.trim();
    const key = this.throttleKey(account);

    const throttle = await fixedWindow(ctx.redis, {
      key,
      limit: this.options.maxAttempts,
      windowMs: this.options.attemptWindowMs,
      nowMs: ctx.clock.nowMs(),
    });
    if (!throttle.allowed) {
      throw new DomainError('AUTH_TOO_MANY_ATTEMPTS', {
        details: { retryAfterMs: throttle.retryAfterMs },
      });
    }

    const verifier = getCaptchaVerifier();
    const attemptsSoFar = this.options.maxAttempts - throttle.remaining - 1;
    if (verifier && captchaRequired({ failedAttempts: attemptsSoFar })) {
      if (!input.captchaToken) throw new DomainError('AUTH_CAPTCHA_REQUIRED');
      const passed = await verifier.verify(input.captchaToken, { subject: account.toLowerCase() });
      if (!passed) throw new DomainError('AUTH_CAPTCHA_INVALID');
    }

    const admin = await adminRepo.findByAccount(ctx.db, account);
    if (!admin) {
      // Same error, same shape as a wrong password: no account enumeration.
      throw new DomainError('AUTH_INVALID_CREDENTIALS');
    }

    const verified = await verifyPassword(
      input.password,
      admin.passwordHash,
      admin.passwordAlgo as PasswordAlgo,
    );
    if (!verified.ok) throw new DomainError('AUTH_INVALID_CREDENTIALS');

    // Checked *after* the password so a disabled account is not detectable
    // without the right credentials.
    if (admin.status !== 1) throw new DomainError('AUTH_ACCOUNT_DISABLED');

    const now = ctx.clock.now();
    if (verified.needsUpgrade) {
      const upgraded = await hashPassword(input.password, this.options.bcryptCost);
      await adminRepo.upgradePasswordHash(ctx.db, admin.id, {
        fromHash: admin.passwordHash,
        toHash: upgraded,
        now,
      });
      ctx.logger.info({ adminId: admin.id }, 'upgraded legacy md5 password to bcrypt');
    }

    const granted = admin.isSuper ? [] : await adminRepo.loadPermissions(ctx.db, admin.id);
    const permissions = effectivePermissions(granted);

    const token = await this.store.create(
      {
        adminId: admin.id,
        account: admin.account,
        name: admin.name,
        avatar: admin.avatar,
        isSuper: admin.isSuper,
        permissions,
        passwordVersion: admin.passwordVersion,
      },
      ctx.clock.nowMs(),
    );

    await resetFixedWindow(ctx.redis, key);
    await adminRepo.touchLastLogin(ctx.db, admin.id, now);
    ctx.logger.info({ adminId: admin.id, account: admin.account }, 'admin login');

    return {
      token,
      profile: toProfile({
        adminId: admin.id,
        account: admin.account,
        name: admin.name,
        avatar: admin.avatar,
        isSuper: admin.isSuper,
        permissions,
        passwordVersion: admin.passwordVersion,
        createdAt: ctx.clock.nowMs(),
      }),
      expiresInMs: this.options.sessionTtlMs,
    };
  }

  /** Resolves a cookie value to a session, sliding its TTL. `null` when invalid. */
  async resolve(token: string): Promise<(AdminSession & { sessionId: string }) | null> {
    return this.store.resolve(token);
  }

  async logout(token: string): Promise<void> {
    await this.store.destroy(token);
  }

  /** Called on password change and on account disable. */
  async revokeAll(adminId: number): Promise<number> {
    return this.store.revokeAllForAdmin(adminId);
  }

  /**
   * Sets a new password: bumps `password_version` *and* drops every session.
   * Both, always — the version alone would leave a live cookie working until
   * its next database read, and there is no database read on the hot path.
   */
  async changePassword(ctx: Ctx, adminId: number, newPassword: string): Promise<void> {
    const hash = await hashPassword(newPassword, this.options.bcryptCost);
    await adminRepo.setPassword(ctx.db, adminId, { hash, now: ctx.clock.now() });
    const revoked = await this.revokeAll(adminId);
    ctx.logger.info({ adminId, revoked }, 'admin password changed, sessions revoked');
  }

  /** `/admin-api/auth/me`. Reads the session, not the database. */
  async me(ctx: Ctx): Promise<AdminProfile> {
    if (ctx.actor.kind !== 'admin' || ctx.actor.id === null) {
      throw new DomainError('UNAUTHENTICATED');
    }
    const admin = await adminRepo.findById(ctx.db, ctx.actor.id);
    if (!admin) throw new DomainError('AUTH_SESSION_EXPIRED');
    return {
      id: toId(admin.id),
      account: admin.account,
      name: admin.name,
      avatar: admin.avatar,
      isSuper: admin.isSuper,
      permissions: [...ctx.actor.permissions],
    };
  }
}

export function toProfile(session: AdminSession): AdminProfile {
  return {
    id: toId(session.adminId),
    account: session.account,
    name: session.name,
    avatar: session.avatar,
    isSuper: session.isSuper,
    permissions: session.permissions,
  };
}
