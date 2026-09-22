import { describe, expect, it } from 'vitest';

import { LegacyMoneyError, decimalString, decimalStringOrZero, sumDecimalStrings } from './money';

describe('decimalString', () => {
  it('carries the string mysql2 produces through unchanged in value', () => {
    expect(decimalString('19.90')).toBe('19.90');
    expect(decimalString('1234567.89')).toBe('1234567.89');
  });

  it('pads and trims to the column scale', () => {
    expect(decimalString('5')).toBe('5.00');
    expect(decimalString('5.1')).toBe('5.10');
    expect(decimalString('5.100')).toBe('5.10');
  });

  it('strips leading zeros without losing the value', () => {
    expect(decimalString('007.50')).toBe('7.50');
    expect(decimalString('0.00')).toBe('0.00');
  });

  it('reads an unset money column as NULL', () => {
    expect(decimalString(null)).toBeNull();
    expect(decimalString(undefined)).toBeNull();
    expect(decimalString('')).toBeNull();
  });

  it('accepts a JS number only when it really fits decimal(8,2)', () => {
    expect(decimalString(19.9)).toBe('19.90');
    expect(decimalString(0)).toBe('0.00');
  });

  it('refuses a float carrying more precision than the column ever could', () => {
    // 0.1 + 0.2 — the exact failure this module exists to stop.
    expect(() => decimalString(0.1 + 0.2)).toThrow(LegacyMoneyError);
    expect(() => decimalString(Number.NaN)).toThrow(LegacyMoneyError);
  });

  it('refuses to silently round a non-zero third decimal', () => {
    expect(() => decimalString('1.005')).toThrow(/小数位/);
    // …but a trailing zero is not a loss.
    expect(decimalString('1.500')).toBe('1.50');
  });

  it('refuses text that is not a decimal', () => {
    expect(() => decimalString('￥19.90')).toThrow(LegacyMoneyError);
    expect(() => decimalString('1e3')).toThrow(LegacyMoneyError);
  });

  it('keeps a negative amount negative, and does not invent -0.00', () => {
    expect(decimalString('-3.50')).toBe('-3.50');
    expect(decimalString('-0.00')).toBe('0.00');
  });
});

describe('decimalStringOrZero', () => {
  it('fills a NOT NULL money column with a real zero', () => {
    expect(decimalStringOrZero(null)).toBe('0.00');
    expect(decimalStringOrZero('7')).toBe('7.00');
  });
});

describe('sumDecimalStrings', () => {
  it('adds money in integer arithmetic, so the verification total is exact', () => {
    // 0.1 + 0.2 in floating point is 0.30000000000000004.
    expect(sumDecimalStrings(['0.10', '0.20'])).toBe('0.30');
    expect(sumDecimalStrings(['19.99', '0.01', '1000.00'])).toBe('1020.00');
  });

  it('skips NULLs rather than counting them as zero-shaped rows', () => {
    expect(sumDecimalStrings(['5.00', null, '5.00'])).toBe('10.00');
  });

  it('handles a negative total', () => {
    expect(sumDecimalStrings(['5.00', '-7.25'])).toBe('-2.25');
  });

  it('stays exact over many rows, where a float would drift', () => {
    const rows = Array.from({ length: 1000 }, () => '0.07');
    expect(sumDecimalStrings(rows)).toBe('70.00');
  });
});
