/**
 * Legacy customer tables → the new `user` schema.
 *
 * Sources (`crmeb/public/install/crmeb.sql`):
 *
 * | Legacy                     | New                                         |
 * | -------------------------- | ------------------------------------------- |
 * | `eb_user`                  | `users`, `user_groups_map`                  |
 * | `eb_user_address`          | `user_addresses`                            |
 * | `eb_user_group`            | `user_groups`                               |
 * | `eb_user_label`            | `user_labels` (+ synthesised categories)    |
 * | `eb_user_label_relation`   | `user_labels_map`                           |
 * | `eb_user_cancel`           | `user_cancellation_requests`                |
 * | `eb_wechat_user`           | `wechat_identities` (platform `oa`)         |
 *
 * A pure function: rows in, rows and a report out. Nothing opens a connection
 * or reads a clock, so the test beside it runs on literal rows.
 *
 * **Passwords carry over as they are.** `eb_user.pwd` in this deployment is
 * already bcrypt for anybody who has signed in since the hardening patch, and
 * an unsalted MD5 for everybody who has not. A migration cannot tell the
 * customer to pick a new password, so both are kept and tagged: `bcrypt` or
 * `md5_legacy`, and the sign-in service upgrades an `md5_legacy` hash in place
 * the first time the password verifies. Re-hashing an MD5 here would be
 * security theatre — the MD5 is still the thing an attacker needs.
 *
 * **`eb_user_label_cate` has no `CREATE TABLE` in the dump** although
 * `eb_user_label.label_cate` references it. Categories are therefore taken
 * from `labelCategories` when the live database has that table, and otherwise
 * synthesised as `分类 <id>` from the ids the labels actually use, so no label
 * loses its grouping. The report counts the synthesised ones.
 *
 * **What is deliberately dropped** (all of it out of the retained shop, per
 * `docs/rewrite/PLAN.md`): balance (`now_money`), points (`integral`), member
 * level (`level`, `exp`, `overdue_time`), distribution (`spread_uid`,
 * `brokerage_price`, `is_promoter`), the 事业部 / 代理 / 员工 columns, sign-in
 * streaks, and `eb_user_search` / `eb_user_visit` / `eb_user_bill`.
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_user`. Timestamps are unix seconds, `0` meaning "unset". */
export interface LegacyUser {
  uid: number;
  account: string;
  pwd: string;
  real_name: string;
  birthday: number;
  mark: string;
  group_id: number;
  nickname: string;
  avatar: string;
  phone: string;
  add_time: number;
  add_ip: string;
  last_time: number;
  last_ip: string;
  /** 1 正常, 0 禁止. */
  status: number;
  /** `h5` / `wechat` / `routine` / `''`. */
  login_type: string;
  /** 1 = the account was cancelled. */
  is_del: number;
}

/** `eb_user_address`. */
export interface LegacyUserAddress {
  id: number;
  uid: number;
  real_name: string;
  phone: string;
  province: string;
  city: string;
  city_id: number;
  district: string;
  detail: string;
  post_code: number;
  longitude: string;
  latitude: string;
  is_default: number;
  is_del: number;
  add_time: number;
}

/** `eb_user_group`. */
export interface LegacyUserGroup {
  id: number;
  group_name: string;
}

/** `eb_user_label`. */
export interface LegacyUserLabel {
  id: number;
  label_cate: number;
  label_name: string;
}

/** `eb_user_label_cate` — no `CREATE TABLE` in the dump; present in live installs. */
export interface LegacyUserLabelCategory {
  id: number;
  label_name: string;
}

/** `eb_user_label_relation`. */
export interface LegacyUserLabelRelation {
  uid: number;
  label_id: number;
}

/** `eb_user_cancel` — 注销申请. `status` 0 待处理, 1 通过, 2 拒绝. */
export interface LegacyUserCancel {
  id: number;
  uid: number;
  name: string;
  phone: string;
  add_time: number;
  status: number;
  up_time: number;
  remark: string;
}

