/**
 * Legacy admin tables and `eb_system_config` → the new `system` schema.
 *
 * Sources (`crmeb/public/install/crmeb.sql`):
 *
 * | Legacy                | New                                     |
 * | --------------------- | --------------------------------------- |
 * | `eb_system_admin`     | `admins`, `admin_roles`                 |
 * | `eb_system_role`      | `roles` (grants are NOT translated)     |
 *
 * A pure function: rows in, rows and a report out. Nothing here opens a
 * connection or looks at a clock.
 *
 * **`eb_system_config` is not mapped here** (CR-1-j). It was, through a
 * `configKeyMap` input the runner built — but that map is one legacy key to one
 * destination, and a key can have more than one claimant while the rewrite is
 * in flight, so one of them silently got nothing. Routing config also means
 * running each group's zod schema, which needs `@shop/core` and would stop this
 * file being pure. `src/config.ts` owns it, fans a key out to every claimant and
 * validates the result; the two pieces of *domain* knowledge stay here, where
 * their reason lives: `decodeConfigValue` and `CONFIG_VALUE_TRANSFORMS`.
 *
 * **Grants are deliberately not migrated.** A legacy role's `rules` column is a
 * comma-separated list of `eb_system_menus` ids — rows in a table that no
 * longer exists, describing a menu tree that no longer exists. There is no
 * mapping from a menu id to a permission atom that is not a guess, and a guess
 * here either hands somebody 退款 they did not have or takes it away silently.
 * So roles arrive named, numbered and **empty**, every one of them is in the
 * report, and re-granting them is a ten-minute job on a screen built for it.
 * (An admin with `level = 0`, the legacy super admin, keeps everything through
 * `isSuper` and is unaffected.)
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_system_admin`. Timestamps are unix seconds; `0` means "never". */
export interface LegacySystemAdmin {
  id: number;
  account: string;
  /** 32-char MD5 in every deployment that has not been re-hashed. */
  pwd: string;
  real_name: string;
  head_pic: string;
  /** Comma-separated `eb_system_role.id` list, despite the column comment. */
  roles: string;
  last_time: number;
  last_ip: string;
  add_time: number;
  login_count: number;
  /** 0 = the built-in super admin. */
  level: number;
  /** 1 有效, 0 无效. */
  status: number;
  is_del: number;
}

/** `eb_system_role`. */
export interface LegacySystemRole {
  id: number;
  role_name: string;
  /** Comma-separated `eb_system_menus` ids. Untranslatable; see the header. */
  rules: string | null;
  level: number;
  status: number;
}

/**
 * `eb_system_config` — the 575-key soup, read as `menu_name` → `value`.
 *
 * Kept here next to `decodeConfigValue`, which is the only thing in this file
 * that still touches it; the rows themselves are read and routed by
 * `src/config.ts` (CR-1-j).
 */
export interface LegacySystemConfig {
  menu_name: string;
  /** JSON-encoded in the legacy table for everything except plain inputs. */
  value: string;
}

// ---------------------------------------------------------------------------
// output row shapes (by hand, so `@shop/etl` does not depend on `@shop/db`)
// ---------------------------------------------------------------------------

