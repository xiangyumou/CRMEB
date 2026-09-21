/**
 * `eb_system_attachment` / `eb_system_attachment_category` → the media library.
 *
 * A pure function: rows in, rows and a report out.
 *
 * Two things are worth reading before trusting the output.
 *
 * **`sha256` is not invented.** The new `attachments.sha256` is the dedupe key
 * and carries a `^[0-9a-f]{64}$` check; the legacy table has no digest. A
 * placeholder would be a lie that silently disables dedupe forever, so this
 * mapper emits `sha256: null` and counts the rows in `needsDigest`. The runner
 * computes the real digest while it copies each file, which it has to read
 * anyway.
 *
 * **The legacy `pid` is not a category id.** In `eb_system_attachment`, `pid`
 * is documented as "分类ID 0编辑器,1商品图片,…" — a fixed enumeration that
 * predates `eb_system_attachment_category` and collides with its ids. Rows
 * whose `pid` matches a real category are filed there; the rest land
 * uncategorised rather than in whichever folder happens to share the number.
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_system_attachment`. */
export interface LegacyAttachment {
  att_id: number;
  name: string;
  /** Path or absolute URL of the stored file. */
  att_dir: string;
  /** Thumbnail path; often the same as `att_dir`. */
  satt_dir: string;
  /** Bytes, as a string, sometimes with a unit suffix. */
  att_size: string;
  /** Extension or mime fragment, e.g. `png`, `image/png`. */
  att_type: string;
  pid: number;
  time: number;
  /** 1 本地, 2 七牛云, 3 OSS, 4 COS. */
  image_type: number;
  /** 1 后台上传, 2 用户生成. */
  module_type: number;
  real_name: string;
  /** 0 图片, 1 视频. */
  type: number;
}

/** `eb_system_attachment_category`. */
export interface LegacyAttachmentCategory {
  id: number;
  pid: number;
  name: string;
  enname: string;
  type: number;
}

// ---------------------------------------------------------------------------
// output row shapes
// ---------------------------------------------------------------------------

export type AttachmentDriver = 'local' | 's3';
export type AttachmentKind = 'image' | 'video' | 'audio' | 'file';

export interface AttachmentCategoryRow {
  id: number;
  parentId: number | null;
  name: string;
  /** Materialised ancestor path, `/1/7/`. Root categories have `/`. */
  path: string;
  sortOrder: number;
}

export interface AttachmentRow {
  id: number;
  categoryId: number | null;
  storageKey: string;
  driver: AttachmentDriver;
  bucket: string | null;
  url: string;
  name: string;
  originalName: string | null;
  kind: AttachmentKind;
  mime: string;
  size: number;
  /** NULL: the runner fills it from the bytes. See the header. */
  sha256: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  thumbnailUrl: string | null;
  uploadedByAdminId: number | null;
  uploadedByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface StorageMigrationReport {
  categories: number;
  categoriesDroppedCycle: number;
  attachments: number;
  attachmentsDroppedNoPath: number;
  /** Rows filed uncategorised because `pid` matched no real category. */
  attachmentsUncategorised: number;
  /** Rows whose driver was a legacy cloud vendor and is now `s3`. */
  attachmentsOnRemoteDriver: number;
  /** Rows the runner must hash while copying. Always equals `attachments`. */
  needsDigest: number;
  /** Legacy paths seen more than once; the second and later rows are dropped. */
  duplicateStorageKeys: string[];
}

export interface StorageMigrationInput {
  categories?: readonly LegacyAttachmentCategory[];
  attachments?: readonly LegacyAttachment[];
}

export interface StorageMigrationOutput {
  categories: AttachmentCategoryRow[];
  attachments: AttachmentRow[];
  report: StorageMigrationReport;
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
  zip: 'application/zip',
};

/**
 * `att_type` is whatever the old uploader felt like storing: `png`,
 * `image/png`, `.PNG`, or empty. The extension of the path is the more
 * reliable signal, so it wins when the two disagree.
 */
export function mimeOf(attType: string, path: string): string {
  const fromPath = extensionOf(path);
  if (fromPath && MIME_BY_EXTENSION[fromPath]) return MIME_BY_EXTENSION[fromPath];
  const cleaned = attType.trim().toLowerCase().replace(/^\./, '');
  if (cleaned.includes('/')) return cleaned;
  if (MIME_BY_EXTENSION[cleaned]) return MIME_BY_EXTENSION[cleaned];
  return 'application/octet-stream';
}

function extensionOf(path: string): string {
  const withoutQuery = path.split('?')[0] ?? '';
  const dot = withoutQuery.lastIndexOf('.');
  if (dot < 0) return '';
  return withoutQuery.slice(dot + 1).toLowerCase();
}

export function kindOf(mime: string, legacyType: number): AttachmentKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  // `type = 1` meant 视频 before the mime was recorded at all.
  return legacyType === 1 ? 'video' : 'file';
}

