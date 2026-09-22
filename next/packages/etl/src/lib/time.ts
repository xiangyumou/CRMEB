/**
 * Time, the one way.
 *
 * The legacy database stores every instant as **unix seconds in an `int`**, and
 * PHP wrote them with `date_default_timezone_set('Asia/Shanghai')`. A unix
 * second is an absolute instant, so the timezone is not part of the value — it
 * only decides what a human reading the old admin saw. The new columns are
 * `timestamptz`, which is also absolute, so the conversion is a multiplication
 * and nothing else. `Asia/Shanghai` matters in exactly two places:
 *
 *  1. a legacy `datetime` column (there are a few: `eb_store_product.*_time`
 *     variants, `eb_wechat_media.add_time` in some builds) carries **no**
 *     offset, and MySQL hands it to `mysql2` as a JS `Date` interpreted in the
 *     *connection's* timezone — so the ETL pins the connection to `+08:00` and
 *     `fromLegacyDateTime` refuses anything that did not come through it;
 *  2. a legacy *date* (a birthday, `2001-05-04`) has to become an instant, and
 *     it becomes midnight in Shanghai, not midnight UTC, which would be the
 *     previous evening.
 *
 * `0` is the legacy spelling of NULL. So is `''`, `'0000-00-00'` and
 * `'0000-00-00 00:00:00'`. All of them become `null`, never the epoch — a
 * product "created" on 1970-01-01 is a migration bug that survives for years.
 */

/** The offset PHP ran with, and the one the legacy MySQL connection is pinned to. */
export const LEGACY_TIMEZONE = 'Asia/Shanghai';
export const LEGACY_UTC_OFFSET_MINUTES = 8 * 60;

/** Instants before this are a corrupt legacy value, not a real date. */
const PLAUSIBLE_FROM_MS = Date.UTC(2000, 0, 1);
/** …and after this. The shop is not taking orders in 2100. */
const PLAUSIBLE_TO_MS = Date.UTC(2100, 0, 1);

export class LegacyTimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyTimeError';
  }
}

/**
 * Legacy unix seconds → `Date`, `0` (and every other legacy null spelling) →
 * `null`.
 *
 * Negative values and values far outside a plausible window throw: they are
 * always a column that held something other than a timestamp, and silently
 * writing 1970 into `created_at` is the kind of damage nobody notices until a
 * report is wrong a year later.
 */
export function fromEpochSeconds(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const seconds = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(seconds)) {
    throw new LegacyTimeError(`不是合法的时间戳：${String(value)}`);
  }
  if (seconds === 0) return null;
  if (seconds < 0) {
    throw new LegacyTimeError(`时间戳为负数：${String(value)}`);
  }
  const ms = seconds * 1000;
  if (ms < PLAUSIBLE_FROM_MS || ms >= PLAUSIBLE_TO_MS) {
    throw new LegacyTimeError(
      `时间戳 ${String(value)} 超出合理区间（2000-01-01 ~ 2100-01-01），多半不是时间列`,
    );
  }
  return new Date(ms);
}

/**
 * The same conversion, but a value the source cannot supply falls back rather
 * than throwing. Used for `created_at`-style NOT NULL columns, where "unknown"
 * has to become *something*: it becomes the migration instant, never the epoch.
 */
export function fromEpochSecondsOr(
  value: number | string | null | undefined,
  fallback: Date,
): Date {
  try {
    return fromEpochSeconds(value) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * A legacy `DATETIME`/`TIMESTAMP` column. `mysql2` gives it to us as a `Date`
 * already resolved against the connection timezone (which `openLegacy` pins to
 * `+08:00`), or as a string when `dateStrings` is on. Both are accepted; a
 * string is read as Shanghai wall-clock time.
 */
export function fromLegacyDateTime(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = value.trim();
  if (text === '' || text.startsWith('0000-00-00')) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text) ?? null;
  if (!match) {
    throw new LegacyTimeError(`不是合法的 datetime：${text}`);
  }
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = match;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  // The wall clock was Shanghai's, so the instant is that many minutes earlier.
  return new Date(utcMs - LEGACY_UTC_OFFSET_MINUTES * 60_000);
}

/** A legacy `DATE` (`2001-05-04`) → midnight **in Shanghai**, not in UTC. */
export function fromLegacyDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) return value;
  if (value === null || value === undefined) return null;
  const text = value.trim();
  if (text === '' || text.startsWith('0000-00-00')) return null;
  return fromLegacyDateTime(`${text.slice(0, 10)} 00:00:00`);
}