export interface AdminRow {
  id: number;
  account: string;
  passwordHash: string;
  /** `md5` until the admin next logs in, which re-hashes with bcrypt. */
  passwordAlgo: 'md5' | 'bcrypt';
  name: string;
  avatar: string | null;
  phone: string | null;
  isSuper: boolean;
  status: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface RoleRow {
  id: number;
  name: string;
  remark: string | null;
  status: number;
  createdAt: Date;
  updatedAt: Date;
  // No `deletedAt`: the `roles` table has no soft-delete column and
  // `eb_system_role` has no `is_del` to carry over either (CR-4-j).
}

export interface AdminRoleRow {
  adminId: number;
  roleId: number;
}

export interface SystemMigrationReport {
  admins: number;
  adminsDroppedDeleted: number;
  adminsSuper: number;
  /** Accounts still on MD5. They re-hash on first login; none are readable. */
  adminsWithLegacyPassword: number;
  roles: number;
  adminRoleLinks: number;
  adminRoleLinksDroppedUnknownRole: number;
  /** Roles whose legacy menu-id grants could not be translated — i.e. all of them. */
  rolesNeedingRegrant: number;
  roleIdsNeedingRegrant: number[];
}

export interface SystemMigrationInput {
  admins?: readonly LegacySystemAdmin[];
  roles?: readonly LegacySystemRole[];
}

export interface SystemMigrationOutput {
  admins: AdminRow[];
  roles: RoleRow[];
  adminRoles: AdminRoleRow[];
  report: SystemMigrationReport;
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

/** Legacy unix seconds; `0` is the legacy way of saying NULL. */
function instant(seconds: number): Date | null {
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** `"1,2,3"` → `[1, 2, 3]`, skipping blanks and non-numbers. */
export function parseIdList(raw: string | null | undefined): number[] {
  return (raw ?? '')
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/**
 * The legacy table stores everything as a string, and JSON-encodes anything
 * that is not a plain input. `"1"` must stay a string here rather than become a
 * number: the target group's zod schema coerces, and guessing at this layer is
 * how `"0755"` becomes `755`.
 */
export function decodeConfigValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const first = trimmed[0];
  if (first !== '{' && first !== '[' && first !== '"') return trimmed;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

export function mapSystem(input: SystemMigrationInput): SystemMigrationOutput {
  const admins: AdminRow[] = [];
  const roles: RoleRow[] = [];
  const adminRoles: AdminRoleRow[] = [];

  const roleIdsNeedingRegrant: number[] = [];
  let adminsDroppedDeleted = 0;
  let adminsSuper = 0;
  let adminsWithLegacyPassword = 0;
  let adminRoleLinksDroppedUnknownRole = 0;

  // The legacy schema has no created/updated timestamps on roles, and a
  // migration must not invent "now" — it would make every role look edited on
  // the day of the cutover. The oldest admin's add_time is the best honest
  // stand-in for "this deployment started".
  const epoch =
    instant(Math.min(...(input.admins ?? []).map((row) => row.add_time).filter((t) => t > 0))) ??
    new Date(0);

  const knownRoleIds = new Set<number>();
  for (const legacy of input.roles ?? []) {
    knownRoleIds.add(legacy.id);
    roles.push({
      id: legacy.id,
      name: legacy.role_name,
      remark: '由旧系统迁移，权限需重新分配',
      status: legacy.status === 1 ? 1 : 0,
      createdAt: epoch,
      updatedAt: epoch,
    });
    if (parseIdList(legacy.rules).length > 0) roleIdsNeedingRegrant.push(legacy.id);
  }

  for (const legacy of input.admins ?? []) {
    if (legacy.is_del === 1) {
      adminsDroppedDeleted += 1;
      continue;
    }

    const isSuper = legacy.level === 0;
    if (isSuper) adminsSuper += 1;
    const isMd5 = /^[0-9a-f]{32}$/i.test(legacy.pwd);
    if (isMd5) adminsWithLegacyPassword += 1;

    const createdAt = instant(legacy.add_time) ?? epoch;
    admins.push({
      id: legacy.id,
      account: legacy.account,
      passwordHash: legacy.pwd,
      passwordAlgo: isMd5 ? 'md5' : 'bcrypt',
      name: legacy.real_name === '' ? legacy.account : legacy.real_name,
      avatar: blankToNull(legacy.head_pic),
      phone: null,
      isSuper,
      status: legacy.status === 1 ? 1 : 0,
      // `eb_system_admin.last_ip` is deliberately not carried over (CR-4-j):
      // the `admins` table has no column for it, nothing in the new system
      // reads an admin's last IP, and the new session records its own.
      lastLoginAt: instant(legacy.last_time),
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });

    for (const roleId of parseIdList(legacy.roles)) {
      if (!knownRoleIds.has(roleId)) {
        adminRoleLinksDroppedUnknownRole += 1;
        continue;
      }
      adminRoles.push({ adminId: legacy.id, roleId });
    }
  }

  return {
    admins,
    roles,
    adminRoles,
    report: {
      admins: admins.length,
      adminsDroppedDeleted,
      adminsSuper,
      adminsWithLegacyPassword,
      roles: roles.length,
      adminRoleLinks: adminRoles.length,
      adminRoleLinksDroppedUnknownRole,
      rolesNeedingRegrant: roleIdsNeedingRegrant.length,
      roleIdsNeedingRegrant,
    },
  };
}

/**
 * The value transforms this domain knows about.
 *
 * Kept next to the mapper rather than in the runner because the *reason* is a
 * domain fact: `order_cancel_time` was stored in hours and the new
 * `order.cancelAfterMinutes` is in minutes, so copying the number across would
 * cancel every unpaid order sixty times too early.
 */
export const CONFIG_VALUE_TRANSFORMS: ReadonlyMap<string, (raw: string) => unknown> = new Map<
  string,
  (raw: string) => unknown
>([
  [
    'order_cancel_time',
    (raw) => {
      const hours = Number.parseFloat(raw);
      return Number.isFinite(hours) ? Math.round(hours * 60) : 30;
    },
  ],
  // `order_activity_time` had the same hours → minutes entry until CR-2-j. It
  // has no claimant now — activity-order expiry left with seckill and bargain —
  // and a transform for a key nobody migrates is a trap: whatever field claims
  // the key next would silently receive it multiplied by sixty.

  // The radio settings stored the legacy form's option *code*, and the new
  // schemas are named enums, so every claimed enum or array field needs a
  // decoder here (the codes are the ones `eb_system_config.parameter` lists).
  // Found by the first ETL drill against a production dump copy: the synthetic
  // fixture had none of these rows. `config.test.ts` fails if a claimed enum or
  // array field is added without one.
  // upload_type: 1 本地, 2 七牛, 3 阿里云 OSS, 4 腾讯 COS (5+ other vendors).
  // Every cloud vendor is S3-compatible and its keys ride along as aliases.
  ['upload_type', (raw) => (raw.trim() === '' || raw.trim() === '1' ? 'local' : 's3')],
  // sms_type: 0 一号通 (retired), 1 阿里云, 2 腾讯云.
  ['sms_type', (raw) => ({ '1': 'aliyun', '2': 'tencent' })[raw.trim()] ?? 'none'],
  // logistics_type: 1 一号通 (retired), 2 阿里云物流查询 (云市场).
  ['logistics_type', (raw) => (raw.trim() === '2' ? 'aliyun-market' : 'none')],
  // routine_encode / wechat_encode: 0 明文, 1 兼容, 2 安全.
  ['routine_encode', (raw) => messageMode(raw)],
  ['wechat_encode', (raw) => messageMode(raw)],
  // routine_contact_type: 0 跟随系统, 1 小程序客服. 跟随系统 meant the shop's
  // 自建客服 / 电话 / 链接 setting, and 自建客服 and 链接 are not ported, so it
  // lands on the new default, the mini-program's own chat; the operator can
  // switch to 拨打电话 on 小程序设置.
  ['routine_contact_type', () => 'mini-program'],
  // order_notice_admin_uids: "12,34" — user ids, comma-separated.
  [
    'order_notice_admin_uids',
    (raw) =>
      raw
        .split(/[,，\s]+/)
        .map((part) => Number(part))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
  ],
]);

function messageMode(raw: string): 'plain' | 'compatible' | 'safe' {
  return ({ '1': 'compatible', '2': 'safe' } as const)[raw.trim() as '1' | '2'] ?? 'plain';
}
