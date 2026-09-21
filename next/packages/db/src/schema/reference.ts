import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { createdAt, deletedAt, fk, instant, pk, updatedAt } from './_shared';

/**
 * Reference data: the administrative-division tree, courier companies and the
 * legal agreements shown in the storefront. Everything here is seeded by
 * `src/seed/index.ts` and is safe to truncate-and-reload.
 */

// ---------------------------------------------------------------------------
// cities
// ---------------------------------------------------------------------------

/**
 * Administrative divisions (provinces → cities → districts).
 *
 * `id` carries the legacy `eb_system_city.city_id` value, not the legacy
 * auto-increment `id`: the legacy tree links `parent_id -> city_id`, so keeping
 * `city_id` as the primary key makes the tree self-consistent with no
 * translation table. Seed rows therefore insert explicit ids.
 */
export const cities = pgTable(
  'cities',
  {
    id: pk(),
    parentId: fk().references((): AnyPgColumn => cities.id, { onDelete: 'restrict' }),
    /** 0 = province / municipality, 1 = city, 2 = district or county. */
    level: integer().notNull(),
    /** 12-digit national division code. NULL for HK / Macao / Taiwan, which have none. */
    code: varchar({ length: 12 }),
    name: varchar({ length: 64 }).notNull(),
    /** Comma-joined ancestor names, e.g. `河北,石家庄`. Used for display and fuzzy match. */
    mergerName: varchar({ length: 255 }),
    lng: numeric({ precision: 10, scale: 6 }),
    lat: numeric({ precision: 10, scale: 6 }),
    isVisible: boolean().notNull().default(true),
  },
  (t) => [
    index('cities_parent_idx').on(t.parentId),
    index('cities_level_idx').on(t.level),
    index('cities_name_idx').on(t.name),
    uniqueIndex('cities_code_uq').on(t.code),
    check('cities_level_range', sql`${t.level} between 0 and 3`),
  ],
);

export type City = typeof cities.$inferSelect;
export type NewCity = typeof cities.$inferInsert;

// ---------------------------------------------------------------------------
// express companies
// ---------------------------------------------------------------------------

/**
 * Courier companies. Only the identity and the ordering are kept: the legacy
 * electronic-waybill credential columns (`account`, `key`, `net_name`, …) are
 * secrets and now live in the config registry, not in a business table.
 */
export const expressCompanies = pgTable(
  'express_companies',
  {
    id: pk(),
    /** Carrier code used by the tracking API, e.g. `shunfeng`. */
    code: varchar({ length: 50 }).notNull(),
    name: varchar({ length: 100 }).notNull(),
    sortOrder: integer().notNull().default(0),
    isEnabled: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('express_companies_code_uq').on(t.code),
    index('express_companies_enabled_idx').on(t.isEnabled, t.sortOrder),
  ],
);

export type ExpressCompany = typeof expressCompanies.$inferSelect;
export type NewExpressCompany = typeof expressCompanies.$inferInsert;

// ---------------------------------------------------------------------------
// agreements
// ---------------------------------------------------------------------------

/**
 * Which legal text this is. Replaces the legacy numeric `eb_agreement.type`
 * (1 付费会员协议, 2 代理商规则, 6 积分协议 and 8 分销说明 left with the
 * features they described).
 */
export const agreementsCode = pgEnum('agreements_code', [
  'user_service',
  'privacy_policy',
  'account_cancellation',
  'about_us',
]);

export const agreements = pgTable(
  'agreements',
  {
    id: pk(),
    code: agreementsCode().notNull(),
    title: varchar({ length: 200 }).notNull(),
    /** Sanitised HTML. NULL until an operator fills it in. */
    contentHtml: text(),
    isVisible: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    publishedAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex('agreements_code_uq').on(t.code)],
);

export type Agreement = typeof agreements.$inferSelect;
export type NewAgreement = typeof agreements.$inferInsert;
