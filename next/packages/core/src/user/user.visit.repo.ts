import type { DbOrTx } from '@shop/db';
import { userVisits } from '@shop/db/schema/stats';

/**
 * The only writer of `user_visits` in the system.
 *
 * `stats` reads the table and is select-only on purpose: the recorder lives
 * with whoever owns the storefront session rather than with the domain that
 * aggregates it, so that `stats.repo.ts` being provably free of writes stays
 * true.
 */

export interface InsertVisitInput {
  userId: number | null;
  path: string;
  platform: 'h5' | 'wechat_oa' | 'wechat_mini' | null;
  ip: string | null;
  now: Date;
}

/**
 * No `returning` and no id: a beacon's answer is 204 and nothing reads the row
 * back. Province is left null — the geo column has no source yet, and guessing
 * one from the IP without a database would make 地域分布 confidently wrong
 * rather than empty (the aggregate already buckets a null as 未知).
 */
export async function insertVisit(db: DbOrTx, input: InsertVisitInput): Promise<void> {
  await db.insert(userVisits).values({
    userId: input.userId,
    path: input.path,
    platform: input.platform,
    ip: input.ip,
    province: null,
    stayMs: null,
    createdAt: input.now,
  });
}
