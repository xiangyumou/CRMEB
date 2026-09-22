import { describe, expect, it } from 'vitest';

import { UnknownPasswordHashError, classifyPasswordHash, countLegacyHashes } from './passwords';

// Synthetic hashes. The bcrypt one is a well-formed shape, not a hash of any
// real password, and no fixture in this repo holds a production credential.
const BCRYPT = '$2y$10$abcdefghijklmnopqrstuuMB1NOe2Z1lVjYlLhCzs8eUgcL2eHKab';
const MD5 = '0cc175b9c0f1b6a831c399e269772661';

describe('classifyPasswordHash', () => {
  it('labels a bcrypt hash bcrypt and carries it unchanged', () => {
    expect(classifyPasswordHash('admin#1', BCRYPT)).toEqual({
      passwordHash: BCRYPT,
      passwordAlgo: 'bcrypt',
    });
  });

  it('labels an MD5 hash md5_legacy rather than pretending it is bcrypt', () => {
    // ETL-F1-001: relabelling breaks every future login AND hides the fact
    // that the shop still holds unsalted MD5s.
    expect(classifyPasswordHash('admin#2', MD5)).toEqual({
      passwordHash: MD5,
      passwordAlgo: 'md5_legacy',
    });
  });

  it('accepts every bcrypt prefix PHP has ever written', () => {
    for (const prefix of ['$2a$', '$2b$', '$2y$']) {
      const hash = prefix + BCRYPT.slice(4);
      expect(classifyPasswordHash('x', hash)?.passwordAlgo).toBe('bcrypt');
    }
  });

  it('lower-cases an upper-case MD5 so the column has one spelling', () => {
    expect(classifyPasswordHash('x', MD5.toUpperCase())?.passwordHash).toBe(MD5);
  });

  it('reads an empty hash as "no password", never as a hash of the empty string', () => {
    expect(classifyPasswordHash('x', '')).toBeNull();
    expect(classifyPasswordHash('x', '   ')).toBeNull();
    expect(classifyPasswordHash('x', null)).toBeNull();
    expect(classifyPasswordHash('x', undefined)).toBeNull();
  });

  it('refuses a hash whose algorithm it cannot name', () => {
    expect(() => classifyPasswordHash('x', 'plaintext-password')).toThrow(UnknownPasswordHashError);
    // 31 hex characters: an MD5 that lost a character somewhere.
    expect(() => classifyPasswordHash('x', MD5.slice(1))).toThrow(UnknownPasswordHashError);
    // A bcrypt hash truncated by the old varchar(32) column.
    expect(() => classifyPasswordHash('x', BCRYPT.slice(0, 32))).toThrow(UnknownPasswordHashError);
  });

  it('never puts the hash itself in the error message', () => {
    let message = '';
    try {
      classifyPasswordHash('admin#7', 'plaintext-password');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain('plaintext-password');
    expect(message).toContain('admin#7');
  });
});

describe('countLegacyHashes', () => {
  it('counts the accounts that will re-hash on first login', () => {
    expect(
      countLegacyHashes([
        { passwordAlgo: 'bcrypt' },
        { passwordAlgo: 'md5_legacy' },
        { passwordAlgo: 'md5_legacy' },
      ]),
    ).toBe(2);
  });
});
