/**
 * Attachment path → storage key, and the file on disk that goes with it.
 *
 * The legacy `eb_system_attachment.att_dir` holds whatever the uploader of the
 * day wrote: `/uploads/attach/2024/…`, `uploads/attach/2024/…` or a fully
 * qualified `https://cdn.example.com/attach/2024/…` for a row that lives in a
 * bucket. The new `attachments.storage_key` is the object key **relative to the
 * driver's root** and carries a unique index.
 *
 * The rule is: *never invent a key from the filename*. The bytes have to stay
 * reachable at exactly the path they are at today, or every product image in
 * the shop breaks on cutover. So the key is the path with the leading slashes
 * (or, for an absolute URL, the origin) stripped and nothing else changed.
 *
 * `storageKeyOf` here is the canonical rule; `mappers/storage.ts` (F1's) has
 * its own copy, and `storage-keys.test.ts` asserts the two agree on every case
 * either of them cares about. When that test fails, one of the two moved and
 * the migration would write keys the uploader cannot resolve.
 */

import path from 'node:path';

/** Strips the origin from an absolute URL, and the leading slashes from a path. */
export function storageKeyOf(attDir: string): string {
  const value = attDir.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname.replace(/^\/+/, '');
    } catch {
      return value.replace(/^\/+/, '');
    }
  }
  return value.replace(/^\/+/, '');
}

/**
 * Where the bytes of a **local-driver** attachment live under the uploads root
 * that is being rsynced across.
 *
 * The legacy public root is `crmeb/public`, so `/uploads/attach/x.png` is
 * `<public>/uploads/attach/x.png`. The new deployment mounts only the
 * `uploads/` subtree as a volume, so the runner is given that subtree as
 * `UPLOADS_ROOT` and the `uploads/` prefix comes off the key.
 *
 * Returns `null` for a key that escapes the root: `..` in a stored path is
 * either corruption or an old traversal bug, and hashing whatever it resolves
 * to would read a file outside the uploads tree.
 */
export function localFilePath(uploadsRoot: string, storageKey: string): string | null {
  const relative = storageKey.replace(/^uploads\//, '');
  if (relative === '' || relative.includes('\0')) return null;
  const root = path.resolve(uploadsRoot);
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/** The public URL a local-driver key is served at, matching the edge's `/uploads/`. */
export function localPublicUrl(publicPrefix: string, storageKey: string): string {
  const prefix = publicPrefix.replace(/\/+$/, '');
  const relative = storageKey.replace(/^uploads\//, '');
  return `${prefix}/${relative}`;
}
