/**
 * Money crosses the migration as a **decimal string** and is never a JS number
 * on the way.
 *
 * The legacy columns are `decimal(8,2)`; the new ones are `numeric(12,2)`.
 * `mysql2` hands a `DECIMAL` back as a string by default, and it must stay one:
 * `Number('1234567.89')` is exact, but `0.1 + 0.2` is not, and one accidental
 * arithmetic step anywhere in the pipeline turns a price into `19.989999999`.
 * `Money` (integer fen) is the domain's representation; the ETL does not need
 * arithmetic at all, so it does not convert.
 *
 * This module therefore only **validates and normalises the text**, and throws
 * on anything that is not a decimal — a `NaN`, a float that arrived as a JS
 * number with more precision than the column, an empty string.
 */

export class LegacyMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyMoneyError';
  }
}

const DECIMAL = /^-?\d{1,12}(?:\.\d+)?$/;

/**
 * Normalises a legacy money value to a `numeric(12,2)`-shaped string.
 *
 * Accepts the string `mysql2` produces, and a JS number **only** when it is an
 * integer or has at most two decimals — a number with more precision than that
 * cannot have come from a `decimal(8,2)` and is a bug worth stopping for.
 */
export function decimalString(
  value: string | number | null | undefined,
  options: { scale?: number } = {},
): string | null {
  const scale = options.scale ?? 2;
  if (value === null || value === undefined || value === '') return null;

  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new LegacyMoneyError(`金额不是有限数：${String(value)}`);
    const rendered = value.toFixed(scale);
    if (Number(rendered) !== value) {
      throw new LegacyMoneyError(
        `金额 ${String(value)} 的精度超过 ${String(scale)} 位小数，不可能来自 decimal(8,2)，` +
          `多半在某一步被转成了浮点数`,
      );
    }
    text = rendered;
  } else {
    text = value.trim();
  }

  if (!DECIMAL.test(text)) throw new LegacyMoneyError(`不是合法的十进制金额：${text}`);

  const negative = text.startsWith('-');
  const digits = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = digits.split('.');
  const padded = (fraction + '0'.repeat(scale)).slice(0, scale);
  // Anything beyond the scale has to be zero: silently rounding money is how a
  // migration report ends up a few cents off with no way to find out where.
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) {
    throw new LegacyMoneyError(`金额 ${text} 的小数位超过 ${String(scale)} 位且不为零`);
  }
  const normalised = `${whole.replace(/^0+(?=\d)/, '')}${scale > 0 ? `.${padded}` : ''}`;
  return negative && Number(digits) !== 0 ? `-${normalised}` : normalised;
}

/** The same, but `null` becomes `'0.00'` — for NOT NULL money columns. */
export function decimalStringOrZero(
  value: string | number | null | undefined,
  options: { scale?: number } = {},
): string {
  const scale = options.scale ?? 2;
  return decimalString(value, options) ?? (scale > 0 ? `0.${'0'.repeat(scale)}` : '0');
}

/**
 * Sums decimal strings without ever leaving integer arithmetic, for the
 * verification report ("the coupon face values add up on both sides").
 */
export function sumDecimalStrings(values: readonly (string | null)[], scale = 2): string {
  const factor = 10 ** scale;
  let total = 0n;
  for (const value of values) {
    if (value === null) continue;
    const normalised = decimalString(value, { scale });
    if (normalised === null) continue;
    const negative = normalised.startsWith('-');
    const [whole = '0', fraction = ''] = (negative ? normalised.slice(1) : normalised).split('.');
    const units = BigInt(whole) * BigInt(factor) + BigInt(fraction.padEnd(scale, '0'));
    total += negative ? -units : units;
  }
  const negative = total < 0n;
  const abs = negative ? -total : total;
  const whole = abs / BigInt(factor);
  const fraction = (abs % BigInt(factor)).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${whole.toString()}${scale > 0 ? `.${fraction}` : ''}`;
}
