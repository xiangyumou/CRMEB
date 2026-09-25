import { describe, expect, it } from 'vitest';
import { shopDateTime, shopDay } from './shop-time';

describe('the shop’s clock for exports', () => {
  it('prints Shanghai wall time, not UTC', () => {
    expect(shopDateTime(new Date('2026-02-03T16:30:05.999Z'))).toBe('2026-02-04 00:30:05');
    expect(shopDateTime(new Date('2026-02-03T01:02:03Z'))).toBe('2026-02-03 09:02:03');
  });

  it('dates a file on the Shanghai day', () => {
    expect(shopDay(new Date('2026-02-03T16:00:00Z'))).toBe('2026-02-04');
    expect(shopDay(new Date('2026-02-03T15:59:59Z'))).toBe('2026-02-03');
  });
});
