import type { AdminUserForm, UserAddressForm } from '@shop/contracts/user/schemas';
import { admins } from '@shop/db/schema/auth';
import { users } from '@shop/db/schema/user';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainError } from '../kernel/errors';
import type { Actor, Ctx } from '../kernel/context';
import { storefrontAuthConfig } from './storefront-auth.config';
import * as admin from './user-admin.service';
import * as repo from './user.repo';
import * as service from './user.service';

/**
 * The user domain against a real PostgreSQL 17.
 *
 * Everything here needs the database to mean anything: the two expression
 * unique indexes on `lower(account)` / `lower(phone)`, the two partial unique
 * indexes (one live default address, one open cancellation request), and every
 * `conditionalUpdate` whose answer is a row count. The races live next door in
 * `user.concurrency.int.test.ts`; the sign-in flows in
 * `storefront-auth.int.test.ts`.
 */

let harness: TestCtx;

const NOW = '2026-06-01T00:00:00.000Z';

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  harness.clock.set(NOW);
  reviewerId = await makeAdmin();
});

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const userActor = (id: number): Actor => ({ kind: 'user', id, permissions: [], isSuper: false });

function asUser(id: number): Ctx {
  return harness.as(userActor(id));
}

/**
 * A real `admins` row, because `user_cancellation_requests.reviewed_by_admin_id`
 * is a foreign key — an actor id invented in the test passes every assertion in
 * the service and then fails at the database.
 */
let reviewerId = 0;

function asAdmin(): Ctx {
  return harness.as({ kind: 'admin', id: reviewerId, permissions: [], isSuper: true });
}

async function makeAdmin(): Promise<number> {
  const [row] = await harness.ctx.db
    .insert(admins)
    .values({
      account: `reviewer-${Date.now()}`,
      passwordHash: 'x',
      name: '审核员',
      createdAt: harness.clock.now(),
      updatedAt: harness.clock.now(),
    })
    .returning({ id: admins.id });
  return row!.id;
}

let sequence = 0;

async function makeUser(overrides: Partial<repo.InsertUserInput> = {}): Promise<repo.UserRow> {
  sequence += 1;
  const phone = `1380013${String(8000 + sequence).padStart(4, '0')}`;
  const row = await harness.ctx.withTx((tx) =>
    repo.insertUser(tx, {
      account: phone,
      phone,
      passwordHash: null,
      passwordAlgo: null,
      nickname: `用户${sequence}`,
      avatarUrl: null,
      registerSource: 'h5',
      registerIp: null,
      now: harness.clock.now(),
      ...overrides,
    }),
  );
  if (!row) throw new Error('fixture: insertUser refused');
  return row;
}

