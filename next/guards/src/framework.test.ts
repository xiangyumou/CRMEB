import { describe, expect, it } from 'vitest';

import { count, note, pending, result, settle } from './framework';

describe('settle', () => {
  const check = result('x', 'x', 'x', [
    pending('a', 'H3', 'owed by a stream in flight'),
    pending('b', 'E3', 'owed by a stream that has merged'),
    note('c', 'context'),
  ]);
  const merged = (stream: string): boolean => stream === 'E3';

  it('turns a pending finding into a failure once its stream has merged', () => {
    const settled = settle(check, merged);
    expect(count(settled.findings, 'fail')).toBe(1);
    expect(settled.findings[1]).toMatchObject({
      level: 'fail',
      where: 'b',
      message: 'owed by a stream that has merged — owed by E3, which has merged',
    });
  });

  it('leaves in-flight pending findings and notes alone', () => {
    const settled = settle(check, merged);
    expect(settled.findings[0]).toEqual(check.findings[0]);
    expect(settled.findings[2]).toEqual(check.findings[2]);
    expect(count(settled.findings, 'pending')).toBe(1);
  });
});
