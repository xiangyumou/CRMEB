import type { Ctx } from '../kernel/context';
import * as repo from './storage.repo';
import { resolveStorage } from './storage.service';
import { storageConfig } from './storage.config';

/**
 * Sweeping the bytes of deleted attachments.
 *
 * Deleting from the library tombstones the row and leaves the object alone,
 * because a product description written years ago may still point at the URL.
 * This job is the second half: once a tombstone is older than
 * `storage.orphanRetentionDays`, the object is removed and the row is purged.
 *
 * It never deletes **by directory listing** — walking an uploads folder and
 * removing anything older than a day, whether or not a record points at it,
 * loses pictures that are still in use. The database is the only authority:
 * nothing is deleted that does not have a tombstoned row, and
 * `listSweepableAttachments` refuses to touch a key any live row still uses
 * (two uploads of identical bytes share one object).
 *
 * `orphanRetentionDays: 0` disables it, which is the setting for a shop that
 * would rather pay for storage than ever lose a picture.
 */
export interface SweepReport {
  examined: number;
  removed: number;
  failed: number;
}

export async function cleanOrphanAttachments(
  ctx: Ctx,
  options: { limit?: number } = {},
): Promise<SweepReport> {
  const settings = await ctx.config.get(storageConfig);
  if (settings.orphanRetentionDays <= 0) return { examined: 0, removed: 0, failed: 0 };

  const limit = options.limit ?? 200;
  const before = new Date(
    ctx.clock.now().getTime() - settings.orphanRetentionDays * 24 * 60 * 60 * 1000,
  );

  const candidates = await repo.listSweepableAttachments(ctx.db, before, limit);
  if (candidates.length === 0) return { examined: 0, removed: 0, failed: 0 };

  const resolved = await resolveStorage(ctx);
  const purgeable: number[] = [];
  let failed = 0;

  for (const candidate of candidates) {
    // A row written under a driver the shop no longer uses is left alone: its
    // bytes are in a bucket this process cannot address, and guessing would
    // delete the wrong object.
    if (candidate.driver !== resolved.driver) continue;
    try {
      await resolved.storage.delete(candidate.storageKey);
      purgeable.push(candidate.id);
    } catch (error) {
      // A driver that is briefly unavailable must not lose the record of what
      // still needs deleting, so the row stays and the next run retries it.
      failed += 1;
      ctx.logger.warn(
        { requestId: ctx.requestId, attachmentId: candidate.id, err: error },
        'storage: 清理孤儿素材失败，保留记录待下次重试',
      );
    }
  }

  const removed = await repo.purgeAttachments(ctx.db, purgeable);
  return { examined: candidates.length, removed, failed };
}
