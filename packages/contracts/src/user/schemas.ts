import { z } from 'zod';
import {
  clientPlatform,
  id,
  instant,
  money,
  pageQuery,
  paged,
  sortQuery,
} from '../_conventions/common';

/**
 * Shapes shared by the user routes.
 *
 * The enums are the PostgreSQL enums of `db/src/schema/user.ts`, spelled the
 * same way and *not* imported from `@shop/db` — contracts are the bottom layer.
 * `user.service.ts` assigns one to the other and stops compiling if they drift.
 *
 * Deliberately absent, because the columns are gone with the features that used
 * them: balance, points, experience, member level, referrer / distribution
 * chain, sign-in streak, agent / staff flags. A customer here is an identity
 * with addresses, labels and invoice profiles — nothing more.
 */

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

/**
 * A mainland mobile number, digits only.
 *
 * `/^1[3-9]\d{9}$/`, the same rule the auth contracts apply. It is repeated
 * here rather than shared with the auth contracts because the two domains must
 * be able to move independently; the regex is three tokens long and a shared
 * constant would be a dependency for no gain.
 */
export const phoneNumber = z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确');

/** What an operator sees in a list: `138****8000`. Never the whole number. */
export const maskedPhone = z.string();

export const userStatus = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof userStatus>;

/** Where the account came from. `admin` means an operator typed it in. */
export const userRegisterSource = z.enum(['h5', 'wechat_oa', 'wechat_mini', 'admin']);
export type UserRegisterSource = z.infer<typeof userRegisterSource>;

/** Which WeChat app an identity belongs to. */
export const wechatPlatform = z.enum(['oa', 'mini']);
export type WechatPlatform = z.infer<typeof wechatPlatform>;

// ---------------------------------------------------------------------------
// storefront profile
// ---------------------------------------------------------------------------

/**
 * The shopper's own profile.
 *
 * `phone` is the real number, not the masked one: it is their own. The admin
 * list masks it because an operator browsing 10 000 customers has no business
 * reading every number, and a screenshot of that table used to be a leak.
 *
 * `hasPassword` exists because an account created by SMS code or by WeChat has
 * no password at all, and the 修改密码 screen must offer "set" rather than
 * "change" — asking for the old password would be unanswerable.
 */
export const userProfile = z.object({
  id,
  account: z.string(),
  phone: z.string().nullable(),
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  realName: z.string().nullable(),
  birthday: instant.nullable(),
  registerSource: userRegisterSource.nullable(),
  hasPassword: z.boolean(),
  /** Which WeChat apps this account is already bound to. */
  boundWechat: z.array(wechatPlatform),
  createdAt: instant,
});
export type UserProfile = z.infer<typeof userProfile>;

/**
 * What a shopper may change about themselves.
 *
 * Not the phone (that is `POST /api/v1/auth/phone`, which needs an SMS code)
 * and not the account name (it is the login identity). `avatarUrl` is a URL
 * returned by `POST /api/v1/uploads?purpose=avatar`, so the only way to set an
 * avatar is to have uploaded one through the storage domain.
 */
export const userProfileForm = z.object({
  nickname: z.string().min(1).max(64).optional(),
  avatarUrl: z.string().max(512).optional(),
  realName: z.string().max(32).optional(),
  birthday: instant.nullish(),
});
export type UserProfileForm = z.infer<typeof userProfileForm>;

// ---------------------------------------------------------------------------
// addresses
// ---------------------------------------------------------------------------

export const userAddress = z.object({
  id,
  receiverName: z.string(),
  receiverPhone: z.string(),
  provinceId: id.nullable(),
  cityId: id.nullable(),
  districtId: id.nullable(),
  provinceName: z.string(),
  cityName: z.string(),
  districtName: z.string().nullable(),
  detail: z.string(),
  postCode: z.string().nullable(),
  lng: z.string().nullable(),
  lat: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: instant,
  updatedAt: instant,
});
export type UserAddress = z.infer<typeof userAddress>;

