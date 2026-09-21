import type { DbOrTx } from '@shop/db';
import {
  pageLinkCategories,
  pageLinks,
  type NewPageLink,
  type PageLink,
  type PageLinkCategory,
} from '@shop/db/schema/diy';
import { and, asc, eq, ilike, or, type SQL } from 'drizzle-orm';

/** The only file that touches `page_links` and `page_link_categories`. */

export type PageLinkRow = PageLink;
export type PageLinkCategoryRow = PageLinkCategory;

export async function listCategories(db: DbOrTx): Promise<PageLinkCategoryRow[]> {
  return db
    .select()
    .from(pageLinkCategories)
    .orderBy(asc(pageLinkCategories.sortOrder), asc(pageLinkCategories.id));
}

export async function findCategory(db: DbOrTx, id: number): Promise<PageLinkCategoryRow | null> {
  const rows = await db
    .select()
    .from(pageLinkCategories)
    .where(eq(pageLinkCategories.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export interface LinkFilter {
  categoryId?: number | undefined;
  keyword?: string | undefined;
  includeDisabled?: boolean | undefined;
}

export async function listLinks(db: DbOrTx, filter: LinkFilter = {}): Promise<PageLinkRow[]> {
  const parts: (SQL | undefined)[] = [];
  if (filter.categoryId !== undefined) parts.push(eq(pageLinks.categoryId, filter.categoryId));
  if (!filter.includeDisabled) parts.push(eq(pageLinks.isEnabled, true));
  if (filter.keyword) {
    const pattern = `%${filter.keyword}%`;
    parts.push(or(ilike(pageLinks.name, pattern), ilike(pageLinks.url, pattern)));
  }
  return db
    .select()
    .from(pageLinks)
    .where(parts.length > 0 ? and(...parts) : undefined)
    .orderBy(asc(pageLinks.sortOrder), asc(pageLinks.id));
}

export async function findLink(db: DbOrTx, id: number): Promise<PageLinkRow | null> {
  const rows = await db.select().from(pageLinks).where(eq(pageLinks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findLinkByUrl(db: DbOrTx, url: string): Promise<PageLinkRow | null> {
  const rows = await db.select().from(pageLinks).where(eq(pageLinks.url, url)).limit(1);
  return rows[0] ?? null;
}

export async function insertLink(db: DbOrTx, values: NewPageLink): Promise<PageLinkRow> {
  const rows = await db.insert(pageLinks).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error('page_links insert returned no row');
  return row;
}

export async function updateLink(
  db: DbOrTx,
  id: number,
  patch: Partial<NewPageLink>,
  now: Date,
): Promise<PageLinkRow | null> {
  const rows = await db
    .update(pageLinks)
    .set({ ...patch, updatedAt: now })
    .where(eq(pageLinks.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function deleteLink(db: DbOrTx, id: number): Promise<boolean> {
  const rows = await db
    .delete(pageLinks)
    .where(eq(pageLinks.id, id))
    .returning({ id: pageLinks.id });
  return rows.length > 0;
}
