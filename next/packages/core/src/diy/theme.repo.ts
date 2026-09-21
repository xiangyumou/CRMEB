import type { DbOrTx } from '@shop/db';
import { themes, type Theme, type ThemeData } from '@shop/db/schema/diy';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

/** The only file that touches `themes`. */

export type ThemeRow = Theme;
export type { ThemeData };

/** `ThemeData`'s per-surface keys, keyed by the page kind they decorate. */
export const THEME_SURFACE_BY_KIND = {
  home: 'home',
  category: 'category',
  product_detail: 'productDetail',
  user_center: 'userCenter',
  micro: null,
} as const;

export type ThemeSurface = Exclude<
  (typeof THEME_SURFACE_BY_KIND)[keyof typeof THEME_SURFACE_BY_KIND],
  null
>;

const live = isNull(themes.deletedAt);

export async function listThemes(db: DbOrTx): Promise<ThemeRow[]> {
  return db.select().from(themes).where(live).orderBy(asc(themes.id));
}

export async function findTheme(db: DbOrTx, id: number): Promise<ThemeRow | null> {
  const rows = await db
    .select()
    .from(themes)
    .where(and(eq(themes.id, id), live))
    .limit(1);
  return rows[0] ?? null;
}

export async function findActiveTheme(db: DbOrTx): Promise<ThemeRow | null> {
  const rows = await db
    .select()
    .from(themes)
    .where(and(eq(themes.isActive, true), live))
    .limit(1);
  return rows[0] ?? null;
}

export interface ThemePatch {
  name?: string;
  intro?: string | null;
  data?: ThemeData;
  defaultData?: ThemeData | null;
}

export async function updateTheme(
  db: DbOrTx,
  id: number,
  patch: ThemePatch,
  now: Date,
): Promise<ThemeRow | null> {
  const rows = await db
    .update(themes)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(themes.id, id), live))
    .returning();
  return rows[0] ?? null;
}

/** Same partial-unique dance as the home page: clear the old one first. */
export async function activateTheme(db: DbOrTx, id: number, now: Date): Promise<void> {
  await db
    .update(themes)
    .set({ isActive: false, updatedAt: now })
    .where(and(eq(themes.isActive, true), sql`${themes.id} <> ${id}`));
  await db.update(themes).set({ isActive: true, updatedAt: now }).where(eq(themes.id, id));
}