/**
 * Create / update an address.
 *
 * The division *names* are required and the ids are optional, which is the
 * reverse of what a normalised design would ask for — but the uni-app picker
 * can return a hand-typed 海外 address with no division id, and refusing it
 * would make the shop unusable for exactly the customers who complain loudest.
 * The names are frozen at save time so renaming a district later does not
 * rewrite the delivery history.
 */
export const userAddressForm = z.object({
  receiverName: z.string().min(1).max(32),
  receiverPhone: phoneNumber,
  provinceId: id.optional(),
  cityId: id.optional(),
  districtId: id.optional(),
  provinceName: z.string().min(1).max(64),
  cityName: z.string().min(1).max(64),
  districtName: z.string().max(64).optional(),
  detail: z.string().min(1).max(255),
  postCode: z
    .string()
    .regex(/^\d{6}$/, '邮政编码为 6 位数字')
    .optional(),
  lng: z
    .string()
    .regex(/^-?\d{1,3}(\.\d{1,6})?$/, '经度格式不正确')
    .optional(),
  lat: z
    .string()
    .regex(/^-?\d{1,2}(\.\d{1,6})?$/, '纬度格式不正确')
    .optional(),
  /** The first address a customer saves becomes the default whatever this says. */
  isDefault: z.boolean().default(false),
});
export type UserAddressForm = z.infer<typeof userAddressForm>;

export const userAddressListQuery = pageQuery;
export const pagedUserAddresses = paged(userAddress);

// ---------------------------------------------------------------------------
// account cancellation
// ---------------------------------------------------------------------------

export const cancellationStatus = z.enum(['pending', 'approved', 'rejected', 'withdrawn']);
export type CancellationStatus = z.infer<typeof cancellationStatus>;

/**
 * One 注销申请.
 *
 * `nickname` and `phone` are frozen copies: approving a request anonymises the
 * `users` row, so a reviewer looking at the list afterwards would otherwise see
 * nothing but an id.
 */
export const cancellationRequest = z.object({
  id,
  userId: id,
  nickname: z.string().nullable(),
  phone: z.string().nullable(),
  reason: z.string().nullable(),
  status: cancellationStatus,
  reviewRemark: z.string().nullable(),
  reviewedAt: instant.nullable(),
  createdAt: instant,
});
export type CancellationRequest = z.infer<typeof cancellationRequest>;

export const cancellationRequestForm = z.object({
  reason: z.string().max(500).optional(),
});
export type CancellationRequestForm = z.infer<typeof cancellationRequestForm>;

export const cancellationReviewBody = z.object({
  remark: z.string().max(255).optional(),
});
export type CancellationReviewBody = z.infer<typeof cancellationReviewBody>;

export const cancellationRemarkBody = z.object({
  remark: z.string().max(255),
});
export type CancellationRemarkBody = z.infer<typeof cancellationRemarkBody>;

export const cancellationListQuery = pageQuery
  .extend({
    status: cancellationStatus.optional(),
    keyword: z.string().max(64).optional(),
  })
  .extend(sortQuery(['id', 'createdAt']).shape);
export type CancellationListQuery = z.infer<typeof cancellationListQuery>;

export const pagedCancellationRequests = paged(cancellationRequest);

// ---------------------------------------------------------------------------
// groups and labels
// ---------------------------------------------------------------------------

export const userGroup = z.object({
  id,
  name: z.string(),
  sortOrder: z.number().int(),
  /** How many customers are in it. The list is short; the count is what operators sort by. */
  memberCount: z.number().int().min(0),
  createdAt: instant,
});
export type UserGroup = z.infer<typeof userGroup>;

