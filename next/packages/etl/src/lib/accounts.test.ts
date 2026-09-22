import { describe, expect, it } from 'vitest';

import {
  AccountCollisionError,
  assertNoAccountCollisions,
  findAccountCollisions,
} from './accounts';

describe('findAccountCollisions', () => {
  it('finds nothing when every account is distinct case-insensitively', () => {
    expect(
      findAccountCollisions([
        { id: 1, account: 'admin' },
        { id: 2, account: 'shop' },
      ]),
    ).toEqual([]);
  });

  it('catches the collision PostgreSQL would only report one row of', () => {
    const collisions = findAccountCollisions([
      { id: 1, account: 'Admin' },
      { id: 2, account: 'admin' },
      { id: 3, account: 'other' },
    ]);
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.key).toBe('admin');
    expect(collisions[0]?.rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it('collapses surrounding whitespace, which the new index also would', () => {
    const collisions = findAccountCollisions([
      { id: 1, account: 'admin ' },
      { id: 2, account: ' ADMIN' },
    ]);
    expect(collisions).toHaveLength(1);
  });

  it('reports blank accounts as one group instead of letting the load fail', () => {
    const collisions = findAccountCollisions([
      { id: 1, account: '' },
      { id: 2, account: '   ' },
    ]);
    expect(collisions[0]?.key).toBe('');
  });
});

describe('assertNoAccountCollisions', () => {
  it('stays quiet on clean input', () => {
    expect(() =>
      assertNoAccountCollisions('后台账号', [{ id: 1, account: 'admin' }]),
    ).not.toThrow();
  });

  it('throws before any row is written, naming every colliding pair', () => {
    let thrown: unknown;
    try {
      assertNoAccountCollisions('后台账号', [
        { id: 1, account: 'Admin' },
        { id: 2, account: 'admin' },
      ]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AccountCollisionError);
    const message = (thrown as Error).message;
    expect(message).toContain('后台账号');
    expect(message).toContain('#1 Admin');
    expect(message).toContain('#2 admin');
  });
});
