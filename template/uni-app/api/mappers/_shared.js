// Primitive converters shared by every mapper.
//
// All of these are pure and side-effect free: no `Date.now()`, no locale lookups, no
// access to the store. That is what lets `api/__tests__/` run them under plain Node.

/** `'9001'` → `9001`. Only for ids a page compares with `==` or does arithmetic on. */
export function toId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Integer with a fallback; `undefined`/`null`/`''`/`NaN` all collapse to `fallback`.
 * `Number(null)` and `Number('')` are both `0`, so they are rejected before the cast —
 * otherwise `toInt(dto && dto.pageSize, 20)` answers 0 for a missing payload.
 */
export function toInt(value, fallback) {
  const missing = fallback === undefined ? 0 : fallback;
  if (value === null || value === undefined || value === '') return missing;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : missing;
}

/**
 * Money stays a **string** all the way to the template: pages concatenate it with `￥`
 * and splitting it into a float would reintroduce the rounding the rewrite removed.
 */
export function money(value, fallback) {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  return fallback === undefined ? '0.00' : fallback;
}

/** Money as a number, for the few places that compare or sum before rendering. */
export function moneyNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/;

/**
 * Split an ISO-8601 instant into its wall-clock parts **in the offset it carries**.
 * The server sends `+08:00`; formatting through `Date` would re-render it in whatever
 * timezone the phone happens to be in, which is not what the old payload did.
 */
function parts(instant) {
  if (typeof instant !== 'string') return null;
  const m = INSTANT.exec(instant);
  if (!m) return null;
  return { y: m[1], mo: m[2], d: m[3], h: m[4], mi: m[5], s: m[6] };
}

/** `'2026-02-01T10:00:00+08:00'` → `'2026-02-01 10:00:00'`. */
export function legacyDateTime(instant, fallback) {
  const p = parts(instant);
  if (!p) return fallback === undefined ? '' : fallback;
  return `${p.y}-${p.mo}-${p.d} ${p.h}:${p.mi}:${p.s}`;
}

/** `'2026-02-01T10:00:00+08:00'` → `'2026-02-01 10:00'` (the 订单列表 format). */
export function legacyMinute(instant, fallback) {
  const p = parts(instant);
  if (!p) return fallback === undefined ? '' : fallback;
  return `${p.y}-${p.mo}-${p.d} ${p.h}:${p.mi}`;
}

/** `'2026-02-01T10:00:00+08:00'` → `'2026-02-01'`. */
export function legacyDate(instant, fallback) {
  const p = parts(instant);
  if (!p) return fallback === undefined ? '' : fallback;
  return `${p.y}-${p.mo}-${p.d}`;
}

/** `'2026-02-01T10:00:00+08:00'` → `'10:00:00'`. */
export function legacyTime(instant, fallback) {
  const p = parts(instant);
  if (!p) return fallback === undefined ? '' : fallback;
  return `${p.h}:${p.mi}:${p.s}`;
}

/**
 * Unix **seconds**. Pages that run a countdown subtract this from `Date.now()/1000`,
 * so it must be a real instant, not wall-clock parts.
 */
export function unixSeconds(instant, fallback) {
  if (typeof instant !== 'string' || instant === '') return fallback === undefined ? 0 : fallback;
  const t = Date.parse(instant);
  return Number.isFinite(t) ? Math.floor(t / 1000) : fallback === undefined ? 0 : fallback;
}

/** `[]` for a missing list, so `v-for` and `.length` never explode. */
export function list(value) {
  return Array.isArray(value) ? value : [];
}

/** Map a possibly-missing array. */
export function mapList(value, fn) {
  return list(value).map(fn);
}

/** `null`/`undefined` → `''`. Pages bind strings straight into templates. */
export function text(value, fallback) {
  if (value === null || value === undefined) return fallback === undefined ? '' : fallback;
  return String(value);
}

/** Legacy booleans are `0`/`1` ints, not `true`/`false`. */
export function flag(value) {
  return value ? 1 : 0;
}

/**
 * The legacy paginated envelope. Most list pages read `res.data` as a bare array and
 * stop paging when `data.length < limit`, so the array *is* the payload; the few that
 * want a count read `res.data.list` / `res.data.count` and get `pagedList` instead.
 */
export function pagedList(dto, mapItem) {
  return {
    list: mapList(dto && dto.items, mapItem),
    count: toInt(dto && dto.total, 0),
    page: toInt(dto && dto.page, 1),
    limit: toInt(dto && dto.pageSize, 20),
  };
}

/** Page params: legacy sends `{page, limit}`, the API wants `{page, pageSize}`. */
export function fromLegacyPage(data) {
  const src = data || {};
  const out = {};
  if (src.page !== undefined && src.page !== null && src.page !== '') out.page = toInt(src.page, 1);
  const size = src.limit !== undefined ? src.limit : src.pageSize;
  if (size !== undefined && size !== null && size !== '') out.pageSize = toInt(size, 20);
  return out;
}
