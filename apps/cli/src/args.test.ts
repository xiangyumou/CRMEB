import { describe, expect, it } from 'vitest';
import { normaliseOrigin, parseBody, parsePairs, UsageError } from './args';

describe('parsePairs', () => {
  it('turns k=v into an object and a repeated key into an array', () => {
    expect(parsePairs(['id=3', 'tag=a', 'tag=b', 'note=a=b'], '--query')).toEqual({
      id: '3',
      tag: ['a', 'b'],
      note: 'a=b',
    });
  });

  it('refuses a pair without a key', () => {
    expect(() => parsePairs(['=3'], '--param')).toThrow(UsageError);
    expect(() => parsePairs(['id'], '--param')).toThrow(UsageError);
  });

  it('is empty when the flag was not given', () => {
    expect(parsePairs(undefined, '--param')).toEqual({});
  });
});

describe('parseBody', () => {
  const read = (source: string) => Promise.resolve(source === 'b.json' ? '{"from":"file"}' : '');

  it('reads inline JSON, a file after @, or nothing', async () => {
    await expect(parseBody('{"name":"茶"}', read)).resolves.toEqual({ name: '茶' });
    await expect(parseBody('@b.json', read)).resolves.toEqual({ from: 'file' });
    await expect(parseBody(undefined, read)).resolves.toBeUndefined();
  });

  it('says so when it is not JSON', async () => {
    await expect(parseBody('{name:', read)).rejects.toThrow(/不是合法的 JSON/);
  });
});

describe('normaliseOrigin', () => {
  it('keeps only the origin', () => {
    expect(normaliseOrigin('https://x-zoo.vip/admin/')).toBe('https://x-zoo.vip');
  });

  it('refuses what is not http(s)', () => {
    expect(() => normaliseOrigin('ftp://x-zoo.vip')).toThrow(UsageError);
    expect(() => normaliseOrigin('x-zoo.vip')).toThrow(UsageError);
  });
});