/** `"48213"`, `"47.1kb"`, `""` → bytes. Anything unreadable is 0, not a guess. */
export function sizeOf(raw: string): number {
  const text = raw.trim().toLowerCase();
  const match = /^([\d.]+)\s*(b|kb|mb|gb)?$/.exec(text);
  if (!match) return 0;
  const value = Number.parseFloat(match[1] ?? '0');
  if (!Number.isFinite(value)) return 0;
  const unit = match[2] ?? 'b';
  const factor = unit === 'kb' ? 1024 : unit === 'mb' ? 1024 ** 2 : unit === 'gb' ? 1024 ** 3 : 1;
  return Math.round(value * factor);
}

/**
 * The storage key is the path with the site prefix removed — for a remote
 * driver, the object key inside the bucket. A key is never invented from the
 * filename: the file has to stay reachable at exactly the path it is at, or
 * every product image in the shop breaks.
 */
export function storageKeyOf(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    try {
      return new URL(path).pathname.replace(/^\/+/, '');
    } catch {
      return path.replace(/^\/+/, '');
    }
  }
  return path.replace(/^\/+/, '');
}

function driverOf(imageType: number): AttachmentDriver {
  // 1 本地; 2 七牛云, 3 OSS, 4 COS all become the one S3-compatible driver.
  return imageType === 1 ? 'local' : 's3';
}

export function mapStorage(input: StorageMigrationInput): StorageMigrationOutput {
  const categories: AttachmentCategoryRow[] = [];
  const attachments: AttachmentRow[] = [];
  const duplicateStorageKeys: string[] = [];

  let categoriesDroppedCycle = 0;
  let attachmentsDroppedNoPath = 0;
  let attachmentsUncategorised = 0;
  let attachmentsOnRemoteDriver = 0;

  // --- categories, parents before children so `path` can be materialised -----
  const legacyCategories = [...(input.categories ?? [])];
  const byId = new Map(legacyCategories.map((row) => [row.id, row]));
  const pathById = new Map<number, string>();

  const resolvePath = (row: LegacyAttachmentCategory, seen: Set<number>): string | null => {
    if (row.pid === 0) return '/';
    const cached = pathById.get(row.id);
    if (cached) return cached;
    if (seen.has(row.id)) return null; // a cycle: the legacy table has no FK
    seen.add(row.id);
    const parent = byId.get(row.pid);
    if (!parent) return '/'; // orphan: treat as a root rather than drop the folder
    const parentPath = resolvePath(parent, seen);
    if (parentPath === null) return null;
    return `${parentPath}${parent.id}/`;
  };

  for (const row of legacyCategories) {
    const path = resolvePath(row, new Set());
    if (path === null) {
      categoriesDroppedCycle += 1;
      continue;
    }
    pathById.set(row.id, path);
    categories.push({
      id: row.id,
      parentId: row.pid === 0 || !byId.has(row.pid) ? null : row.pid,
      name: row.name,
      path,
      sortOrder: 0,
    });
  }
  const keptCategoryIds = new Set(categories.map((row) => row.id));

  // --- attachments -----------------------------------------------------------
  const seenKeys = new Set<string>();
  for (const row of input.attachments ?? []) {
    const path = row.att_dir.trim();
    if (path === '') {
      attachmentsDroppedNoPath += 1;
      continue;
    }

    const storageKey = storageKeyOf(path);
    if (seenKeys.has(storageKey)) {
      // `attachments_storage_key_uq` would reject the second row. The library
      // showed the same file twice; now it shows it once.
      duplicateStorageKeys.push(storageKey);
      continue;
    }
    seenKeys.add(storageKey);

    const driver = driverOf(row.image_type);
    if (driver === 's3') attachmentsOnRemoteDriver += 1;

    const categoryId = keptCategoryIds.has(row.pid) ? row.pid : null;
    if (categoryId === null) attachmentsUncategorised += 1;

    const mime = mimeOf(row.att_type, path);
    const createdAt = row.time > 0 ? new Date(row.time * 1000) : new Date(0);
    const thumbnail = row.satt_dir.trim();

    attachments.push({
      id: row.att_id,
      categoryId,
      storageKey,
      driver,
      bucket: null, // filled by the runner from the storage config group
      url: path,
      name: row.name === '' ? (row.real_name ?? storageKey) : row.name,
      originalName: row.real_name === '' ? null : row.real_name,
      kind: kindOf(mime, row.type),
      mime,
      size: sizeOf(row.att_size),
      sha256: null,
      width: null,
      height: null,
      durationMs: null,
      thumbnailUrl: thumbnail === '' || thumbnail === path ? null : thumbnail,
      // `module_type` says 后台 or 用户 but never *which* one, and the legacy
      // table has no uploader column. Claiming an admin here would put a name
      // on a file nobody can vouch for.
      uploadedByAdminId: null,
      uploadedByUserId: null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
  }

  return {
    categories,
    attachments,
    report: {
      categories: categories.length,
      categoriesDroppedCycle,
      attachments: attachments.length,
      attachmentsDroppedNoPath,
      attachmentsUncategorised,
      attachmentsOnRemoteDriver,
      needsDigest: attachments.length,
      duplicateStorageKeys,
    },
  };
}
