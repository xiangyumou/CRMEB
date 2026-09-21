import { createHash, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * Password hashing.
 *
 * `bcryptjs` rather than a native binding: pnpm 12 requires build-script
 * approval, the production box has two cores and no toolchain, and CI images
 * should not need one. It is pure JS and slower than a native bcrypt, which is
 * why the cost factor is configurable and tests drop it to 4.
 *
 * Legacy rows carry `password_algo = 'md5'` — CRMEB stored `md5(password)`.
 * Those verify once and are rewritten as bcrypt on that first successful
 * login (PLAN §6: "遗留 MD5 标 password_algo='md5' 首次登录升级"). We never
 * *create* an md5 hash.
 */

export type PasswordAlgo = 'bcrypt' | 'md5';

/** ~250ms in pure JS on the target box. Tests override it. */
export const DEFAULT_BCRYPT_COST = 10;

export async function hashPassword(
  plain: string,
  cost: number = DEFAULT_BCRYPT_COST,
): Promise<string> {
  assertPasswordShape(plain);
  return bcrypt.hash(plain, cost);
}

export interface VerifyResult {
  ok: boolean;
  /**
   * `true` when the stored hash is legacy md5 and the password was correct:
   * the caller must immediately rewrite it as bcrypt, in the same transaction
   * as the login bookkeeping.
   */
  needsUpgrade: boolean;
}

export async function verifyPassword(
  plain: string,
  hash: string,
  algo: PasswordAlgo = 'bcrypt',
): Promise<VerifyResult> {
  if (
    typeof plain !== 'string' ||
    plain.length === 0 ||
    typeof hash !== 'string' ||
    hash.length === 0
  ) {
    return { ok: false, needsUpgrade: false };
  }
  if (algo === 'md5') {
    return { ok: verifyMd5Legacy(plain, hash), needsUpgrade: verifyMd5Legacy(plain, hash) };
  }
  try {
    return { ok: await bcrypt.compare(plain, hash), needsUpgrade: false };
  } catch {
    // A malformed hash must read as "wrong password", not as a 500.
    return { ok: false, needsUpgrade: false };
  }
}

/** Constant-time compare of `md5(plain)` against a stored 32-char hex digest. */
export function verifyMd5Legacy(plain: string, hash: string): boolean {
  if (!/^[0-9a-fA-F]{32}$/.test(hash)) return false;
  const computed = createHash('md5').update(plain, 'utf8').digest();
  const stored = Buffer.from(hash.toLowerCase(), 'hex');
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

/**
 * Rejects the two shapes bcrypt gets wrong: an empty password, and one past 72
 * bytes (bcrypt silently truncates, so "correct horse battery staple…" and a
 * different 90-byte password would be the same secret).
 */
export function assertPasswordShape(plain: string): void {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new TypeError('密码不能为空');
  }
  if (Buffer.byteLength(plain, 'utf8') > 72) {
    throw new TypeError('密码过长（bcrypt 上限 72 字节）');
  }
}

/** sha256, lowercase hex. Session tokens are stored as this, never in the clear. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
