import { randomBytes } from 'node:crypto';

/**
 * The `user` domain's pure decisions.
 *
 * No `ctx`, no database, no clock that is not an argument — everything here is
 * a function of its inputs, so the parts worth arguing about (what an operator
 * is allowed to see, what survives a cancellation, what a synthetic account
 * name looks like) can be tested without a container.
 */

// ---------------------------------------------------------------------------
// display
// ---------------------------------------------------------------------------

/**
 * `13800138000` → `138****8000`.
 *
 * Applied to every phone number in the admin *list*; the detail route returns
 * the real one under its own permission. The middle four digits are the ones
 * that identify a person, and a screenshot of a customer table is an easy way
 * for them to leak.
 *
 * Anything that is not an 11-digit number is masked conservatively rather than
 * returned as-is: a malformed stored value is still somebody's phone number.
 */
export function maskPhone(phone: string | null): string | null {
  if (phone === null) return null;
  const digits = phone.trim();
  if (digits.length === 0) return null;
  if (digits.length <= 4) return '*'.repeat(digits.length);
  if (digits.length !== 11) {
    return digits.slice(0, 2) + '*'.repeat(digits.length - 4) + digits.slice(-2);
  }
  return `${digits.slice(0, 3)}****${digits.slice(7)}`;
}

/**
 * The nickname a new account starts with: `用户8000`, from the last four
 * digits of the phone number.
 *
 * Never empty, so no review or comment shows a blank author. A WeChat sign-in
 * overwrites this with the real nickname as soon as one arrives.
 */
export function defaultNickname(phone: string | null): string {
  if (phone && phone.length >= 4) return `用户${phone.slice(-4)}`;
  return `用户${randomBytes(2).toString('hex')}`;
}

/**
 * The account name for a customer who arrived through WeChat and has no phone
 * number yet.
 *
 * It has to be unique (`users_account_lower_uq`) and it has to be obviously not
 * a phone number, so it cannot collide with a later registration from a real
 * number. `wx_` plus 16 hex characters of randomness: derived from the openid
 * it would leak the openid to anybody who can see a nickname.
 */
export function syntheticAccount(prefix = 'wx'): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

/** Whether `account` still looks like one this domain generated. */
export function isSyntheticAccount(account: string): boolean {
  return /^(wx|del)_[0-9a-f]{16}$/.test(account);
}

/**
 * The account name an approved cancellation leaves behind.
 *
 * The row survives — orders, refunds and invoices reference it — but nothing
 * on it may identify a person, and the old name must stop occupying the unique
 * index so the same customer can register again tomorrow.
 */
export function anonymisedAccount(): string {
  return syntheticAccount('del');
}

// ---------------------------------------------------------------------------
// passwords
// ---------------------------------------------------------------------------

/**
 * The DB enum says `md5_legacy`; `auth/password.ts` says `md5`. One of them had
 * to be adapted, and changing a DB enum is a migration, so it is this function.
 */
export function toPasswordAlgo(stored: 'bcrypt' | 'md5_legacy' | null): 'bcrypt' | 'md5' {
  return stored === 'md5_legacy' ? 'md5' : 'bcrypt';
}

/**
 * What a storefront password must look like.
 *
 * A length check alone (6 to 16 characters) would allow `123456` — the single
 * most common password in every Chinese leak corpus — and forbid a passphrase.
 * So the floor is 6 with a composition rule (not all one class) and the ceiling
 * is bcrypt's own 72 *bytes*.
 *
 * Returns the reason rather than throwing so the caller decides which error
 * code it is: a self-service change and an operator reset are different routes.
 */
export function checkPasswordShape(plain: string): 'ok' | 'too-short' | 'too-long' | 'too-simple' {
  if (typeof plain !== 'string' || plain.length < 6) return 'too-short';
  if (Buffer.byteLength(plain, 'utf8') > 72) return 'too-long';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(plain)).length;
  if (classes < 2) return 'too-simple';
  return 'ok';
}

// ---------------------------------------------------------------------------
// addresses
// ---------------------------------------------------------------------------

/**
 * Whether this address must end up as the default regardless of what the form
 * asked for.
 *
 * A customer's first address is always the default: the checkout page has to
 * preselect something, and "no default" means an empty delivery block: a blank
 * card with a 提交订单 button under it.
 */
export function shouldForceDefault(existingCount: number, requested: boolean): boolean {
  return existingCount === 0 || requested;
}

// ---------------------------------------------------------------------------
// batch membership
// ---------------------------------------------------------------------------

export type BatchMode = 'replace' | 'add' | 'remove';

export interface BatchPlan {
  /** Wipe the selected customers' memberships first. */
  clearAll: boolean;
  /** Remove exactly these before inserting. */
  removeIds: number[];
  /** Insert these. */
  addIds: number[];
}

/**
 * Turns `mode` into the two statements the repo runs.
 *
 * `replace` with an empty list is a legitimate "clear their groups", which is
 * why `clearAll` is separate from `removeIds`: an empty `removeIds` must not be
 * mistaken for "remove nothing".
 */
export function planBatch(mode: BatchMode, ids: readonly number[]): BatchPlan {
  const unique = [...new Set(ids)];
  switch (mode) {
    case 'replace':
      return { clearAll: true, removeIds: [], addIds: unique };
    case 'add':
      return { clearAll: false, removeIds: [], addIds: unique };
    case 'remove':
      return { clearAll: false, removeIds: unique, addIds: [] };
  }
}

// ---------------------------------------------------------------------------
// paging
// ---------------------------------------------------------------------------

export function pageBounds(query: { page: number; pageSize: number }): {
  offset: number;
  limit: number;
} {
  return { offset: (query.page - 1) * query.pageSize, limit: query.pageSize };
}

/**
 * Picks a sort expression from a repo's whitelist.
 *
 * The contract already constrains `sortBy` to a literal union, so this is the
 * belt to that braces: no caller can reach a column that is not in the table
 * passed in, and an unknown key falls back to the default rather than throwing
 * a 500 at somebody who bookmarked an old URL.
 */
export function pickOrder<T extends Record<string, { asc: unknown; desc: unknown }>>(
  table: T,
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  fallback: keyof T,
): T[keyof T]['asc'] {
  const column = (sortBy !== undefined && sortBy in table ? table[sortBy] : table[fallback]) as
    T[keyof T] | undefined;
  const chosen = column ?? table[fallback];
  return sortOrder === 'asc' ? chosen.asc : chosen.desc;
}
