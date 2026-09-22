/**
 * Secrets stay secret — in the report, in the log, in the error and in the
 * test snapshot.
 *
 * The config migration moves API keys, merchant private keys, SMS credentials
 * and the WeChat v3 key out of `eb_system_config` and into `config_values`. A
 * migration report that prints "mapped `pay_weixin_client_key` = -----BEGIN…"
 * has just copied a merchant private key into a terminal scrollback, a CI log
 * and whatever the operator pastes into a ticket.
 *
 * So the report never prints a *value*. It prints the key and one of two
 * words: `<set>` or `<empty>`. That is enough to answer the only question the
 * operator has ("did the credential come across?") and not enough to leak one.
 *
 * `describeValue` is the only way a value reaches the report, and
 * `redact.test.ts` asserts that the whole rendered report of a fixture holding
 * planted secrets contains none of them.
 */

export type ValueMarker = '<set>' | '<empty>';

/**
 * `<set>` when the value carries information, `<empty>` when it does not.
 *
 * "Empty" is deliberately generous: `''`, `null`, `undefined`, `[]`, `{}`, and
 * a string of nothing but whitespace are all `<empty>`, because an operator
 * reading `<set>` should be able to trust that something really came across.
 * `0` and `false` are `<set>` — they are real configured values.
 */
export function describeValue(value: unknown): ValueMarker {
  if (value === null || value === undefined) return '<empty>';
  if (typeof value === 'string') return value.trim() === '' ? '<empty>' : '<set>';
  if (Array.isArray(value)) return value.length === 0 ? '<empty>' : '<set>';
  if (typeof value === 'object') return Object.keys(value).length === 0 ? '<empty>' : '<set>';
  return '<set>';
}

/**
 * Replaces every value in a `{ key: value }` map with its marker.
 *
 * Takes the *whole* object rather than a per-field "is this one secret?"
 * decision on purpose: a per-field decision needs a list of which keys are
 * secret, and the first key that is not on the list is the one that leaks.
 * Nothing in the ETL ever has to print a config value, so nothing does.
 */
export function describeValues(
  values: Readonly<Record<string, unknown>>,
): Record<string, ValueMarker> {
  const described: Record<string, ValueMarker> = {};
  for (const key of Object.keys(values).sort()) described[key] = describeValue(values[key]);
  return described;
}

/**
 * Strips anything that looks like a credential out of a message that is about
 * to be logged.
 *
 * Used on the *connection strings*, which carry a password and are handed to
 * the runner on the command line and through the environment: `mysql://user:
 * hunter2@host/db` must never reach a log line or an error. Anything that
 * cannot be parsed as a URL is reduced to its scheme, because a string we
 * cannot parse is one whose shape we do not know.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password !== '') parsed.password = '***';
    if (parsed.username !== '') parsed.username = '***';
    return parsed.toString();
  } catch {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1];
    return scheme ? `${scheme}://***` : '***';
  }
}
