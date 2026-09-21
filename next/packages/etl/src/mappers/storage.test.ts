import { describe, expect, it } from 'vitest';
import {
  kindOf,
  mapStorage,
  mimeOf,
  sizeOf,
  storageKeyOf,
  type LegacyAttachment,
  type LegacyAttachmentCategory,
} from './storage';

/** Copied out of `crmeb/public/install/crmeb.sql`. */
const ROW: LegacyAttachment = {
  att_id: 3,
  name: '955c6bb44d8e002164bcbc2e7b3b6ea5.png',
  att_dir: '/uploads/attach/2023/02/20230210/955c6bb44d8e002164bcbc2e7b3b6ea5.png',
  satt_dir: '/uploads/attach/2023/02/20230210/955c6bb44d8e002164bcbc2e7b3b6ea5.png',
  att_size: '0',
  // The dump really does say `image/jpeg` for a `.png` file.
  att_type: 'image/jpeg',
  pid: 6,
  time: 1676022812,
  image_type: 1,
  module_type: 1,
  real_name: 'crmeb.png',
  type: 0,
};

const CATEGORIES: LegacyAttachmentCategory[] = [
  { id: 1, pid: 0, name: '分类图标', enname: '', type: 0 },
  { id: 3, pid: 0, name: '商品图', enname: '', type: 0 },
  { id: 6, pid: 3, name: '详情页', enname: '', type: 0 },
];

describe('categories', () => {
  it('materialises the ancestor path the new schema indexes', () => {
    const out = mapStorage({ categories: CATEGORIES });
    expect(out.categories).toEqual([
      { id: 1, parentId: null, name: '分类图标', path: '/', sortOrder: 0 },
      { id: 3, parentId: null, name: '商品图', path: '/', sortOrder: 0 },
      { id: 6, parentId: 3, name: '详情页', path: '/3/', sortOrder: 0 },
    ]);
  });

  it('treats an orphan as a root instead of losing the folder', () => {
    const out = mapStorage({
      categories: [{ id: 9, pid: 404, name: '孤儿', enname: '', type: 0 }],
    });
    expect(out.categories[0]).toMatchObject({ parentId: null, path: '/' });
  });

  it('drops a cycle rather than recursing forever', () => {
    // The legacy table has no foreign key, so `a → b → a` is storable.
    const out = mapStorage({
      categories: [
        { id: 1, pid: 2, name: 'a', enname: '', type: 0 },
        { id: 2, pid: 1, name: 'b', enname: '', type: 0 },
      ],
    });
    expect(out.report.categoriesDroppedCycle).toBeGreaterThan(0);
  });
});

describe('attachments', () => {
  it('migrates a stock row, trusting the extension over att_type', () => {
    const out = mapStorage({ categories: CATEGORIES, attachments: [ROW] });
    expect(out.attachments[0]).toMatchObject({
      id: 3,
      categoryId: 6,
      storageKey: 'uploads/attach/2023/02/20230210/955c6bb44d8e002164bcbc2e7b3b6ea5.png',
      driver: 'local',
      // `att_type` says image/jpeg; the file is a .png. The path wins.
      mime: 'image/png',
      kind: 'image',
      originalName: 'crmeb.png',
      // Same value as `att_dir`, so there is no separate thumbnail.
      thumbnailUrl: null,
      createdAt: new Date(1676022812 * 1000),
    });
  });

  it('never invents a sha256', () => {
    // The column is the dedupe key with a `^[0-9a-f]{64}$` check. A placeholder
    // would disable dedupe for every migrated file, permanently and silently.
    const out = mapStorage({ attachments: [ROW] });
    expect(out.attachments[0]?.sha256).toBeNull();
    expect(out.report.needsDigest).toBe(1);
  });

  it('files a row uncategorised when pid is a legacy enumeration, not a folder', () => {
    // `pid` in `eb_system_attachment` is documented as "0编辑器,1商品图片,…",
    // which collides with real category ids. Guessing would scatter files into
    // whichever folder happens to share the number.
    const out = mapStorage({ categories: CATEGORIES, attachments: [{ ...ROW, pid: 42 }] });
    expect(out.attachments[0]?.categoryId).toBeNull();
    expect(out.report.attachmentsUncategorised).toBe(1);
  });

  it('folds every cloud vendor onto the one s3 driver', () => {
    const out = mapStorage({
      attachments: [2, 3, 4].map((imageType, index) => ({
        ...ROW,
        att_id: 100 + index,
        att_dir: `https://cdn.example.com/a/${index}.jpg`,
        image_type: imageType,
      })),
    });
    expect(out.attachments.every((row) => row.driver === 's3')).toBe(true);
    expect(out.report.attachmentsOnRemoteDriver).toBe(3);
    // An absolute URL becomes the object key inside the bucket.
    expect(out.attachments[0]?.storageKey).toBe('a/0.jpg');
  });

  it('drops the second row sharing a path, which the unique index would reject', () => {
    const out = mapStorage({ attachments: [ROW, { ...ROW, att_id: 4 }] });
    expect(out.attachments).toHaveLength(1);
    expect(out.report.duplicateStorageKeys).toHaveLength(1);
  });

  it('drops a row with no path at all', () => {
    const out = mapStorage({ attachments: [{ ...ROW, att_dir: '  ' }] });
    expect(out.attachments).toEqual([]);
    expect(out.report.attachmentsDroppedNoPath).toBe(1);
  });

  it('keeps a real thumbnail and discards a duplicated one', () => {
    const out = mapStorage({
      attachments: [{ ...ROW, satt_dir: '/uploads/attach/thumb/955c.png' }],
    });
    expect(out.attachments[0]?.thumbnailUrl).toBe('/uploads/attach/thumb/955c.png');
  });
});

describe('field helpers', () => {
  it('reads the sizes the legacy column actually holds', () => {
    expect(sizeOf('48213')).toBe(48213);
    expect(sizeOf('47.1kb')).toBe(48230);
    expect(sizeOf('1.5 MB')).toBe(1572864);
    expect(sizeOf('')).toBe(0);
    expect(sizeOf('大概挺大的')).toBe(0);
  });

  it('classifies a file by mime, falling back to the legacy type flag', () => {
    expect(kindOf('image/png', 0)).toBe('image');
    expect(kindOf('video/mp4', 0)).toBe('video');
    expect(kindOf('application/octet-stream', 1)).toBe('video');
    expect(kindOf('application/pdf', 0)).toBe('file');
  });

  it('strips the leading slash and the host from a path', () => {
    expect(storageKeyOf('/uploads/a.png')).toBe('uploads/a.png');
    expect(storageKeyOf('https://cdn.example.com/uploads/a.png?v=2')).toBe('uploads/a.png');
    expect(storageKeyOf('uploads/a.png')).toBe('uploads/a.png');
  });

  it('falls back to the declared type when the path has no extension', () => {
    expect(mimeOf('png', '/uploads/no-extension')).toBe('image/png');
    expect(mimeOf('image/webp', '/uploads/no-extension')).toBe('image/webp');
    expect(mimeOf('', '/uploads/no-extension')).toBe('application/octet-stream');
  });
});
