import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { createdAt, deletedAt, emptyJsonObject, fk, instant, pk, updatedAt } from './_shared';

/**
 * The visual page builder.
 *
 * `content` is the page envelope the uni-app renderer already understands; its
 * shape is owned by `contracts/src/diy/schema/*` and must round-trip
 * byte-identically (see PLAN §7). Nothing in the database interprets it, which
 * is exactly why it is one `jsonb` column with an explicit `schemaVersion`
 * beside it rather than thirty columns.
 */

/** Which surface the page decorates. Legacy `eb_diy.type` plus `page_type`. */
export const diyPagesKind = pgEnum('diy_pages_kind', [
  'home',
  'category',
  'product_detail',
  'user_center',
  'micro',
]);

export const diyPagesStatus = pgEnum('diy_pages_status', ['draft', 'published']);

/** Page background, kept out of `content` so the shell can render before the components parse. */
export interface DiyPageBackground {
  color?: string;
  imageUrl?: string;
  /** How the background image repeats: `full`, `repeat`, `fixed`. */
  imageMode?: 'full' | 'repeat' | 'fixed';
}

export const diyPages = pgTable(
  'diy_pages',
  {
    id: pk(),
    name: varchar({ length: 100 }).notNull(),
    kind: diyPagesKind().notNull(),
    /** Title bar text shown by the storefront. */
    title: varchar({ length: 100 }),
    status: diyPagesStatus().notNull().default('draft'),
    /** Exactly one page may be the storefront home page. */
    isHome: boolean().notNull().default(false),
    /** The component list, in the renderer's own envelope format. */
    content: jsonb().$type<Record<string, unknown>>().notNull().default(emptyJsonObject),
    /** Bumped whenever the envelope format changes; the parser dispatches on it. */
    schemaVersion: integer().notNull().default(1),
    background: jsonb().$type<DiyPageBackground>(),
    publishedAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('diy_pages_kind_idx').on(t.kind, t.status),
    // One home page, enforced here rather than by "unset the others first".
    uniqueIndex('diy_pages_home_uq')
      .on(t.isHome)
      .where(sql`is_home and deleted_at is null`),
    check('diy_pages_schema_version_positive', sql`${t.schemaVersion} >= 1`),
    check('diy_pages_published_shape', sql`${t.status} <> 'published' or ${t.publishedAt} is not null`),
    check('diy_pages_home_is_home_kind', sql`not ${t.isHome} or ${t.kind} = 'home'`),
  ],
);

export type DiyPage = typeof diyPages.$inferSelect;
export type NewDiyPage = typeof diyPages.$inferInsert;

export const themesKind = pgEnum('themes_kind', ['built_in', 'custom']);

/** Per-surface page data plus the colour tokens. Same envelope rules as `diyPages.content`. */
export interface ThemeData {
  home?: Record<string, unknown>;
  category?: Record<string, unknown>;
  productDetail?: Record<string, unknown>;
  userCenter?: Record<string, unknown>;
  /** Colour and typography tokens the renderer applies globally. */
  tokens?: Record<string, unknown>;
}

export const themes = pgTable(
  'themes',
  {
    id: pk(),
    name: varchar({ length: 100 }).notNull(),
    intro: varchar({ length: 255 }),
    kind: themesKind().notNull().default('custom'),
    isActive: boolean().notNull().default(false),
    data: jsonb().$type<ThemeData>().notNull().default(emptyJsonObject),
    /** The factory data a "reset" restores. */
    defaultData: jsonb().$type<ThemeData>(),
    schemaVersion: integer().notNull().default(1),
    previewImages: jsonb().$type<Record<string, string>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('themes_active_uq')
      .on(t.isActive)
      .where(sql`is_active and deleted_at is null`),
    check('themes_schema_version_positive', sql`${t.schemaVersion} >= 1`),
  ],
);

export type Theme = typeof themes.$inferSelect;
export type NewTheme = typeof themes.$inferInsert;

// ---------------------------------------------------------------------------
// link registry
// ---------------------------------------------------------------------------

/**
 * The target list behind `<LinkPicker>`: storefront routes an operator may
 * point a decorated component at. Admin-managed because the uni-app route table
 * changes independently of the backend.
 */
export const pageLinkCategories = pgTable(
  'page_link_categories',
  {
    id: pk(),
    parentId: fk().references((): AnyPgColumn => pageLinkCategories.id, { onDelete: 'restrict' }),
    name: varchar({ length: 64 }).notNull(),
    isEnabled: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('page_link_categories_parent_idx').on(t.parentId)],
);

export type PageLinkCategory = typeof pageLinkCategories.$inferSelect;
export type NewPageLinkCategory = typeof pageLinkCategories.$inferInsert;

export const pageLinks = pgTable(
  'page_links',
  {
    id: pk(),
    categoryId: fk().references(() => pageLinkCategories.id, { onDelete: 'set null' }),
    name: varchar({ length: 64 }).notNull(),
    /** uni-app route, e.g. `/pages/goods_details/index`. */
    url: varchar({ length: 255 }).notNull(),
    /** Query parameter name the target expects, e.g. `id`. */
    paramName: varchar({ length: 64 }),
    example: varchar({ length: 255 }),
    isEnabled: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('page_links_url_uq').on(t.url),
    index('page_links_category_idx').on(t.categoryId, t.sortOrder),
  ],
);

export type PageLink = typeof pageLinks.$inferSelect;
export type NewPageLink = typeof pageLinks.$inferInsert;
