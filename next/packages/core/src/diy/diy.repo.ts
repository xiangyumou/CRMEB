import type { DbOrTx } from '@shop/db';
import { diyPages, type DiyPage, type DiyPageBackground } from '@shop/db/schema/diy';
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';

/** The only file that touches `diy_pages`. */

export type DiyPageRow = DiyPage;
/** Re-exported so services never have to name a schema module. */
export type { DiyPageBackground };

export type DiyPageKindValue = DiyPage['kind'];
export type DiyPageStatusValue = DiyPage['status'];

const live = isNull(diyPages.deletedAt);

export interface DiyPageFilter {
  kind?: DiyPageKindValue | undefined;
  status?: DiyPageStatusValue | undefined;
  keyword?: string | undefined;
}

export interface DiyPageListOptions extends DiyPageFilter {
  page: number;
  pageSize: number;
  sortBy?: 'updatedAt' | 'createdAt' | 'name' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

function whereOf(filter: DiyPageFilter): SQL | undefined {
  const parts: (SQL | undefined)[] = [live];
  if (filter.kind) parts.push(eq(diyPages.kind, filter.kind));
  if (filter.status) parts.push(eq(diyPages.status, filter.status));
  if (filter.keyword) {
    const pattern = `%${filter.keyword}%`;
    parts.push(or(ilike(diyPages.name, pattern), ilike(diyPages.title, pattern)));
  }
  return and(...parts);
}

export async function listPages(
  db: DbOrTx,
  options: DiyPageListOptions,
): Promise<{ items: DiyPageRow[]; total: number }> {
  const where = whereOf(options);
  const column =
    options.sortBy === 'name'
      ? diyPages.name
      : options.sortBy === 'createdAt'
        ? diyPages.createdAt
        : diyPages.updatedAt;
  const direction = options.sortOrder === 'asc' ? asc : desc;

  const items = await db
    .select()
    .from(diyPages)
    .where(where)
    // `id` breaks ties so paging is stable when two pages share a timestamp.
    .orderBy(direction(column), desc(diyPages.id))
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize);

  const [totals] = await db.select({ value: count() }).from(diyPages).where(where);
  return { items, total: totals?.value ?? 0 };
}

export async function findPage(db: DbOrTx, id: number): Promise<DiyPageRow | null> {
  const rows = await db
    .select()
    .from(diyPages)
    .where(and(eq(diyPages.id, id), live))
    .limit(1);
  return rows[0] ?? null;
}

/** The page the storefront serves at `/`. */
export async function findHomePage(db: DbOrTx): Promise<DiyPageRow | null> {
  const rows = await db
    .select()
    .from(diyPages)
    .where(and(eq(diyPages.isHome, true), live))
    .limit(1);
  return rows[0] ?? null;
}

export interface NewDiyPageInput {
  name: string;
  kind: DiyPageKindValue;
  title?: string | null;
  content?: Record<string, unknown>;
  background?: DiyPageBackground | null;
  now: Date;
}

export async function insertPage(db: DbOrTx, input: NewDiyPageInput): Promise<DiyPageRow> {
  const rows = await db
    .insert(diyPages)
    .values({
      name: input.name,
      kind: input.kind,
      title: input.title ?? null,
      content: input.content ?? {},
      background: input.background ?? null,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('diy_pages insert returned no row');
  return row;
}

export interface DiyPagePatch {
  name?: string;
  title?: string | null;
  content?: Record<string, unknown>;
  background?: DiyPageBackground | null;
  status?: DiyPageStatusValue;
  publishedAt?: Date | null;
}

/** What the caller believes the row looks like right now. */
export interface DiyPageGuard {
  updatedAt: Date;
  /** `content->>'version'`, or null for a page that has never been saved. */
  contentVersion: string | null;
}

/**
 * Writes a page and moves `updated_at`.
 *
 * `guard` is the optimistic-concurrency check: the editor sends back the
 * version it loaded, and a page that moved underneath it fails to match rather
 * than being silently overwritten. It compares the envelope's `version` as well
 * as `updated_at`, because two saves inside the same millisecond share the
 * latter — which is not a theoretical case, since a fixed clock in the tests
 * makes every save land on the same instant.
 *
 * Callers that legitimately do not care (a rename, the ETL) omit it.
 */
export async function updatePage(
  db: DbOrTx,
  id: number,
  patch: DiyPagePatch,
  now: Date,
  guardOn?: DiyPageGuard,
): Promise<DiyPageRow | null> {
  const guard = guardOn
    ? and(
        eq(diyPages.id, id),
        live,
        eq(diyPages.updatedAt, guardOn.updatedAt),
        guardOn.contentVersion === null
          ? sql`${diyPages.content}->>'version' is null`
          : sql`${diyPages.content}->>'version' = ${guardOn.contentVersion}`,
      )
    : and(eq(diyPages.id, id), live);
  const rows = await db
    .update(diyPages)
    .set({ ...patch, updatedAt: now })
    .where(guard)
    .returning();
  return rows[0] ?? null;
}

export async function softDeletePage(db: DbOrTx, id: number, now: Date): Promise<boolean> {
  const rows = await db
    .update(diyPages)
    .set({ deletedAt: now, updatedAt: now, isHome: false })
    .where(and(eq(diyPages.id, id), live))
    .returning({ id: diyPages.id });
  return rows.length > 0;
}

/**
 * Makes one page the home page.
 *
 * `diy_pages_home_uq` is a partial unique index, so the old home page has to be
 * cleared in the same transaction — and, because a unique index is checked per
 * statement rather than at commit, in that order.
 */
export async function setHomePage(db: DbOrTx, id: number, now: Date): Promise<void> {
  await db
    .update(diyPages)
    .set({ isHome: false, updatedAt: now })
    .where(and(eq(diyPages.isHome, true), sql`${diyPages.id} <> ${id}`));
  await db.update(diyPages).set({ isHome: true, updatedAt: now }).where(eq(diyPages.id, id));
}
