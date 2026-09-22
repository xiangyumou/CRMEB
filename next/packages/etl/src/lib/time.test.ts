import { describe, expect, it } from 'vitest';

import {
  LEGACY_UTC_OFFSET_MINUTES,
  LegacyTimeError,
  fromEpochSeconds,
  fromEpochSecondsOr,
  fromLegacyDate,
  fromLegacyDateTime,
} from './time';

describe('fromEpochSeconds', () => {
  it('turns legacy unix seconds into the same absolute instant', () => {
    // 2024-06-01 12:00:00 +08:00 == 2024-06-01T04:00:00Z
    expect(fromEpochSeconds(1_717_214_400)?.toISOString()).toBe('2024-06-01T04:00:00.000Z');
  });

  it('reads 0 as NULL rather than as 1970 — the whole point of this function', () => {
    expect(fromEpochSeconds(0)).toBeNull();
    expect(fromEpochSeconds(null)).toBeNull();
    expect(fromEpochSeconds(undefined)).toBeNull();
    expect(fromEpochSeconds('')).toBeNull();
  });

  it('accepts the string mysql2 hands back for a bigint column', () => {
    expect(fromEpochSeconds('1717214400')?.toISOString()).toBe('2024-06-01T04:00:00.000Z');
  });

  it('refuses a value outside a plausible window instead of writing 1970', () => {
    // A legacy column that actually held a row id, a price in fen, or a count.
    expect(() => fromEpochSeconds(42)).toThrow(LegacyTimeError);
    expect(() => fromEpochSeconds(99_999_999_999)).toThrow(LegacyTimeError);
  });

  it('refuses a negative timestamp', () => {
    expect(() => fromEpochSeconds(-1)).toThrow(/负数/);
  });

  it('refuses something that is not a number at all', () => {
    expect(() => fromEpochSeconds('昨天')).toThrow(LegacyTimeError);
  });
});

describe('fromEpochSecondsOr', () => {
  it('falls back for an unset or unusable value, never to the epoch', () => {
    const fallback = new Date('2026-09-23T00:00:00Z');
    expect(fromEpochSecondsOr(0, fallback)).toBe(fallback);
    expect(fromEpochSecondsOr(42, fallback)).toBe(fallback);
    expect(fromEpochSecondsOr(1_717_214_400, fallback)?.toISOString()).toBe(
      '2024-06-01T04:00:00.000Z',
    );
  });
});

describe('fromLegacyDateTime', () => {
  it('reads a bare datetime string as Shanghai wall-clock time', () => {
    expect(fromLegacyDateTime('2024-06-01 12:00:00')?.toISOString()).toBe(
      '2024-06-01T04:00:00.000Z',
    );
  });

  it('offsets by exactly the +08:00 the old PHP process ran with', () => {
    const shanghai = fromLegacyDateTime('2024-01-01 00:00:00');
    expect(shanghai?.getTime()).toBe(Date.UTC(2024, 0, 1) - LEGACY_UTC_OFFSET_MINUTES * 60_000);
  });

  it('reads MySQL zero dates as NULL', () => {
    expect(fromLegacyDateTime('0000-00-00 00:00:00')).toBeNull();
    expect(fromLegacyDateTime('0000-00-00')).toBeNull();
    expect(fromLegacyDateTime('')).toBeNull();
    expect(fromLegacyDateTime(null)).toBeNull();
  });

  it('passes a Date through — mysql2 already resolved it against the pinned zone', () => {
    const date = new Date('2024-06-01T04:00:00Z');
    expect(fromLegacyDateTime(date)).toBe(date);
  });

  it('refuses a string that is not a datetime', () => {
    expect(() => fromLegacyDateTime('n/a')).toThrow(LegacyTimeError);
  });
});

describe('fromLegacyDate', () => {
  it('makes a birthday midnight in Shanghai, not midnight UTC', () => {
    // Midnight UTC would render as the previous evening for every Chinese user.
    expect(fromLegacyDate('2001-05-04')?.toISOString()).toBe('2001-05-03T16:00:00.000Z');
  });

  it('reads the zero date as NULL', () => {
    expect(fromLegacyDate('0000-00-00')).toBeNull();
  });
});
