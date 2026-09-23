/**
 * Placeholder substitution, and the rules for what a channel may be told.
 *
 * Pure functions with a plain unit test — no database, no clock, no context —
 * because every interesting case here is a string case: a missing variable, a
 * placeholder with spaces in it, a value long enough for WeChat to reject the
 * whole message.
 */

/** `{{ orderNo }}` and `{{orderNo}}` are the same placeholder. */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/**
 * Substitutes `{{name}}` from `data`.
 *
 * An unknown placeholder renders as the **empty string**, not as itself. A
 * customer reading "您的订单 {{orderNo}} 已发货" learns that the shop is broken;
 * one reading "您的订单 已发货" learns nothing but is not alarmed. The admin form
 * lists every variable an event provides, which is where a typo should be
 * caught.
 */
export function render(template: string, data: Readonly<Record<string, string>>): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => data[name] ?? '');
}

/** Which placeholders a template actually uses. Drives the "unused variable" hint. */
export function placeholdersIn(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (name !== undefined) found.add(name);
  }
  return [...found].sort();
}

/**
 * WeChat rejects a template-message field longer than 200 characters with
 * `errcode 47001`, which reads like a malformed-JSON error and sends everyone
 * looking in the wrong place. Truncating is the lesser evil: the message
 * arrives, slightly short, instead of the effect retrying eight times and
 * parking.
 */
export const WECHAT_FIELD_LIMIT = 200;

export function clampField(value: string, limit = WECHAT_FIELD_LIMIT): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

/**
 * Renders a field map (`{ first: '…', keyword1: '{{orderNo}}' }`) into what a
 * template-message API wants: `{ first: { value: '…' } }`.
 *
 * A field that renders to the empty string is **dropped**, not sent as `""`.
 * WeChat's subscribe-message validator types its fields — `thing3` must be 1-20
 * characters, `amount5` must look like money — and an empty string fails the
 * type check for the whole message (`errcode 47003`), so one missing variable
 * would lose the entire notification instead of one line of it.
 */
export function renderFields(
  fields: Readonly<Record<string, string>> | undefined,
  data: Readonly<Record<string, string>>,
): Record<string, { value: string }> {
  const out: Record<string, { value: string }> = {};
  for (const [key, template] of Object.entries(fields ?? {})) {
    const value = clampField(render(template, data));
    if (value !== '') out[key] = { value };
  }
  return out;
}

/**
 * Everything in the payload flattened to strings, because a template is text.
 *
 * `null` and `undefined` become the empty string (so the placeholder
 * disappears), numbers and booleans are stringified, and anything structured is
 * dropped rather than rendered as `[object Object]` — which is the one output
 * that would certainly be wrong in a customer's inbox.
 */
export function toTemplateData(payload: unknown): Record<string, string> {
  if (typeof payload !== 'object' || payload === null) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (value === null || value === undefined) {
      out[key] = '';
    } else if (typeof value === 'string') {
      out[key] = value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      out[key] = String(value);
    }
  }
  return out;
}

const shopDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const shopClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * An instant as a shopper reads it: the shop's own calendar, not UTC.
 *
 * A template is text, so a domain that puts a time into `data` formats it
 * first; an ISO string in a customer's inbox (`2026-06-01T16:00:00.000Z`) is
 * both unreadable and, eight hours out, wrong about which day it is.
 *
 * `'day'` → `2026-06-02`; `'minute'` → `2026-06-02 00:00`.
 */
export function formatShopTime(at: Date, precision: 'day' | 'minute'): string {
  const day = shopDay.format(at);
  return precision === 'day' ? day : `${day} ${shopClock.format(at)}`;
}