const addressForm = (overrides: Partial<UserAddressForm> = {}): UserAddressForm => ({
  receiverName: '张三',
  receiverPhone: '13800138000',
  provinceName: '北京市',
  cityName: '北京市',
  districtName: '朝阳区',
  detail: '建国路 88 号',
  isDefault: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

describe('account uniqueness', () => {
  it('is case-insensitive on the account name', async () => {
    // INVARIANT USER-014. `users_account_lower_uq` is an expression index; a
    // plain UNIQUE would let `Xiaoming` and `xiaoming` both exist and turn
    // sign-in into a coin flip.
    await makeUser({ account: 'Xiaoming', phone: null });
    const second = await harness.ctx.withTx((tx) =>
      repo.insertUser(tx, {
        account: 'xiaoming',
        phone: null,
        passwordHash: null,
        passwordAlgo: null,
        nickname: null,
        avatarUrl: null,
        registerSource: 'h5',
        registerIp: null,
        now: harness.clock.now(),
      }),
    );
    expect(second).toBeNull();
  });

  it('finds an account whichever case the shopper typed', async () => {
    const created = await makeUser({ account: 'XiaoMing', phone: null });
    const found = await repo.findByAccountOrPhone(harness.ctx.db, '  xIAOmING ');
    expect(found?.id).toBe(created.id);
  });

  it('matches the phone column too, because customers type their number', async () => {
    const created = await makeUser();
    const found = await repo.findByAccountOrPhone(harness.ctx.db, created.phone!);
    expect(found?.id).toBe(created.id);
  });
});

describe('findAuthState', () => {
  it('reports a cancelled account as inactive, not as missing', async () => {
    // `resolve()` refuses on `status !== 1`, so a soft-deleted row must not
    // read as active. Reporting it as *missing* would be equally safe here but
    // makes the admin detail screen lie.
    const user = await makeUser();
    await harness.ctx.withTx((tx) =>
      repo.anonymise(tx, {
        id: user.id,
        account: 'del_0000000000000000',
        now: harness.clock.now(),
      }),
    );
    const state = await repo.findAuthState(harness.ctx.db, user.id);
    expect(state).toMatchObject({ id: user.id, status: 0 });
  });
});

// ---------------------------------------------------------------------------
// profile
// ---------------------------------------------------------------------------

describe('profile', () => {
  it('reports whether a password and a WeChat binding exist', async () => {
    const user = await makeUser();
    const profile = await service.getProfile(asUser(user.id));
    expect(profile).toMatchObject({ hasPassword: false, boundWechat: [] });

    await harness.ctx.withTx((tx) =>
      repo.insertIdentity(tx, {
        userId: user.id,
        platform: 'mini',
        openid: 'o_mini_1',
        unionid: null,
        nickname: null,
        avatarUrl: null,
        now: harness.clock.now(),
      }),
    );
    const after = await service.getProfile(asUser(user.id));
    expect(after.boundWechat).toEqual(['mini']);
  });

  it('clears the birthday on an explicit null and leaves it on absence', async () => {
    const user = await makeUser();
    await service.updateProfile(asUser(user.id), { birthday: '2000-05-04T00:00:00+08:00' });
    expect((await service.getProfile(asUser(user.id))).birthday).not.toBeNull();

    await service.updateProfile(asUser(user.id), { nickname: '小明' });
    expect((await service.getProfile(asUser(user.id))).birthday).not.toBeNull();

    await service.updateProfile(asUser(user.id), { birthday: null });
    expect((await service.getProfile(asUser(user.id))).birthday).toBeNull();
  });

  it('refuses to read a cancelled account', async () => {
    const user = await makeUser();
    await harness.ctx.withTx((tx) =>
      repo.anonymise(tx, {
        id: user.id,
        account: 'del_1111111111111111',
        now: harness.clock.now(),
      }),
    );
    await expect(service.getProfile(asUser(user.id))).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// addresses
// ---------------------------------------------------------------------------

describe('addresses', () => {
  it('makes the first one the default whatever the form said', async () => {
    const user = await makeUser();
    const first = await service.addressCreate(asUser(user.id), addressForm({ isDefault: false }));
    expect(first.isDefault).toBe(true);
  });

  it('moves the default rather than ending up with two', async () => {
    const user = await makeUser();
    const first = await service.addressCreate(asUser(user.id), addressForm());
    const second = await service.addressCreate(
      asUser(user.id),
      addressForm({ receiverName: '李四', isDefault: true }),
    );

    expect(second.isDefault).toBe(true);
    const list = await service.addressList(asUser(user.id), { page: 1, pageSize: 20 });
    expect(list.items.filter((a) => a.isDefault)).toHaveLength(1);
    expect(list.items.find((a) => a.id === first.id)?.isDefault).toBe(false);
  });

  it('keeps the default flag when the default address is edited', async () => {
    const user = await makeUser();
    const created = await service.addressCreate(asUser(user.id), addressForm());
    const updated = await service.addressUpdate(
      asUser(user.id),
      { id: created.id },
      addressForm({ detail: '建国路 99 号', isDefault: false }),
    );
    expect(updated.isDefault).toBe(true);
    expect(updated.detail).toBe('建国路 99 号');
  });

  it('never returns another customer’s address', async () => {
    // Every address read carries the owner in the WHERE; an IDOR here is a
    // home address leak.
    const owner = await makeUser();
    const stranger = await makeUser();
    const address = await service.addressCreate(asUser(owner.id), addressForm());

    await expect(
      service.addressDetail(asUser(stranger.id), { id: address.id }),
    ).rejects.toMatchObject({ code: 'USER_ADDRESS_NOT_FOUND' });
    await expect(
      service.addressDelete(asUser(stranger.id), { id: address.id }),
    ).rejects.toMatchObject({ code: 'USER_ADDRESS_NOT_FOUND' });
  });

  it('soft-deletes, frees the default slot, and stops listing it', async () => {
    const user = await makeUser();
    const created = await service.addressCreate(asUser(user.id), addressForm());
    await service.addressDelete(asUser(user.id), { id: created.id });

    expect(await service.defaultAddress(asUser(user.id))).toEqual({ address: null });
    expect((await service.addressList(asUser(user.id), { page: 1, pageSize: 20 })).total).toBe(0);
    // A second address may now take the default slot: the partial unique index
    // is `where is_default and deleted_at is null`.
    const replacement = await service.addressCreate(asUser(user.id), addressForm());
    expect(replacement.isDefault).toBe(true);
  });

  it('enforces the configured limit', async () => {
    const user = await makeUser();
    await harness.ctx.config.set(storefrontAuthConfig, { addressLimit: 2 });
    await service.addressCreate(asUser(user.id), addressForm());
    await service.addressCreate(asUser(user.id), addressForm());
    await expect(service.addressCreate(asUser(user.id), addressForm())).rejects.toMatchObject({
      code: 'USER_ADDRESS_LIMIT_REACHED',
    });
  });
});

// ---------------------------------------------------------------------------
// cancellation
// ---------------------------------------------------------------------------

describe('account cancellation', () => {
  it('allows only one open request per customer', async () => {
    const user = await makeUser();
    await service.requestCancellation(asUser(user.id), { reason: '不再使用了' });
    await expect(service.requestCancellation(asUser(user.id), {})).rejects.toMatchObject({
      code: 'USER_CANCELLATION_PENDING',
    });
  });

  it('lets a customer withdraw and then ask again', async () => {
    const user = await makeUser();
    await service.requestCancellation(asUser(user.id), {});
    const withdrawn = await service.withdrawCancellation(asUser(user.id));
    expect(withdrawn.status).toBe('withdrawn');
    expect(await service.currentCancellation(asUser(user.id))).toEqual({ request: null });
    await expect(service.requestCancellation(asUser(user.id), {})).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('freezes the nickname and phone so the reviewer still sees a person', async () => {
    const user = await makeUser();
    const request = await service.requestCancellation(asUser(user.id), {});
    await admin.adminApproveCancellation(asAdmin(), { id: request.id }, {});
    const after = await repo.findCancellation(harness.ctx.db, Number(request.id));
    expect(after).toMatchObject({ nickname: user.nickname, phone: user.phone });
  });

  it('anonymises on approval and never deletes the row', async () => {
    const user = await makeUser();
    const request = await service.requestCancellation(asUser(user.id), {});
    const decided = await admin.adminApproveCancellation(
      asAdmin(),
      { id: request.id },
      { remark: '已核对无未完成订单' },
    );
    expect(decided.status).toBe('approved');

    const [row] = await harness.ctx.db.select().from(users).where(eq(users.id, user.id));
    expect(row).toBeDefined();
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.phone).toBeNull();
    expect(row!.nickname).toBeNull();
    expect(row!.passwordHash).toBeNull();
    expect(row!.status).toBe('disabled');
    // The old account name must stop occupying `users_account_lower_uq`, so
    // the same person can register again tomorrow.
    expect(row!.account).toMatch(/^del_[0-9a-f]{16}$/);
    expect(row!.passwordVersion).toBeGreaterThan(user.passwordVersion);
  });

  it('frees the phone number for a fresh registration', async () => {
    const user = await makeUser();
    const phone = user.phone!;
    const request = await service.requestCancellation(asUser(user.id), {});
    await admin.adminApproveCancellation(asAdmin(), { id: request.id }, {});

    const reborn = await harness.ctx.withTx((tx) =>
      repo.insertUser(tx, {
        account: phone,
        phone,
        passwordHash: null,
        passwordAlgo: null,
        nickname: null,
        avatarUrl: null,
        registerSource: 'h5',
        registerIp: null,
        now: harness.clock.now(),
      }),
    );
    expect(reborn).not.toBeNull();
    expect(reborn!.id).not.toBe(user.id);
  });

  it('refuses to decide a request that is no longer pending', async () => {
    const user = await makeUser();
    const request = await service.requestCancellation(asUser(user.id), {});
    await admin.adminApproveCancellation(asAdmin(), { id: request.id }, {});
    await expect(
      admin.adminRejectCancellation(asAdmin(), { id: request.id }, {}),
    ).rejects.toMatchObject({ code: 'USER_CANCELLATION_NOT_PENDING' });
  });
});

// ---------------------------------------------------------------------------
// admin: list, edit, status
// ---------------------------------------------------------------------------

describe('admin list', () => {
  it('masks the phone number in the list and not in the detail', async () => {
    const user = await makeUser({ account: '13800138111', phone: '13800138111' });
    const list = await admin.adminList(asAdmin(), { page: 1, pageSize: 20 });
    expect(list.items[0]?.phone).toBe('138****8111');

    const detail = await admin.adminDetail(asAdmin(), { id: String(user.id) });
    expect(detail.phone).toBe('13800138111');
  });

  it('filters by keyword, status, source and WeChat binding', async () => {
    const plain = await makeUser({ nickname: '小明' });
    const bound = await makeUser({ nickname: '小红', registerSource: 'wechat_mini' });
    await harness.ctx.withTx((tx) =>
      repo.insertIdentity(tx, {
        userId: bound.id,
        platform: 'mini',
        openid: 'o_filter',
        unionid: null,
        nickname: null,
        avatarUrl: null,
        now: harness.clock.now(),
      }),
    );

    const byKeyword = await admin.adminList(asAdmin(), { page: 1, pageSize: 20, keyword: '小红' });
    expect(byKeyword.items.map((u) => u.id)).toEqual([String(bound.id)]);

    const withWechat = await admin.adminList(asAdmin(), { page: 1, pageSize: 20, hasWechat: true });
    expect(withWechat.items.map((u) => u.id)).toEqual([String(bound.id)]);

    const withoutWechat = await admin.adminList(asAdmin(), {
      page: 1,
      pageSize: 20,
      hasWechat: false,
    });
    expect(withoutWechat.items.map((u) => u.id)).toEqual([String(plain.id)]);

    const bySource = await admin.adminList(asAdmin(), {
      page: 1,
      pageSize: 20,
      registerSource: 'wechat_mini',
    });
    expect(bySource.total).toBe(1);
  });

  it('hides cancelled accounts from the list', async () => {
    const user = await makeUser();
    await harness.ctx.withTx((tx) =>
      repo.anonymise(tx, {
        id: user.id,
        account: 'del_2222222222222222',
        now: harness.clock.now(),
      }),
    );
    expect((await admin.adminList(asAdmin(), { page: 1, pageSize: 20 })).total).toBe(0);
  });
});

describe('admin edit', () => {
  const form = (overrides: Partial<AdminUserForm> = {}): AdminUserForm => ({
    groupIds: [],
    labelIds: [],
    ...overrides,
  });

  it('replaces group and label membership rather than adding to it', async () => {
    const user = await makeUser();
    const vip = await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });
    const lapsed = await admin.groupCreate(asAdmin(), { name: '沉睡', sortOrder: 1 });

    await admin.adminUpdate(asAdmin(), { id: String(user.id) }, form({ groupIds: [vip.id] }));
    await admin.adminUpdate(asAdmin(), { id: String(user.id) }, form({ groupIds: [lapsed.id] }));

    const detail = await admin.adminDetail(asAdmin(), { id: String(user.id) });
    expect(detail.groups.map((g) => g.id)).toEqual([lapsed.id]);
  });

  it('refuses a group id that does not exist rather than silently dropping it', async () => {
    const user = await makeUser();
    await expect(
      admin.adminUpdate(asAdmin(), { id: String(user.id) }, form({ groupIds: ['999999'] })),
    ).rejects.toMatchObject({ code: 'USER_GROUP_NOT_FOUND' });
  });
});

describe('admin status and password', () => {
  it('bumps the password version when disabling, so live tokens die', async () => {
    const user = await makeUser();
    await admin.adminSetStatus(asAdmin(), { id: String(user.id) }, { status: 'disabled' });
    const after = await repo.findById(harness.ctx.db, user.id);
    expect(after!.status).toBe('disabled');
    expect(after!.passwordVersion).toBe(user.passwordVersion + 1);
    expect(await repo.findAuthState(harness.ctx.db, user.id)).toMatchObject({ status: 0 });
  });

  it('is idempotent on a status that is already set', async () => {
    const user = await makeUser();
    await admin.adminSetStatus(asAdmin(), { id: String(user.id) }, { status: 'disabled' });
    const once = await repo.findById(harness.ctx.db, user.id);
    await admin.adminSetStatus(asAdmin(), { id: String(user.id) }, { status: 'disabled' });
    const twice = await repo.findById(harness.ctx.db, user.id);
    expect(twice!.passwordVersion).toBe(once!.passwordVersion);
  });

  it('rejects a weak operator-set password before hashing it', async () => {
    const user = await makeUser();
    await expect(
      admin.adminResetPassword(asAdmin(), { id: String(user.id) }, { password: '123456' }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe('admin batch membership', () => {
  it('refuses the whole batch when a target id is unknown', async () => {
    // Skipping the unknown ids silently is how an operator comes to believe
    // 500 customers were tagged when 3 were.
    const user = await makeUser();
    const group = await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });
    await expect(
      admin.adminBatchSetGroups(asAdmin(), {
        userIds: [String(user.id), '999999'],
        groupIds: [group.id],
        mode: 'add',
      }),
    ).rejects.toMatchObject({ code: 'USER_BATCH_TARGET_UNKNOWN' });
  });

  it('adds, removes and replaces', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const vip = await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });
    const lapsed = await admin.groupCreate(asAdmin(), { name: '沉睡', sortOrder: 1 });
    const ids = [String(a.id), String(b.id)];

    const added = await admin.adminBatchSetGroups(asAdmin(), {
      userIds: ids,
      groupIds: [vip.id, lapsed.id],
      mode: 'add',
    });
    expect(added.affected).toBe(2);

    await admin.adminBatchSetGroups(asAdmin(), {
      userIds: ids,
      groupIds: [lapsed.id],
      mode: 'remove',
    });
    expect((await admin.adminDetail(asAdmin(), { id: String(a.id) })).groups).toHaveLength(1);

    await admin.adminBatchSetGroups(asAdmin(), { userIds: ids, groupIds: [], mode: 'replace' });
    expect((await admin.adminDetail(asAdmin(), { id: String(a.id) })).groups).toHaveLength(0);
  });

  it('is repeatable — adding the same group twice is one membership', async () => {
    const user = await makeUser();
    const vip = await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });
    await admin.adminBatchSetGroups(asAdmin(), {
      userIds: [String(user.id)],
      groupIds: [vip.id],
      mode: 'add',
    });
    await admin.adminBatchSetGroups(asAdmin(), {
      userIds: [String(user.id)],
      groupIds: [vip.id],
      mode: 'add',
    });
    expect((await admin.adminDetail(asAdmin(), { id: String(user.id) })).groups).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// taxonomy
// ---------------------------------------------------------------------------

describe('groups and labels', () => {
  it('refuses a duplicate name on create and on rename', async () => {
    await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });
    await expect(admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 })).rejects.toMatchObject(
      {
        code: 'USER_GROUP_NAME_TAKEN',
      },
    );

    const other = await admin.groupCreate(asAdmin(), { name: '沉睡', sortOrder: 1 });
    await expect(
      admin.groupUpdate(asAdmin(), { id: other.id }, { name: 'VIP', sortOrder: 1 }),
    ).rejects.toMatchObject({ code: 'USER_GROUP_NAME_TAKEN' });
  });

  it('counts members', async () => {
    const user = await makeUser();
    const group = await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });
    await admin.adminBatchSetGroups(asAdmin(), {
      userIds: [String(user.id)],
      groupIds: [group.id],
      mode: 'add',
    });
    const list = await admin.groupList(asAdmin(), { page: 1, pageSize: 20 });
    expect(list.items[0]?.memberCount).toBe(1);
  });

  it('takes the memberships with the group and leaves the customers', async () => {
    const user = await makeUser();
    const group = await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });
    await admin.adminBatchSetGroups(asAdmin(), {
      userIds: [String(user.id)],
      groupIds: [group.id],
      mode: 'add',
    });
    await admin.groupDelete(asAdmin(), { id: group.id });
    expect(await repo.findById(harness.ctx.db, user.id)).not.toBeNull();
    expect((await admin.adminDetail(asAdmin(), { id: String(user.id) })).groups).toHaveLength(0);
  });

  it('keeps labels when their category is deleted', async () => {
    const category = await admin.labelCategoryCreate(asAdmin(), { name: '消费偏好', sortOrder: 0 });
    const label = await admin.labelCreate(asAdmin(), {
      categoryId: category.id,
      name: '母婴',
      sortOrder: 0,
    });
    await admin.labelCategoryDelete(asAdmin(), { id: category.id });
    const after = await admin.labelList(asAdmin(), { page: 1, pageSize: 20 });
    expect(after.items.map((l) => l.id)).toEqual([label.id]);
    expect(after.items[0]?.categoryId).toBeNull();
  });

  it('refuses a label pointed at a category that does not exist', async () => {
    await expect(
      admin.labelCreate(asAdmin(), { categoryId: '999999', name: '母婴', sortOrder: 0 }),
    ).rejects.toMatchObject({ code: 'USER_LABEL_CATEGORY_NOT_FOUND' });
  });

  it('reports a missing row rather than a silent no-op on delete', async () => {
    await expect(admin.groupDelete(asAdmin(), { id: '999999' })).rejects.toMatchObject({
      code: 'USER_GROUP_NOT_FOUND',
    });
    await expect(admin.labelDelete(asAdmin(), { id: '999999' })).rejects.toMatchObject({
      code: 'USER_LABEL_NOT_FOUND',
    });
  });
});