/** `eb_wechat_user` — one row per 公众号 follower. */
export interface LegacyWechatUser {
  id: number;
  uid: number;
  unionid: string;
  openid: string;
  nickname: string;
  headimgurl: string;
  subscribe: number;
  subscribe_time: number;
  add_time: number;
  is_del: number;
}

// ---------------------------------------------------------------------------
// output row shapes (written out by hand so `@shop/etl` need not depend on
// `@shop/db`, exactly as the other mappers do)
// ---------------------------------------------------------------------------

export type UserPasswordAlgo = 'bcrypt' | 'md5_legacy';
export type UserStatus = 'active' | 'disabled';
export type UserRegisterSource = 'h5' | 'wechat_oa' | 'wechat_mini' | 'admin';
export type CancellationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export interface UserRow {
  id: number;
  account: string;
  phone: string | null;
  passwordHash: string | null;
  passwordAlgo: UserPasswordAlgo | null;
  passwordVersion: number;
  nickname: string | null;
  avatarUrl: string | null;
  realName: string | null;
  birthday: Date | null;
  adminRemark: string | null;
  status: UserStatus;
  registerSource: UserRegisterSource | null;
  registerIp: string | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UserAddressRow {
  id: number;
  userId: number;
  receiverName: string;
  receiverPhone: string;
  provinceName: string;
  cityName: string;
  districtName: string | null;
  cityId: number | null;
  detail: string;
  postCode: string | null;
  lng: string | null;
  lat: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UserGroupRow {
  id: number;
  name: string;
  sortOrder: number;
}

export interface UserGroupMapRow {
  userId: number;
  groupId: number;
}

export interface UserLabelCategoryRow {
  id: number;
  name: string;
  sortOrder: number;
}

export interface UserLabelRow {
  id: number;
  categoryId: number | null;
  name: string;
  sortOrder: number;
}

export interface UserLabelMapRow {
  userId: number;
  labelId: number;
}

export interface UserCancellationRow {
  id: number;
  userId: number;
  nickname: string | null;
  phone: string | null;
  reason: string | null;
  status: CancellationStatus;
  reviewRemark: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WechatIdentityRow {
  userId: number;
  platform: 'oa';
  openid: string;
  unionid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  subscribed: boolean;
  subscribedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Every row that did not migrate is counted here, never swallowed. */
export interface UserMigrationReport {
  users: number;
  usersCancelled: number;
  usersWithoutPassword: number;
  usersWithLegacyMd5: number;
  usersAccountRenamed: number;
  usersDroppedDuplicateAccount: number;
  usersDroppedDuplicatePhone: number;
  addresses: number;
  addressesDroppedUnknownUser: number;
  groups: number;
  groupMemberships: number;
  labelCategories: number;
  labelCategoriesSynthesised: number;
  labels: number;
  labelsDroppedDuplicateName: number;
  labelMemberships: number;
  labelMembershipsDroppedUnknown: number;
  cancellations: number;
  cancellationsDroppedUnknownUser: number;
  wechatIdentities: number;
  wechatIdentitiesDroppedUnknownUser: number;
  wechatIdentitiesDroppedDuplicateOpenid: number;
  /** Accounts whose name collided and had to be renamed, for a human to check. */
  renamedAccounts: Array<{ uid: number; from: string; to: string }>;
}

export interface UserMigrationInput {
  users: readonly LegacyUser[];
  addresses?: readonly LegacyUserAddress[];
  groups?: readonly LegacyUserGroup[];
  labels?: readonly LegacyUserLabel[];
  labelCategories?: readonly LegacyUserLabelCategory[];
  labelRelations?: readonly LegacyUserLabelRelation[];
  cancellations?: readonly LegacyUserCancel[];
  wechatUsers?: readonly LegacyWechatUser[];
}

export interface UserMigrationOutput {
  users: UserRow[];
  addresses: UserAddressRow[];
  groups: UserGroupRow[];
  groupMemberships: UserGroupMapRow[];
  labelCategories: UserLabelCategoryRow[];
  labels: UserLabelRow[];
  labelMemberships: UserLabelMapRow[];
  cancellations: UserCancellationRow[];
  wechatIdentities: WechatIdentityRow[];
  /** The uids that survived, for the mappers that reference a customer. */
  keptUserIds: Set<number>;
  report: UserMigrationReport;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Legacy unix seconds; `0` is the legacy spelling of NULL. */
function instant(seconds: number): Date | null {
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

function text(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

const BCRYPT = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;
const MD5 = /^[a-f0-9]{32}$/i;

/**
 * What kind of hash `eb_user.pwd` holds.
 *
 * Anything that is neither — a truncated value, a stray `''`, something from a
 * hand-edited row — becomes no password at all rather than a credential nobody
 * can verify. Those accounts sign in with an SMS code, which is the same thing
 * the legacy 找回密码 flow would have made them do.
 */
export function passwordOf(pwd: string): { hash: string; algo: UserPasswordAlgo } | null {
  const value = (pwd ?? '').trim();
  if (BCRYPT.test(value)) return { hash: value, algo: 'bcrypt' };
  if (MD5.test(value)) return { hash: value.toLowerCase(), algo: 'md5_legacy' };
  return null;
}

/** `login_type` → where the account came from. `''` and anything unknown is `h5`. */
export function registerSourceOf(loginType: string): UserRegisterSource {
  if (loginType === 'wechat') return 'wechat_oa';
  if (loginType === 'routine') return 'wechat_mini';
  return 'h5';
}

/** Digits only, and only what could be a mainland mobile number. */
export function phoneOf(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return /^1\d{10}$/.test(digits) ? digits : null;
}

function statusOf(user: LegacyUser): UserStatus {
  return user.status === 1 ? 'active' : 'disabled';
}

/**
 * The account name, made unique and case-insensitively so.
 *
 * `eb_user.account` has no unique index in the legacy schema, and installs in
 * the wild do contain `Xiaoming` beside `xiaoming` — which `users_account_lower_uq`
 * refuses. The later row keeps its uid in its new name (`xiaoming_u42`) rather
 * than being dropped: an account with orders against it must survive, and a
 * name a human has to look at twice is better than a customer who disappears.
 */
function uniqueAccount(
  raw: string,
  uid: number,
  taken: Set<string>,
): { account: string; renamed: boolean } {
  const base = text(raw, 64) ?? `u${uid}`;
  if (!taken.has(base.toLowerCase())) return { account: base, renamed: false };
  const suffixed = `${base.slice(0, 56)}_u${uid}`;
  return { account: suffixed, renamed: true };
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

export function mapUsers(input: UserMigrationInput): UserMigrationOutput {
  const users: UserRow[] = [];
  const groupMemberships: UserGroupMapRow[] = [];
  const renamedAccounts: UserMigrationReport['renamedAccounts'] = [];
  const keptUserIds = new Set<number>();

  const takenAccounts = new Set<string>();
  const takenPhones = new Set<string>();
  const groupIds = new Set((input.groups ?? []).map((group) => group.id));

  let usersCancelled = 0;
  let usersWithoutPassword = 0;
  let usersWithLegacyMd5 = 0;
  let usersDroppedDuplicateAccount = 0;
  let usersDroppedDuplicatePhone = 0;

  for (const legacy of input.users) {
    const created = instant(legacy.add_time) ?? new Date(0);
    const password = passwordOf(legacy.pwd);
    if (password === null) usersWithoutPassword += 1;
    if (password?.algo === 'md5_legacy') usersWithLegacyMd5 += 1;

    const { account, renamed } = uniqueAccount(legacy.account, legacy.uid, takenAccounts);
    if (takenAccounts.has(account.toLowerCase())) {
      // The suffixed name collided too, which means the dump contains the same
      // uid twice. Nothing sensible left to do but count it.
      usersDroppedDuplicateAccount += 1;
      continue;
    }
    if (renamed) renamedAccounts.push({ uid: legacy.uid, from: legacy.account, to: account });

    let phone = phoneOf(legacy.phone);
    if (phone !== null && takenPhones.has(phone)) {
      // Two accounts on one number: `users_phone_lower_uq` allows exactly one,
      // and the first (lowest uid, the older account) keeps it. The other still
      // migrates — with its orders — it simply has to bind a number again.
      usersDroppedDuplicatePhone += 1;
      phone = null;
    }

    const cancelled = legacy.is_del === 1;
    if (cancelled) usersCancelled += 1;

    users.push({
      id: legacy.uid,
      account,
      phone,
      passwordHash: password?.hash ?? null,
      passwordAlgo: password?.algo ?? null,
      // Everybody starts at 1: no legacy session survives the migration anyway.
      passwordVersion: 1,
      nickname: text(legacy.nickname, 64),
      avatarUrl: text(legacy.avatar, 512),
      realName: text(legacy.real_name, 32),
      birthday: instant(legacy.birthday),
      adminRemark: text(legacy.mark, 255),
      status: statusOf(legacy),
      registerSource: registerSourceOf(legacy.login_type),
      registerIp: text(legacy.add_ip, 45),
      lastLoginAt: instant(legacy.last_time),
      lastLoginIp: text(legacy.last_ip, 45),
      createdAt: created,
      updatedAt: created,
      // A cancelled account is soft-deleted, never removed: orders, refunds and
      // invoices reference the uid.
      deletedAt: cancelled ? (instant(legacy.last_time) ?? created) : null,
    });

    takenAccounts.add(account.toLowerCase());
    if (phone !== null) takenPhones.add(phone);
    keptUserIds.add(legacy.uid);

    // The legacy single `group_id` becomes one membership row; `0` means none.
    if (legacy.group_id > 0 && groupIds.has(legacy.group_id)) {
      groupMemberships.push({ userId: legacy.uid, groupId: legacy.group_id });
    }
  }

  const groups: UserGroupRow[] = (input.groups ?? []).map((group, index) => ({
    id: group.id,
    name: text(group.group_name, 64) ?? `分组 ${group.id}`,
    sortOrder: index,
  }));

  const addresses: UserAddressRow[] = [];
  let addressesDroppedUnknownUser = 0;
  const defaultSeen = new Set<number>();
  for (const legacy of input.addresses ?? []) {
    if (!keptUserIds.has(legacy.uid)) {
      addressesDroppedUnknownUser += 1;
      continue;
    }
    const created = instant(legacy.add_time) ?? new Date(0);
    const deleted = legacy.is_del === 1;
    // `user_addresses_default_uq` allows one live default per user; the legacy
    // table has no such index and installs do contain two. The first wins.
    let isDefault = legacy.is_default === 1 && !deleted;
    if (isDefault && defaultSeen.has(legacy.uid)) isDefault = false;
    if (isDefault) defaultSeen.add(legacy.uid);

    addresses.push({
      id: legacy.id,
      userId: legacy.uid,
      receiverName: text(legacy.real_name, 32) ?? '收货人',
      receiverPhone: text(legacy.phone, 20) ?? '',
      provinceName: text(legacy.province, 64) ?? '',
      cityName: text(legacy.city, 64) ?? '',
      districtName: text(legacy.district, 64),
      // The legacy table stores only the city's division id, never the
      // province's or the district's, so the other two stay NULL.
      cityId: legacy.city_id > 0 ? legacy.city_id : null,
      detail: text(legacy.detail, 255) ?? '',
      postCode: legacy.post_code > 0 ? String(legacy.post_code) : null,
      lng: coordinate(legacy.longitude),
      lat: coordinate(legacy.latitude),
      isDefault,
      createdAt: created,
      updatedAt: created,
      deletedAt: deleted ? created : null,
    });
  }

  const labelResult = mapLabels(input);
  const cancellationResult = mapCancellations(input, keptUserIds);
  const wechatResult = mapWechatIdentities(input, keptUserIds);

  return {
    users,
    addresses,
    groups,
    groupMemberships,
    labelCategories: labelResult.categories,
    labels: labelResult.labels,
    labelMemberships: labelResult.memberships,
    cancellations: cancellationResult.rows,
    wechatIdentities: wechatResult.rows,
    keptUserIds,
    report: {
      users: users.length,
      usersCancelled,
      usersWithoutPassword,
      usersWithLegacyMd5,
      usersAccountRenamed: renamedAccounts.length,
      usersDroppedDuplicateAccount,
      usersDroppedDuplicatePhone,
      addresses: addresses.length,
      addressesDroppedUnknownUser,
      groups: groups.length,
      groupMemberships: groupMemberships.length,
      labelCategories: labelResult.categories.length,
      labelCategoriesSynthesised: labelResult.synthesised,
      labels: labelResult.labels.length,
      labelsDroppedDuplicateName: labelResult.droppedDuplicateName,
      labelMemberships: labelResult.memberships.length,
      labelMembershipsDroppedUnknown: labelResult.droppedMemberships,
      cancellations: cancellationResult.rows.length,
      cancellationsDroppedUnknownUser: cancellationResult.droppedUnknownUser,
      wechatIdentities: wechatResult.rows.length,
      wechatIdentitiesDroppedUnknownUser: wechatResult.droppedUnknownUser,
      wechatIdentitiesDroppedDuplicateOpenid: wechatResult.droppedDuplicateOpenid,
      renamedAccounts,
    },
  };
}

/** `'0'` is the legacy "no coordinate"; anything unparseable is dropped. */
function coordinate(raw: string): string | null {
  const value = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(value) || value === 0) return null;
  return value.toFixed(6);
}

function mapLabels(input: UserMigrationInput): {
  categories: UserLabelCategoryRow[];
  labels: UserLabelRow[];
  memberships: UserLabelMapRow[];
  synthesised: number;
  droppedDuplicateName: number;
  droppedMemberships: number;
} {
  const legacyLabels = input.labels ?? [];
  const known = new Map<number, UserLabelCategoryRow>();
  (input.labelCategories ?? []).forEach((category, index) => {
    known.set(category.id, {
      id: category.id,
      name: text(category.label_name, 64) ?? `分类 ${category.id}`,
      sortOrder: index,
    });
  });

  // `eb_user_label_cate` is missing from the dump, so a live export may not
  // have it either. Any category a label points at but nothing declares is
  // synthesised, which keeps the grouping the operator built.
  let synthesised = 0;
  for (const label of legacyLabels) {
    if (label.label_cate > 0 && !known.has(label.label_cate)) {
      known.set(label.label_cate, {
        id: label.label_cate,
        name: `分类 ${label.label_cate}`,
        sortOrder: known.size,
      });
      synthesised += 1;
    }
  }

  const labels: UserLabelRow[] = [];
  const takenNames = new Set<string>();
  const keptLabelIds = new Set<number>();
  let droppedDuplicateName = 0;
  legacyLabels.forEach((label, index) => {
    const name = text(label.label_name, 64) ?? `标签 ${label.id}`;
    if (takenNames.has(name.toLowerCase())) {
      // `user_labels_name_uq` is global, where the legacy name was unique only
      // inside its category. The second one is dropped and counted; its
      // memberships follow it, which is why the count is reported.
      droppedDuplicateName += 1;
      return;
    }
    takenNames.add(name.toLowerCase());
    keptLabelIds.add(label.id);
    labels.push({
      id: label.id,
      categoryId: label.label_cate > 0 ? label.label_cate : null,
      name,
      sortOrder: index,
    });
  });

  const memberships: UserLabelMapRow[] = [];
  const seen = new Set<string>();
  let droppedMemberships = 0;
  for (const relation of input.labelRelations ?? []) {
    const key = `${relation.uid}:${relation.label_id}`;
    if (!keptLabelIds.has(relation.label_id) || seen.has(key)) {
      droppedMemberships += 1;
      continue;
    }
    seen.add(key);
    memberships.push({ userId: relation.uid, labelId: relation.label_id });
  }

  return {
    categories: [...known.values()],
    labels,
    memberships,
    synthesised,
    droppedDuplicateName,
    droppedMemberships,
  };
}

function mapCancellations(
  input: UserMigrationInput,
  keptUserIds: ReadonlySet<number>,
): { rows: UserCancellationRow[]; droppedUnknownUser: number } {
  const rows: UserCancellationRow[] = [];
  const openPerUser = new Set<number>();
  let droppedUnknownUser = 0;

  for (const legacy of input.cancellations ?? []) {
    if (!keptUserIds.has(legacy.uid)) {
      droppedUnknownUser += 1;
      continue;
    }
    const created = instant(legacy.add_time) ?? new Date(0);
    let status: CancellationStatus =
      legacy.status === 1 ? 'approved' : legacy.status === 2 ? 'rejected' : 'pending';
    if (status === 'pending') {
      // `user_cancellation_requests_open_uq` allows one open request per
      // customer. A second open row in the legacy dump is carried over as
      // withdrawn rather than dropped, so the operator can still see it.
      if (openPerUser.has(legacy.uid)) status = 'withdrawn';
      else openPerUser.add(legacy.uid);
    }

    rows.push({
      id: legacy.id,
      userId: legacy.uid,
      nickname: text(legacy.name, 64),
      phone: text(legacy.phone, 20),
      // The legacy form had no reason field; `remark` is the operator's note.
      reason: null,
      status,
      reviewRemark: text(legacy.remark, 255),
      reviewedAt: status === 'pending' ? null : instant(legacy.up_time),
      createdAt: created,
      updatedAt: instant(legacy.up_time) ?? created,
    });
  }

  return { rows, droppedUnknownUser };
}

function mapWechatIdentities(
  input: UserMigrationInput,
  keptUserIds: ReadonlySet<number>,
): { rows: WechatIdentityRow[]; droppedUnknownUser: number; droppedDuplicateOpenid: number } {
  const rows: WechatIdentityRow[] = [];
  const takenOpenids = new Set<string>();
  const takenUsers = new Set<number>();
  let droppedUnknownUser = 0;
  let droppedDuplicateOpenid = 0;

  for (const legacy of input.wechatUsers ?? []) {
    const openid = text(legacy.openid, 64);
    if (openid === null || !keptUserIds.has(legacy.uid)) {
      droppedUnknownUser += 1;
      continue;
    }
    // Two unique indexes to respect: `(platform, openid)` and `(user, platform)`.
    if (takenOpenids.has(openid) || takenUsers.has(legacy.uid)) {
      droppedDuplicateOpenid += 1;
      continue;
    }
    takenOpenids.add(openid);
    takenUsers.add(legacy.uid);

    const created = instant(legacy.add_time) ?? new Date(0);
    rows.push({
      userId: legacy.uid,
      platform: 'oa',
      openid,
      unionid: text(legacy.unionid, 64),
      nickname: text(legacy.nickname, 64),
      avatarUrl: text(legacy.headimgurl, 512),
      subscribed: legacy.subscribe === 1,
      subscribedAt: instant(legacy.subscribe_time),
      createdAt: created,
      updatedAt: created,
    });
  }

  return { rows, droppedUnknownUser, droppedDuplicateOpenid };
}
