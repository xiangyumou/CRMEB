import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, fk, instant, pk, updatedAt } from './_shared';
import { users } from './user';

/**
 * Admin identities, RBAC and storefront sessions.
 *
 * RBAC lives entirely in these four tables: permission *atoms* are declared in
 * code (`core/<domain>/permissions.ts`) and only the grants are stored, so a
 * renamed atom is a code change plus a data fix-up, never a migration.
 */

export const admins = pgTable(
  'admins',
  {
    id: pk(),
    /** Login name. Unique case-insensitively — PostgreSQL, unlike MySQL, is case-sensitive. */
    account: varchar({ length: 64 }).notNull(),
    /** bcrypt hash, or an imported 32-char MD5 while `passwordAlgo = 'md5'`. */
    passwordHash: varchar({ length: 255 }).notNull(),
    /** `md5` rows are upgraded to bcrypt on the next successful login. */
    passwordAlgo: varchar({ length: 16 }).notNull().default('bcrypt'),
    /**
     * Bumped on every password change. Sessions carry the value they were
     * minted with and are rejected once it differs, which is what makes
     * "change password revokes everywhere" work without a session sweep.
     */
    passwordVersion: integer().notNull().default(1),
    name: varchar({ length: 64 }).notNull(),
    avatar: varchar({ length: 512 }),
    phone: varchar({ length: 32 }),
    /** Bypasses every permission check. Exactly one row should have it. */
    isSuper: boolean().notNull().default(false),
    status: smallint().notNull().default(1),
    lastLoginAt: instant(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex('admins_account_lower_key').on(sql`lower(${t.account})`)],
);

export const roles = pgTable(
  'roles',
  {
    id: pk(),
    name: varchar({ length: 64 }).notNull(),
    remark: varchar({ length: 255 }),
    status: smallint().notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('roles_name_key').on(t.name)],
);

/**
 * One row per granted atom. The atom string is *not* a foreign key: the set of
 * atoms is compiled into the app, and a role that still grants a retired atom
 * simply grants nothing.
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: fk()
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    /** `<domain>:<resource>:<action>`, e.g. `catalog:product:update`. */
    permission: varchar({ length: 128 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const adminRoles = pgTable(
  'admin_roles',
  {
    adminId: fk()
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    roleId: fk()
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.adminId, t.roleId] }),
    index('admin_roles_role_idx').on(t.roleId),
  ],
);

/**
 * Storefront sessions. The admin surface keeps its sessions in Redis (a cookie
 * is cheap to re-issue); storefront tokens must survive a Redis flush and must
 * be revocable per user, so they live here.
 *
 * Only `sha256(token)` is stored. A dump of this table cannot be replayed.
 */
export const userSessions = pgTable(
  'user_sessions',
  {
    id: pk(),
    userId: fk()
      .notNull()
      .references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    /** Lowercase hex sha256 of the opaque bearer token. */
    tokenHash: varchar({ length: 64 }).notNull(),
    /** Snapshot of `users.password_version` when the session was minted. */
    passwordVersion: integer().notNull().default(1),
    /** `h5` | `wechat-oa` | `wechat-mini`, from the `X-Client-Platform` header. */
    platform: varchar({ length: 24 }).notNull(),
    userAgent: varchar({ length: 255 }),
    expiresAt: instant().notNull(),
    lastSeenAt: instant(),
    revokedAt: instant(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('user_sessions_token_hash_key').on(t.tokenHash),
    index('user_sessions_user_idx').on(t.userId),
    index('user_sessions_expires_idx').on(t.expiresAt),
  ],
);

/**
 * Admin operation log. Written by `handle()` for every mutating admin route
 * that succeeds, plus explicitly by services for things worth a sentence.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    adminId: fk().references(() => admins.id, { onDelete: 'set null' }),
    adminAccount: varchar({ length: 64 }).notNull(),
    /** Route id from the contract, e.g. `coupon.adminCreate`. */
    routeId: varchar({ length: 128 }).notNull(),
    method: varchar({ length: 8 }).notNull(),
    path: varchar({ length: 512 }).notNull(),
    /** Target of the operation when the service knows it, e.g. `coupon:42`. */
    target: varchar({ length: 128 }),
    status: integer().notNull(),
    /** Request body with secrets stripped. Never the raw body. */
    payload: text(),
    requestId: varchar({ length: 64 }).notNull(),
    /** Forwarded client address. Everything is behind one proxy, so this is advisory. */
    ip: varchar({ length: 64 }),
    /**
     * Who acted: `admin` — a console account, `admin_id` — or
     * `staff` — a 店员 on the storefront's staff surface, `user_id`. Rows
     * written before the column existed are all console rows, hence the default.
     */
    actorKind: varchar({ length: 16 }).notNull().default('admin'),
    /** The 店员's storefront user when `actor_kind = 'staff'`. */
    userId: fk().references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_admin_idx').on(t.adminId, t.createdAt),
    index('audit_logs_route_idx').on(t.routeId, t.createdAt),
    index('audit_logs_user_idx').on(t.userId, t.createdAt),
    check('audit_logs_actor_kind_known', sql`${t.actorKind} in ('admin', 'staff')`),
  ],
);
