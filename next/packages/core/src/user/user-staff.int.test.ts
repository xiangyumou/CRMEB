import { admins } from '@shop/db/schema/auth';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Actor, Ctx } from '../kernel/context';
import * as admin from './user-admin.service';
import {
  fakeUserOrderStatsPort,
  registerUserOrderStatsPort,
  resetUserOrderStatsPort,
  type FakeUserOrderStatsPort,
} from './user-order-stats.port';
import * as repo from './user.repo';
import * as staff from './user-staff.service';

/**
 * 商家管理 → 用户 (CR-2-h2 §3) against a real PostgreSQL.
 *
 * The HTTP half — a shopper getting 403 and a 店员 getting 200 on each of the
 * six — is in `apps/web/app/api/v1/user.int.test.ts`, where the staff guard
 * actually runs. What is worth asserting here is everything the guard cannot
 * see: that the phone is masked on the way out and still searchable in full,
 * that the two writes replace rather than accumulate, and that a missing
 * `UserOrderStatsPort` is `null` rather than a zero or a 500.
 */

let harness: TestCtx;
let stats: FakeUserOrderStatsPort;

const NOW = '2026-06-01T00:00:00.000Z';

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
}, 180_000);

afterAll(async () => {
  resetUserOrderStatsPort();
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  harness.clock.set(NOW);
  reviewerId = await makeAdmin();
  stats = fakeUserOrderStatsPort();
  registerUserOrderStatsPort(stats);
});

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

/** A 店员 is a shopper session; the staff check runs in `handle()`, not here. */
const staffActor: Actor = { kind: 'staff', id: 2001, permissions: [], isSuper: false };

function asStaff(): Ctx {
  return harness.as(staffActor);
}

let reviewerId = 0;

function asAdmin(): Ctx {
  return harness.as({ kind: 'admin', id: reviewerId, permissions: [], isSuper: true });
}

