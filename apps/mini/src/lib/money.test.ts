import { describe, expect, it } from 'vitest';
import { fromCents, toCents } from './money';

describe('money', () => {
  it('does money in cents', () => {
    expect(toCents('12.3')).toBe(1230);
    expect(toCents('0.07')).toBe(7);
    expect(toCents('199')).toBe(19900);
    expect(toCents('-1.50')).toBe(-150);
    expect(fromCents(905)).toBe('9.05');
    expect(fromCents(0)).toBe('0.00');
    expect(fromCents(-150)).toBe('-1.50');
  });
});
