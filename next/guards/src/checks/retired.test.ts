import { describe, expect, it } from 'vitest';
import { retiredFeatures } from './retired';

/**
 * CORE-002 in `docs/rewrite/invariants.md`.
 *
 * Legacy asserted "the removed routes answer 404". The rewrite cannot answer
 * anything on a URL that has no route file, so the 404 is not the property
 * worth testing — what can still go wrong is a retired feature coming *back*:
 * an identifier, a column mapping or a URL token that reintroduces 砍价, 秒杀,
 * 分销, 积分 or the rest. That is what this asserts, on every commit, over the
 * whole of `next/` and the uni-app API layer.
 */

const findings = (await retiredFeatures.run()).findings;

describe('the retired blacklist', () => {
  it('finds no retired identifier in next/ or the uni-app API layer', () => {
    const failures = findings.filter((f) => f.level === 'fail');
    expect(failures.map((f) => `${f.where}: ${f.message}`).join('\n')).toBe('');
  });
});
