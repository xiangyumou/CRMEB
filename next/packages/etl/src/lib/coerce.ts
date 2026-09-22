/**
 * Legacy config values are strings. New config schemas are typed.
 *
 * `eb_system_config.value` is a `text` column holding a **JSON-encoded string**
 * — the old admin screens posted form fields and PHP stored what it was given,
 * so the stock warning threshold is `"5"`, not `5`, and "enabled" is `"1"`, not
 * `true`. The new schemas are zod, and `z.number()` rejects `'5'`.
 *
 * Without a coercion step, essentially every numeric and boolean setting in a
 * real shop fails validation, and `--allow-invalid-config` would quietly reset
 * all of them to their defaults — a migration that "succeeds" and turns the
 * shop's configuration back to factory settings. That is the single worst
 * outcome available here, so the coercion is deliberate and narrow.
 *
 * Narrow means: only a string that is *unambiguously* the value in question is
 * converted. `'5'` and `' 5 '` become `5`; `'5 件'`, `''` and `'abc'` do not, and are
 * reported as invalid so somebody looks at them. `'1'` becomes `true` but
 * `'yes'` does not — the old system never wrote `yes`, and guessing at a
 * boolean is how a shop comes up with a payment method silently switched on.
 *
 * What is coerced is decided by **zod's own complaint**, not by inspecting a
 * schema's internals: the value is parsed, and each `invalid_type` issue names
 * the field and the type it expected. That keeps this working for schemas that
 * use unions, defaults, effects or anything else, none of which this file has
 * to understand.
 */

/** The zod primitive a field asked for. */
export type ExpectedType = 'number' | 'boolean' | 'string' | 'bigint';

/**
 * An integer or decimal, optionally signed — applied after trimming, so ` 5 `
 * is 5. Deliberately narrower than `Number()`, which accepts `0x10`, `1e5`,
 * `Infinity` and `''`, none of which the old admin screens could produce and
 * every one of which would be a guess.
 */
const NUMERIC = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/**
 * Converts a legacy value to `expected`, or returns `undefined` when it cannot
 * be done unambiguously.
 *
 * `undefined` means "leave it alone and let zod report it": a value this
 * function is not sure about is a value a human should see, not one to guess at.
 */
export function coerceToExpected(value: unknown, expected: ExpectedType): unknown {
  if (value === null || value === undefined) return undefined;

  switch (expected) {
    case 'number': {
      if (typeof value === 'number') return undefined;
      if (typeof value === 'boolean') return undefined; // `true` is not 1 here
      if (typeof value !== 'string') return undefined;
      const text = value.trim();
      // An empty string is the old system's "not set", and 0 is a real
      // threshold — turning one into the other would be a silent change of
      // meaning, so it stays invalid and someone decides.
      if (text === '' || !NUMERIC.test(text)) return undefined;
      const parsed = Number(text);
      return Number.isFinite(parsed) ? parsed : undefined;
    }

    case 'bigint': {
      if (typeof value !== 'string') return undefined;
      const text = value.trim();
      if (text === '' || !/^-?\d+$/.test(text)) return undefined;
      try {
        return BigInt(text);
      } catch {
        return undefined;
      }
    }

    case 'boolean': {
      if (typeof value === 'boolean') return undefined;
      if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : undefined;
      if (typeof value !== 'string') return undefined;
      // Only the two spellings CRMEB actually wrote. Anything else is a
      // guess, and a wrongly-guessed boolean turns a feature on.
      const text = value.trim();
      if (text === '1') return true;
      if (text === '0') return false;
      return undefined;
    }

    case 'string': {
      if (typeof value === 'string') return undefined;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return undefined;
    }

    default:
      return undefined;
  }
}

/** Whether a zod issue's `expected` is a primitive this module can convert. */
export function isCoercibleType(expected: unknown): expected is ExpectedType {
  return (
    expected === 'number' ||
    expected === 'boolean' ||
    expected === 'string' ||
    expected === 'bigint'
  );
}
