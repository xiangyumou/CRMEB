import { describe, expect, it } from 'vitest';

import { UnknownEnumValueError, enumTable, legacyBoolean } from './enums';

const productKind = enumTable('eb_store_product', 'virtual_type', {
  0: 'physical',
  1: 'virtual_card',
  2: 'virtual_coupon',
  3: 'virtual_manual',
});

describe('enumTable', () => {
  it('maps the values it declares', () => {
    expect(productKind(0)).toBe('physical');
    expect(productKind(2)).toBe('virtual_coupon');
  });

  it('accepts the string mysql2 hands back for a tinyint', () => {
    expect(productKind('1')).toBe('virtual_card');
  });

  it('throws on an unknown value instead of picking a plausible default', () => {
    // The whole reason this is a table and not a switch with a `default`.
    expect(() => productKind(9)).toThrow(UnknownEnumValueError);
  });

  it('names the table, the column and the value it could not map', () => {
    expect(() => productKind(9)).toThrow(/eb_store_product\.virtual_type/);
    expect(() => productKind(9)).toThrow(/9/);
  });

  it('lists the values it does know, so the fix is obvious', () => {
    expect(() => productKind(9)).toThrow(/0, 1, 2, 3/);
    expect(productKind.known).toEqual(['0', '1', '2', '3']);
  });

  it('throws on NULL unless a null case is declared', () => {
    expect(() => productKind(null)).toThrow(UnknownEnumValueError);
    const withNull = enumTable('t', 'c', { null: null, 1: 'one' });
    expect(withNull(null)).toBeNull();
    expect(withNull(undefined)).toBeNull();
  });

  it('does not answer for inherited object keys', () => {
    // `String(value)` could be 'toString' or 'constructor' if a legacy column
    // held text; `Object.hasOwn` is what keeps those from resolving.
    expect(() => productKind('constructor')).toThrow(UnknownEnumValueError);
    expect(() => productKind('toString')).toThrow(UnknownEnumValueError);
  });
});

describe('legacyBoolean', () => {
  it('reads the two values a tinyint(1) is allowed to hold', () => {
    expect(legacyBoolean('t', 'is_show', 1)).toBe(true);
    expect(legacyBoolean('t', 'is_show', '0')).toBe(false);
    expect(legacyBoolean('t', 'is_show', true)).toBe(true);
  });

  it('reads NULL as false — the legacy default for every such column', () => {
    expect(legacyBoolean('t', 'is_show', null)).toBe(false);
  });

  it('refuses a third value rather than guessing which side it falls on', () => {
    expect(() => legacyBoolean('t', 'is_show', 2)).toThrow(UnknownEnumValueError);
    expect(() => legacyBoolean('t', 'is_show', -1)).toThrow(UnknownEnumValueError);
  });
});