async function makeAdmin(): Promise<number> {
  const [row] = await harness.ctx.db
    .insert(admins)
    .values({
      account: `reviewer-${Date.now()}-${Math.random()}`,
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

// ---------------------------------------------------------------------------
// what a 店员 sees
// ---------------------------------------------------------------------------

describe('the staff customer list', () => {
  it('masks every phone and publishes no field that could unmask it', async () => {
    const user = await makeUser({ phone: '13800138000', account: '13800138000' });

    const page = await staff.staffList(asStaff(), { page: 1, pageSize: 20 });
    expect(page.items).toHaveLength(1);
    const [item] = page.items;
    expect(item!.phone).toBe('138****8000');

    // `account` is the phone for every phone-registered customer, so a staff
    // response that carried it would hand back what the mask removed. The same
    // goes for the rest of the console's detail. Asserted as an exact key set
    // rather than a handful of `toBeUndefined`s: a field added to the shared
    // schema later would slip past those.
    expect(Object.keys(item!).sort()).toEqual([
      'avatarUrl',
      'createdAt',
      'groups',
      'id',
      'labels',
      'nickname',
      'orderCount',
      'phone',
      'spendTotal',
      'status',
    ]);
    expect(await staff.staffDetail(asStaff(), { uid: String(user.id) })).toEqual(item);
  });

  it('finds a customer by the whole number a 店员 was read, but not by four digits of it', async () => {
    await makeUser({ phone: '13800138000', account: '13800138000', nickname: '小明' });
    await makeUser({ phone: '13900139000', account: '13900139000', nickname: '小红' });

    const byPhone = await staff.staffList(asStaff(), {
      page: 1,
      pageSize: 20,
      keyword: '13800138000',
    });
    expect(byPhone.items.map((i) => i.nickname)).toEqual(['小明']);

    // The mask is worth nothing if the search is a prefix oracle: 1380, 1381,
    // 1382… walks the customer base four digits at a time from a handset.
    const byFragment = await staff.staffList(asStaff(), {
      page: 1,
      pageSize: 20,
      keyword: '1380',
    });
    expect(byFragment.items).toEqual([]);
    expect(byFragment.total).toBe(0);

    // The nickname is still a substring search, because that is what a 店员
    // actually types and a nickname is not a secret.
    const byNickname = await staff.staffList(asStaff(), { page: 1, pageSize: 20, keyword: '小' });
    expect(byNickname.total).toBe(2);
  });

  it('asks the order stats port once for the whole page', async () => {
    const first = await makeUser();
    const second = await makeUser();
    stats.set(first.id, { orderCount: 12, spendTotal: '3980.00' });

    const page = await staff.staffList(asStaff(), { page: 1, pageSize: 20 });
    expect(stats.calls).toHaveLength(1);
    expect([...stats.calls[0]!].sort()).toEqual([first.id, second.id].sort());

    const byId = new Map(page.items.map((item) => [item.id, item]));
    expect(byId.get(String(first.id))).toMatchObject({ orderCount: 12, spendTotal: '3980.00' });
    // A customer the port said nothing about really has no qualifying orders.
    expect(byId.get(String(second.id))).toMatchObject({ orderCount: 0, spendTotal: '0.00' });
  });

  it('answers null, not zero, while no stream has registered the port', async () => {
    // The whole 用户 screen must still draw when the order stream is not
    // loaded; what it must not do is tell a 店员 that a customer with forty
    // orders is a first-time buyer.
    resetUserOrderStatsPort();
    const user = await makeUser();
    const detail = await staff.staffDetail(asStaff(), { uid: String(user.id) });
    expect(detail.orderCount).toBeNull();
    expect(detail.spendTotal).toBeNull();
  });

  it('refuses a customer who cancelled their account', async () => {
    const user = await makeUser();
    await harness.ctx.withTx((tx) =>
      repo.anonymise(tx, {
        id: user.id,
        account: `deleted-${user.id}`,
        now: harness.clock.now(),
      }),
    );
    await expect(staff.staffDetail(asStaff(), { uid: String(user.id) })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// the two drawers
// ---------------------------------------------------------------------------

describe('设置分组', () => {
  it('replaces the membership rather than adding to it, and can clear it', async () => {
    const user = await makeUser();
    const vip = await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });
    const lapsed = await admin.groupCreate(asAdmin(), { name: '沉睡', sortOrder: 1 });

    const picked = await staff.staffSetGroup(
      asStaff(),
      { uid: String(user.id) },
      {
        groupId: vip.id,
      },
    );
    expect(picked.groups).toEqual([{ id: vip.id, name: 'VIP' }]);

    // The drawer is a radio picker: choosing a second group means moving, not
    // joining both. The console's route is the batch one and has modes; this
    // one does not, because the screen above it cannot express them.
    const moved = await staff.staffSetGroup(
      asStaff(),
      { uid: String(user.id) },
      {
        groupId: lapsed.id,
      },
    );
    expect(moved.groups).toEqual([{ id: lapsed.id, name: '沉睡' }]);

    const cleared = await staff.staffSetGroup(
      asStaff(),
      { uid: String(user.id) },
      {
        groupId: null,
      },
    );
    expect(cleared.groups).toEqual([]);
  });

  it('refuses a group nobody owns and leaves the customer where they were', async () => {
    const user = await makeUser();
    const vip = await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });
    await staff.staffSetGroup(asStaff(), { uid: String(user.id) }, { groupId: vip.id });

    await expect(
      staff.staffSetGroup(asStaff(), { uid: String(user.id) }, { groupId: '999999' }),
    ).rejects.toMatchObject({ code: 'USER_GROUP_NOT_FOUND' });

    // The transaction rolled back, so the delete that precedes the insert did
    // not take the customer out of VIP on its way to failing.
    const after = await staff.staffDetail(asStaff(), { uid: String(user.id) });
    expect(after.groups).toEqual([{ id: vip.id, name: 'VIP' }]);
  });

  it('refuses a customer who does not exist', async () => {
    const vip = await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });
    await expect(
      staff.staffSetGroup(asStaff(), { uid: '999999' }, { groupId: vip.id }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});

describe('设置标签', () => {
  it('returns the whole catalogue grouped by category, with this customer flagged', async () => {
    const user = await makeUser();
    const preference = await admin.labelCategoryCreate(asAdmin(), {
      name: '消费偏好',
      sortOrder: 0,
    });
    const baby = await admin.labelCreate(asAdmin(), {
      categoryId: preference.id,
      name: '母婴',
      sortOrder: 0,
    });
    const tech = await admin.labelCreate(asAdmin(), {
      categoryId: preference.id,
      name: '数码',
      sortOrder: 1,
    });
    const loose = await admin.labelCreate(asAdmin(), { name: '未分类', sortOrder: 2 });

    await staff.staffSetLabels(asStaff(), { uid: String(user.id) }, { labelIds: [baby.id] });

    const drawer = await staff.staffLabelList(asStaff(), { uid: String(user.id) });
    expect(drawer.categories).toEqual([
      {
        categoryId: preference.id,
        categoryName: '消费偏好',
        labels: [
          { id: baby.id, name: '母婴', assigned: true },
          { id: tech.id, name: '数码', assigned: false },
        ],
      },
      {
        categoryId: null,
        categoryName: null,
        labels: [{ id: loose.id, name: '未分类', assigned: false }],
      },
    ]);
  });

  it('replaces the set, so a 店员 can take a label off', async () => {
    const user = await makeUser();
    const baby = await admin.labelCreate(asAdmin(), { name: '母婴', sortOrder: 0 });
    const tech = await admin.labelCreate(asAdmin(), { name: '数码', sortOrder: 1 });

    await staff.staffSetLabels(
      asStaff(),
      { uid: String(user.id) },
      {
        labelIds: [baby.id, tech.id],
      },
    );
    // A singular `{ labelId }` — the shape CR-2-h2 sketched — could add one of
    // these but never remove one, and the drawer's 确定 submits the whole
    // selection. Unchecking 数码 has to mean 数码 is gone.
    const after = await staff.staffSetLabels(
      asStaff(),
      { uid: String(user.id) },
      {
        labelIds: [tech.id],
      },
    );
    expect(after.labels).toEqual([{ id: tech.id, name: '数码' }]);

    const cleared = await staff.staffSetLabels(
      asStaff(),
      { uid: String(user.id) },
      {
        labelIds: [],
      },
    );
    expect(cleared.labels).toEqual([]);
  });

  it('refuses a label nobody owns rather than tagging with the rest', async () => {
    const user = await makeUser();
    const baby = await admin.labelCreate(asAdmin(), { name: '母婴', sortOrder: 0 });

    await expect(
      staff.staffSetLabels(
        asStaff(),
        { uid: String(user.id) },
        {
          labelIds: [baby.id, '999999'],
        },
      ),
    ).rejects.toMatchObject({ code: 'USER_LABEL_NOT_FOUND' });

    const after = await staff.staffDetail(asStaff(), { uid: String(user.id) });
    expect(after.labels).toEqual([]);
  });
});

describe('the 分组 picker', () => {
  it('lists every group in sort order, with no member counts', async () => {
    const second = await admin.groupCreate(asAdmin(), { name: '沉睡', sortOrder: 1 });
    const first = await admin.groupCreate(asAdmin(), { name: 'VIP', sortOrder: 0 });

    const picker = await staff.staffGroupList(asStaff());
    expect(picker.items).toEqual([
      { id: first.id, name: 'VIP' },
      { id: second.id, name: '沉睡' },
    ]);
  });
});