export const userGroupForm = z.object({
  name: z.string().min(1).max(64),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type UserGroupForm = z.infer<typeof userGroupForm>;

export const userGroupListQuery = pageQuery.extend(sortQuery(['id', 'name', 'sortOrder']).shape);
export const pagedUserGroups = paged(userGroup);

export const userLabelCategory = z.object({
  id,
  name: z.string(),
  sortOrder: z.number().int(),
  createdAt: instant,
});
export type UserLabelCategory = z.infer<typeof userLabelCategory>;

export const userLabelCategoryForm = z.object({
  name: z.string().min(1).max(64),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type UserLabelCategoryForm = z.infer<typeof userLabelCategoryForm>;

export const userLabelCategoryListQuery = pageQuery.extend(
  sortQuery(['id', 'name', 'sortOrder']).shape,
);
export const pagedUserLabelCategories = paged(userLabelCategory);

export const userLabel = z.object({
  id,
  categoryId: id.nullable(),
  categoryName: z.string().nullable(),
  name: z.string(),
  sortOrder: z.number().int(),
  memberCount: z.number().int().min(0),
  createdAt: instant,
});
export type UserLabel = z.infer<typeof userLabel>;

export const userLabelForm = z.object({
  categoryId: id.nullish(),
  name: z.string().min(1).max(64),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type UserLabelForm = z.infer<typeof userLabelForm>;

export const userLabelListQuery = pageQuery
  .extend({ categoryId: id.optional(), keyword: z.string().max(64).optional() })
  .extend(sortQuery(['id', 'name', 'sortOrder']).shape);
export type UserLabelListQuery = z.infer<typeof userLabelListQuery>;

export const pagedUserLabels = paged(userLabel);

// ---------------------------------------------------------------------------
// admin: customers
// ---------------------------------------------------------------------------

/** A group or label as it appears attached to a customer. */
export const namedRef = z.object({ id, name: z.string() });
export type NamedRef = z.infer<typeof namedRef>;

export const adminUserListItem = z.object({
  id,
  account: z.string(),
  /** Masked: `138****8000`. The unmasked number is on the detail route. */
  phone: maskedPhone.nullable(),
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  status: userStatus,
  registerSource: userRegisterSource.nullable(),
  groups: z.array(namedRef),
  labels: z.array(namedRef),
  lastLoginAt: instant.nullable(),
  createdAt: instant,
});
export type AdminUserListItem = z.infer<typeof adminUserListItem>;

/**
 * The detail drawer.
 *
 * The orders / coupons tabs are **not** here: they are the owning domains' own
 * admin list routes filtered by `userId`, so this domain never reads another
 * domain's tables and a change to the order list shape cannot break this page.
 */
export const adminUserDetail = adminUserListItem.extend({
  /** Unmasked, and only on this route — which carries its own permission. */
  phone: z.string().nullable(),
  realName: z.string().nullable(),
  birthday: instant.nullable(),
  adminRemark: z.string().nullable(),
  registerIp: z.string().nullable(),
  lastLoginIp: z.string().nullable(),
  hasPassword: z.boolean(),
  boundWechat: z.array(wechatPlatform),
  addressCount: z.number().int().min(0),
  /** Set once a cancellation request was approved; the row is kept for order history. */
  deletedAt: instant.nullable(),
  updatedAt: instant,
});
export type AdminUserDetail = z.infer<typeof adminUserDetail>;

/**
 * What an operator may edit.
 *
 * Not the phone: rebinding a number is the customer's own act, guarded by an
 * SMS code, and an operator who could silently repoint an account at their own
 * handset would own every account in the shop.
 */
export const adminUserForm = z.object({
  nickname: z.string().min(1).max(64).optional(),
  realName: z.string().max(32).optional(),
  birthday: instant.nullish(),
  adminRemark: z.string().max(255).optional(),
  groupIds: z.array(id).max(50).default([]),
  labelIds: z.array(id).max(50).default([]),
});
export type AdminUserForm = z.infer<typeof adminUserForm>;

export const adminUserListQuery = pageQuery
  .extend({
    /** Matches account, phone, nickname or real name. */
    keyword: z.string().max(64).optional(),
    groupId: id.optional(),
    labelId: id.optional(),
    status: userStatus.optional(),
    registerSource: userRegisterSource.optional(),
    /** Registration window, inclusive of both ends. */
    createdFrom: instant.optional(),
    createdTo: instant.optional(),
    /**
     * `true` = only accounts with a bound WeChat identity, `false` = only those
     * without.
     *
     * Spelled as the two literal strings rather than `z.coerce.boolean()`,
     * which turns the string `"false"` — the only way a query string can say
     * false — into `true`, so the "未绑定" filter would have silently shown the
     * bound accounts.
     */
    hasWechat: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .extend(sortQuery(['id', 'createdAt', 'lastLoginAt']).shape);
export type AdminUserListQuery = z.infer<typeof adminUserListQuery>;

export const pagedAdminUsers = paged(adminUserListItem);

export const adminUserStatusBody = z.object({
  status: userStatus,
});
export type AdminUserStatusBody = z.infer<typeof adminUserStatusBody>;

/**
 * Operator-set password.
 *
 * There is no "send the customer their new password" — the operator reads it
 * out. Either way every live session of that account dies, which is the point:
 * a reset is what support does when an account is suspected stolen.
 */
export const adminUserPasswordBody = z.object({
  password: z.string().min(6).max(64),
});
export type AdminUserPasswordBody = z.infer<typeof adminUserPasswordBody>;

/** Batch set group / label membership from the list's selection. */
export const adminUserBatchGroupBody = z.object({
  userIds: z.array(id).min(1).max(500),
  groupIds: z.array(id).max(50),
  /** `replace` overwrites the membership, `add` unions it, `remove` subtracts it. */
  mode: z.enum(['replace', 'add', 'remove']).default('replace'),
});
export type AdminUserBatchGroupBody = z.infer<typeof adminUserBatchGroupBody>;

export const adminUserBatchLabelBody = z.object({
  userIds: z.array(id).min(1).max(500),
  labelIds: z.array(id).max(50),
  mode: z.enum(['replace', 'add', 'remove']).default('replace'),
});
export type AdminUserBatchLabelBody = z.infer<typeof adminUserBatchLabelBody>;

export const batchResult = z.object({
  affected: z.number().int().min(0),
});
export type BatchResult = z.infer<typeof batchResult>;

// ---------------------------------------------------------------------------
// examples
// ---------------------------------------------------------------------------

export const userProfileExample: UserProfile = {
  id: '1001',
  account: '13800138000',
  phone: '13800138000',
  nickname: '小明',
  avatarUrl: 'https://cdn.example.com/2026/09/a1b2c3d4.png',
  realName: null,
  birthday: null,
  registerSource: 'h5',
  hasPassword: true,
  boundWechat: [],
  createdAt: '2026-01-05T10:00:00+08:00',
};

export const userAddressExample: UserAddress = {
  id: '5001',
  receiverName: '张三',
  receiverPhone: '13800138000',
  provinceId: '110000',
  cityId: '110100',
  districtId: '110105',
  provinceName: '北京市',
  cityName: '北京市',
  districtName: '朝阳区',
  detail: '建国路 88 号 SOHO 尚都 1201',
  postCode: '100022',
  lng: '116.472644',
  lat: '39.913423',
  isDefault: true,
  createdAt: '2026-01-06T09:00:00+08:00',
  updatedAt: '2026-01-06T09:00:00+08:00',
};

export const cancellationRequestExample: CancellationRequest = {
  id: '31',
  userId: '1001',
  nickname: '小明',
  phone: '138****8000',
  reason: '不再使用了',
  status: 'pending',
  reviewRemark: null,
  reviewedAt: null,
  createdAt: '2026-09-01T14:20:00+08:00',
};

export const userGroupExample: UserGroup = {
  id: '3',
  name: '高价值客户',
  sortOrder: 10,
  memberCount: 128,
  createdAt: '2026-01-01T10:00:00+08:00',
};

export const userLabelCategoryExample: UserLabelCategory = {
  id: '2',
  name: '消费偏好',
  sortOrder: 0,
  createdAt: '2026-01-01T10:00:00+08:00',
};

export const userLabelExample: UserLabel = {
  id: '7',
  categoryId: '2',
  categoryName: '消费偏好',
  name: '母婴',
  sortOrder: 0,
  memberCount: 42,
  createdAt: '2026-01-01T10:05:00+08:00',
};

export const adminUserListItemExample: AdminUserListItem = {
  id: '1001',
  account: '13800138000',
  phone: '138****8000',
  nickname: '小明',
  avatarUrl: 'https://cdn.example.com/2026/09/a1b2c3d4.png',
  status: 'active',
  registerSource: 'h5',
  groups: [{ id: '3', name: '高价值客户' }],
  labels: [{ id: '7', name: '母婴' }],
  lastLoginAt: '2026-09-20T08:31:00+08:00',
  createdAt: '2026-01-05T10:00:00+08:00',
};

export const adminUserDetailExample: AdminUserDetail = {
  ...adminUserListItemExample,
  phone: '13800138000',
  realName: null,
  birthday: null,
  adminRemark: null,
  registerIp: '203.0.113.7',
  lastLoginIp: '203.0.113.9',
  hasPassword: true,
  boundWechat: ['mini'],
  addressCount: 2,
  deletedAt: null,
  updatedAt: '2026-09-20T08:31:00+08:00',
};

// ---------------------------------------------------------------------------
// staff: 商家管理 → 用户
// ---------------------------------------------------------------------------

/**
 * What a 店员 may see of a customer.
 *
 * This is the one decision in the staff surface that is not a copy of the admin
 * one. The console's 用户详情 carries the unmasked phone, the address book, the
 * registration IP, the operator remark and the account controls, and none of
 * that belongs on the phone of everyone the shop owner has made staff. A phone
 * in a shop assistant's hand is a different threat model from a console behind
 * an office login — the handset is shared, left on a counter and not revoked
 * when somebody stops working there.
 *
 * So the staff shapes are an allow-list, not the admin shape minus a few
 * fields, and everything below was chosen for a reason:
 *
 * | Field | Why a 店员 needs it |
 * | --- | --- |
 * | `nickname`, `avatarUrl` | recognise the customer standing in front of them |
 * | `phone` (masked) | read the last four digits back to confirm identity |
 * | `groups`, `labels` | the two drawers this surface exists for |
 * | `orderCount`, `spendTotal` | decide whether to offer the 会员 discount |
 * | `status` | explain why a customer cannot place an order — read-only |
 * | `createdAt` | 老客 or new, the other half of the same judgement |
 *
 * Absent on purpose: the unmasked phone, `account` (which *is* the phone for
 * every phone-registered customer, so returning it would undo the mask),
 * `realName`, `birthday`, `registerIp` / `lastLoginIp`, `adminRemark`,
 * `addressCount` and the address book, `boundWechat`, `hasPassword`.
 */
export const staffUserListItem = z.object({
  id,
  nickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** `138****8000`, always. There is no staff route that unmasks it. */
  phone: maskedPhone.nullable(),
  status: userStatus,
  groups: z.array(namedRef),
  labels: z.array(namedRef),
  /**
   * Paid orders and what they came to, or `null`.
   *
   * `null` is not zero: it means the order domain has not registered
   * `UserOrderStatsPort` in this deployment, and a client must render 「--」
   * rather than 「0 单」. A customer with no orders is `0` / `"0.00"`.
   */
  orderCount: z.number().int().min(0).nullable(),
  spendTotal: money.nullable(),
  createdAt: instant,
});
export type StaffUserListItem = z.infer<typeof staffUserListItem>;

/**
 * 用户详情 for a 店员 — deliberately the same shape as one row of the list.
 *
 * There is no extra field behind the tap. The detail route exists because
 * `pages/admin/user/index.vue` is reached from a scan or a notification with
 * only a uid in hand, not because there is more to show.
 */
export const staffUserDetail = staffUserListItem;
export type StaffUserDetail = z.infer<typeof staffUserDetail>;

export const staffUserListQuery = pageQuery.extend({
  /**
   * Matches the nickname or the **whole** phone number.
   *
   * A 店员 types the number the customer reads out, so the search takes all
   * eleven digits — but not a fragment of them: `ilike '%1380%'` over a phone
   * column is a way to enumerate the customer base four digits at a time, which
   * is exactly what masking the column is meant to prevent. `account` and
   * `realName` are not searched at all (the console searches both).
   */
  keyword: z.string().max(64).optional(),
  groupId: id.optional(),
  labelId: id.optional(),
});
export type StaffUserListQuery = z.infer<typeof staffUserListQuery>;

export const pagedStaffUsers = paged(staffUserListItem);

/** The group picker: every group, shortest form, no member counts. */
export const staffUserGroups = z.object({
  items: z.array(z.object({ id, name: z.string() })),
});
export type StaffUserGroups = z.infer<typeof staffUserGroups>;

/**
 * The 标签 drawer: the whole catalogue, grouped by category, with this
 * customer's labels flagged.
 *
 * One request, because the drawer needs both halves to draw a single chip and
 * two requests would let them disagree. Labels with no category come back under
 * a group whose `categoryId` is `null`.
 */
export const staffUserLabels = z.object({
  categories: z.array(
    z.object({
      categoryId: id.nullable(),
      categoryName: z.string().nullable(),
      labels: z.array(z.object({ id, name: z.string(), assigned: z.boolean() })),
    }),
  ),
});
export type StaffUserLabels = z.infer<typeof staffUserLabels>;

/**
 * 设置分组 — the customer ends up in exactly this group, or in none.
 *
 * The console's route is a batch with a `replace` / `add` / `remove` mode over
 * many customers and many groups; this is one customer and one group, because
 * the drawer is a radio picker (`pages/admin/user/index.vue` binds a
 * `<picker>`). `null` is 未分组 and is how a 店员 undoes a mistake — without it
 * the only way out of a wrong group would be the web console.
 */
export const staffUserGroupBody = z.object({
  groupId: id.nullable(),
});
export type StaffUserGroupBody = z.infer<typeof staffUserGroupBody>;

/**
 * 设置标签 — the customer's labels become exactly this set.
 *
 * Plural, not `{ labelId }`, because the drawer submits the whole selection on
 * 确定 (`components/userLable/index.vue` builds a `labelIds` array) and a
 * singular field has no way to say "take this one off". An empty array clears
 * them.
 */
export const staffUserLabelBody = z.object({
  labelIds: z.array(id).max(50),
});
export type StaffUserLabelBody = z.infer<typeof staffUserLabelBody>;

export const staffUserListItemExample: StaffUserListItem = {
  id: '1001',
  nickname: '小明',
  avatarUrl: 'https://cdn.example.com/2026/09/a1b2c3d4.png',
  phone: '138****8000',
  status: 'active',
  groups: [{ id: '3', name: '高价值客户' }],
  labels: [{ id: '7', name: '母婴' }],
  orderCount: 12,
  spendTotal: '3980.00',
  createdAt: '2026-01-05T10:00:00+08:00',
};

export const staffUserLabelsExample: StaffUserLabels = {
  categories: [
    {
      categoryId: '2',
      categoryName: '消费偏好',
      labels: [
        { id: '7', name: '母婴', assigned: true },
        { id: '8', name: '数码', assigned: false },
      ],
    },
    {
      categoryId: null,
      categoryName: null,
      labels: [{ id: '9', name: '未分类标签', assigned: false }],
    },
  ],
};

// ---------------------------------------------------------------------------
// the visits beacon
// ---------------------------------------------------------------------------

/**
 * One storefront page view.
 *
 * `path` is the **route**, not the URL: no origin, no query string, and no
 * fragment. Two reasons. A query string carries `?code=` from the WeChat OAuth
 * redirect and `?phone=` from a share link, so storing it turns an analytics
 * table into a credential log that nobody remembers to purge. And 访客数 is
 * grouped by path: with the query string attached, one product page becomes one
 * row per referrer and the 热门页面 list is noise.
 *
 * The visitor is never named in the body. Who they are is the bearer token, or
 * — for somebody who has not signed in — the address the request came from,
 * both read off the request by the server. A `userId` a client could put in a
 * beacon body would let anybody write page views onto anybody's account.
 */
export const visitBody = z.object({
  path: z
    .string()
    .min(1)
    .max(255)
    .regex(/^\/[^?#\s]*$/, '页面路径格式不正确'),
  /** Omitted means "whatever `X-Client-Platform` said", which is the usual case. */
  platform: clientPlatform.optional(),
});
export type VisitBody = z.infer<typeof visitBody>;
