import type { DbOrTx } from '@shop/db';
import { failedJobs } from '@shop/db/schema/system';
import { and, desc, eq, isNull } from 'drizzle-orm';

/**
 * The only file that touches `failed_jobs`.
 *
 * A job that exhausts its BullMQ attempts lands here, because the alternative
 * is a Redis key that expires and an operator who never finds out.
 */

export interface FailedJobInput {
  queue: string;
  jobName: string;
  jobId: string | null;
  payload: unknown;
  error: string;
  attempts: number;
  now: Date;
}

export async function recordFailedJob(db: DbOrTx, input: FailedJobInput): Promise<void> {
  await db.insert(failedJobs).values({
    queue: input.queue,
    jobName: input.jobName,
    jobId: input.jobId,
    payload: (input.payload ?? {}) as never,
    // Stored, so it must be short and must never carry a secret.
    error: input.error.slice(0, 2000),
    attempts: input.attempts,
    createdAt: input.now,
  });
}

export async function listUnresolvedJobs(db: DbOrTx, queue?: string, limit = 100) {
  const where = queue
    ? and(isNull(failedJobs.resolvedAt), eq(failedJobs.queue, queue))
    : isNull(failedJobs.resolvedAt);
  return db.select().from(failedJobs).where(where).orderBy(desc(failedJobs.id)).limit(limit);
}

export async function resolveFailedJob(db: DbOrTx, id: number, now: Date): Promise<number> {
  const result = await db
    .update(failedJobs)
    .set({ resolvedAt: now })
    .where(and(eq(failedJobs.id, id), isNull(failedJobs.resolvedAt)));
  return (result as { rowCount?: number | null }).rowCount ?? 0;
}
