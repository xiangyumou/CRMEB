/**
 * Password hashes cross as they are, labelled with the algorithm that produced
 * them.
 *
 * The legacy shop stored **unsalted MD5** in a `varchar(32)` and, after the
 * reliability release widened the column, bcrypt in the same one. A migration
 * has exactly two honest options: carry the hash and say what it is, or force
 * every account to reset. We carry it — `password_algo` is `'bcrypt'` or
 * `'md5_legacy'`, the login path upgrades an `md5_legacy` hash in place on the
 * first successful login (SCHEMA.md §4.3), and nothing here ever relabels one
 * as the other.
 *
 * Relabelling is the failure that matters: an MD5 hash written down as bcrypt
 * fails every future login *and* hides the fact that the shop still holds
 * unsalted MD5s. `ETL-F1-001` exists for exactly this.
 *
 * Nothing in this module logs, returns or embeds a hash. The classifier looks
 * at the *shape* only.
 */

export type PasswordAlgo = 'bcrypt' | 'md5_legacy';

/** `$2a$`, `$2b$`, `$2y$` + cost + 22 salt chars + 31 hash chars = 60. */
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const MD5 = /^[0-9a-fA-F]{32}$/;

export class UnknownPasswordHashError extends Error {
  constructor(label: string, length: number) {
    // Deliberately no hash, no prefix, no sample: an error message ends up in a
    // log, a ticket and a test snapshot.
    super(
      `${label}：无法识别的口令散列格式（长度 ${String(length)}）。` +
        `既不是 bcrypt 也不是 32 位 MD5，拒绝猜测算法。`,
    );
    this.name = 'UnknownPasswordHashError';
  }
}

export interface ClassifiedPassword {
  passwordHash: string;
  passwordAlgo: PasswordAlgo;
}

/**
 * Classifies a stored hash. An empty value is `null` — the account cannot log
 * in with a password and never could; inventing a hash for it would be worse.
 */
export function classifyPasswordHash(
  label: string,
  hash: string | null | undefined,
): ClassifiedPassword | null {
  if (hash === null || hash === undefined) return null;
  const value = hash.trim();
  if (value === '') return null;
  if (BCRYPT.test(value)) return { passwordHash: value, passwordAlgo: 'bcrypt' };
  if (MD5.test(value)) return { passwordHash: value.toLowerCase(), passwordAlgo: 'md5_legacy' };
  throw new UnknownPasswordHashError(label, value.length);
}

/** Counts how many of a batch are still on MD5, for the migration report. */
export function countLegacyHashes(rows: readonly { passwordAlgo: string }[]): number {
  return rows.filter((row) => row.passwordAlgo !== 'bcrypt').length;
}
