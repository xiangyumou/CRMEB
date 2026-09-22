import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { storageKeyOf as mapperStorageKeyOf } from '../mappers/storage';
import { localFilePath, localPublicUrl, storageKeyOf } from './storage-keys';

describe('storageKeyOf', () => {
  it('strips the leading slash of a site-relative path', () => {
    expect(storageKeyOf('/uploads/attach/2024/06/a.png')).toBe('uploads/attach/2024/06/a.png');
  });

  it('leaves a path that is already relative alone', () => {
    expect(storageKeyOf('uploads/attach/2024/06/a.png')).toBe('uploads/attach/2024/06/a.png');
  });

  it('takes the object key out of an absolute CDN url', () => {
    expect(storageKeyOf('https://cdn.example.com/attach/2024/06/a.png')).toBe(
      'attach/2024/06/a.png',
    );
  });

  it('never invents a key from the filename — the bytes must stay where they are', () => {
    expect(storageKeyOf('/uploads/attach/2024/06/奇怪的 名字.png')).toBe(
      'uploads/attach/2024/06/奇怪的 名字.png',
    );
  });
});

describe('the mapper and the lib agree on every key', () => {
  // `mappers/storage.ts` belongs to F1 and has its own copy of this rule. If
  // the two ever disagree, the migration writes keys the uploader cannot
  // resolve and every product image 404s after the cutover.
  const cases = [
    '/uploads/attach/2024/06/a.png',
    'uploads/attach/2024/06/a.png',
    'https://cdn.example.com/attach/2024/06/a.png',
    'http://cdn.example.com/a.png?v=2',
    '//malformed',
    'attach/2024/06/中文.png',
  ];
  for (const input of cases) {
    it(`agrees on ${input}`, () => {
      expect(storageKeyOf(input)).toBe(mapperStorageKeyOf(input));
    });
  }
});

describe('localFilePath', () => {
  const root = '/data/uploads';

  it('drops the uploads/ prefix, because the volume is that subtree', () => {
    expect(localFilePath(root, 'uploads/attach/a.png')).toBe(
      path.resolve('/data/uploads/attach/a.png'),
    );
  });

  it('resolves a key that has no uploads/ prefix under the root as it stands', () => {
    expect(localFilePath(root, 'attach/a.png')).toBe(path.resolve('/data/uploads/attach/a.png'));
  });

  it('refuses a key that escapes the uploads root', () => {
    // A `..` in a stored path is corruption or an old traversal bug; hashing
    // whatever it resolves to would read a file outside the uploads tree.
    expect(localFilePath(root, '../../etc/passwd')).toBeNull();
    expect(localFilePath(root, 'uploads/../../etc/passwd')).toBeNull();
  });

  it('refuses an empty key and a key with a NUL byte', () => {
    expect(localFilePath(root, 'uploads/')).toBeNull();
    expect(localFilePath(root, 'a\0b')).toBeNull();
  });
});

describe('localPublicUrl', () => {
  it('serves the key under the edge prefix', () => {
    expect(localPublicUrl('/uploads', 'uploads/attach/a.png')).toBe('/uploads/attach/a.png');
    expect(localPublicUrl('/uploads/', 'attach/a.png')).toBe('/uploads/attach/a.png');
  });
});
