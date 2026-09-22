/**
 * SHA-256 of a file, streamed.
 *
 * Used for two things: filling `attachments.sha256`, which the mapper cannot
 * know and refuses to invent (ETL-F1-004), and writing the manifest `assets`
 * produces so a file copy can be proved rather than assumed.
 *
 * Streaming matters — the uploads tree holds videos, and reading one into a
 * Buffer on a 2-core / 3.6 GB box during a cutover is how the migration gets
 * OOM-killed halfway through.
 *
 * A file that is missing or unreadable returns `null`. The caller decides what
 * that means; nothing here substitutes a digest of something else.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export async function digestFile(path: string): Promise<string | null> {
  let size: number;
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    size = info.size;
  } catch {
    return null;
  }
  // An empty file has a perfectly good digest; it is not an error.
  void size;

  return new Promise<string | null>((resolve) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', () => {
      resolve(null);
    });
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

/** Digest of a string, for manifests and for tests that need a known value. */
export function digestText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
