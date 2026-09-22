import { describe, expect, it } from 'vitest';
import { extractCalls, normaliseUrl, pendingByLine } from './uniapp';

/**
 * The marker algebra is the one piece of the uni-app guard that can be wrong in
 * a way nobody notices: get it wrong in the lenient direction and 104 calls go
 * unchecked, get it wrong in the strict direction and the guard cries on a file
 * that is fine. It is pure, so it is tested here rather than against the repo.
 */

const lines = (text: string): string[] => text.trimStart().split('\n');

describe('normaliseUrl', () => {
  it('turns an interpolation into :param', () => {
    expect(normaliseUrl('/api/v1/orders/${id}/cancel')).toBe('/api/v1/orders/:param/cancel');
  });

  it('matches nested braces by hand', () => {
    expect(normaliseUrl('/api/v1/users/${(data || {}).id}/coupons')).toBe(
      '/api/v1/users/:param/coupons',
    );
  });

  it('leaves a plain URL alone', () => {
    expect(normaliseUrl('/api/v1/cart')).toBe('/api/v1/cart');
  });
});

describe('pendingByLine', () => {
  it('covers every line below a marker', () => {
    const source = lines(`
// CONTRACT-PENDING(E1)
export function a() {}
export function b() {}
`);
    // Including the trailing blank line: only a divider or another marker ends
    // a marker's reach, never the end of a paragraph.
    expect(pendingByLine(source)).toEqual(['E1', 'E1', 'E1', 'E1']);
  });

  it('does not let the marker’s own comment block cancel it', () => {
    // The divider belongs to the marker's block: it closes the explanation, not
    // the marker. Treating the block as the unit is the whole point.
    const source = lines(`
// CONTRACT-PENDING(D)
// 拼团 — waits on stream D.
// ----------------------------------------------------------------
export function groupBuy() {}
`);
    expect(pendingByLine(source).at(-2)).toBe('D');
  });

  it('a later divider in its own block ends the marker', () => {
    const source = lines(`
// CONTRACT-PENDING(D)
export function inside() {}

// ----------------------------------------------------------------
export function outside() {}
`);
    const active = pendingByLine(source);
    expect(active[1]).toBe('D');
    expect(active.at(-2)).toBeNull();
  });

  it('a second marker replaces the first without a divider', () => {
    const source = lines(`
// CONTRACT-PENDING(D)
export function first() {}
// CONTRACT-PENDING(F2)
export function second() {}
`);
    const active = pendingByLine(source);
    expect(active[1]).toBe('D');
    expect(active[3]).toBe('F2');
  });

  it('leaves code above the first marker unmarked', () => {
    const source = lines(`
export function early() {}
// CONTRACT-PENDING(S)
export function late() {}
`);
    const active = pendingByLine(source);
    expect(active[0]).toBeNull();
    expect(active[2]).toBe('S');
  });
});

describe('extractCalls', () => {
  it('reads the verb, the normalised URL and the marker in force', () => {
    const source = `
export function cart() {
  return request.get('/api/v1/cart');
}

// CONTRACT-PENDING(D)
export function joinGroup(id) {
  return request.post(\`/api/v1/group-buys/\${id}/join\`, {});
}
`;
    expect(extractCalls('api/x.js', source)).toEqual([
      { file: 'api/x.js', line: 3, method: 'GET', url: '/api/v1/cart', pending: null },
      {
        file: 'api/x.js',
        line: 8,
        method: 'POST',
        url: '/api/v1/group-buys/:param/join',
        pending: 'D',
      },
    ]);
  });

  it('is not confused by a second call in the same file', () => {
    const source = [
      "export const a = () => request.delete('/api/v1/addresses/1');",
      "export const b = () => request.put('/api/v1/addresses/1');",
    ].join('\n');
    expect(extractCalls('api/y.js', source).map((c) => c.method)).toEqual(['DELETE', 'PUT']);
  });
});
