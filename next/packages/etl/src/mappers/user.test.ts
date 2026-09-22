import { describe, expect, it } from 'vitest';
import {
  mapUsers,
  passwordOf,
  phoneOf,
  registerSourceOf,
  type LegacyUser,
  type LegacyUserAddress,
  type LegacyWechatUser,
} from './user';

/**
 * The user mapper, on rows shaped like the legacy dump.
 *
 * A migration is one-shot and unattended: a row it silently drops is a customer
 * who cannot sign in on launch morning and nobody finds out until they call. So
 * every case here checks the report as well as the rows.
 */

const BCRYPT = '$2y$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234';
const MD5 = 'e10adc3949ba59abbe56e057f20f883e';

function legacyUser(overrides: Partial<LegacyUser> = {}): LegacyUser {
  return {
    uid: 1,
    account: '13800138000',
    pwd: BCRYPT,
    real_name: '张三',
    birthday: 0,
    mark: '',
    group_id: 0,
    nickname: '小明',
    avatar: 'https://cdn.example/a.png',
    phone: '13800138000',
    add_time: 1_600_000_000,
    add_ip: '203.0.113.1',
    last_time: 1_700_000_000,
    last_ip: '203.0.113.2',
    status: 1,
    login_type: 'h5',
    is_del: 0,
    ...overrides,
  };
}

function legacyAddress(overrides: Partial<LegacyUserAddress> = {}): LegacyUserAddress {
  return {
    id: 1,
    uid: 1,
    real_name: '张三',
    phone: '13800138000',
    province: '北京市',
    city: '北京市',
    city_id: 110100,
    district: '朝阳区',
    detail: '建国路 88 号',
    post_code: 100000,
    longitude: '116.480000',
    latitude: '39.910000',
    is_default: 1,
    is_del: 0,
    add_time: 1_600_000_100,
    ...overrides,
  };
}

function legacyWechatUser(overrides: Partial<LegacyWechatUser> = {}): LegacyWechatUser {
  return {
    id: 1,
    uid: 1,
    unionid: 'un_1',
    openid: 'o_oa_1',
    nickname: '小明',
    headimgurl: 'https://cdn.example/w.png',
    subscribe: 1,
    subscribe_time: 1_600_000_200,
    add_time: 1_600_000_200,
    is_del: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

describe('passwordOf', () => {
  it('keeps a bcrypt hash as bcrypt', () => {
    expect(passwordOf(BCRYPT)).toEqual({ hash: BCRYPT, algo: 'bcrypt' });
  });

  it('keeps an unsalted MD5 and tags it for upgrade on first login', () => {
    // Re-hashing it here would change nothing an attacker has to do: the MD5 is
    // still the secret. The sign-in service upgrades it once it verifies.
    expect(passwordOf(MD5.toUpperCase())).toEqual({ hash: MD5, algo: 'md5_legacy' });
  });

  it('refuses anything else, leaving the account without a password', () => {
    for (const value of ['', '   ', 'plaintext', '$2y$10$short', `${MD5}extra`]) {
      expect(passwordOf(value)).toBeNull();
    }
  });
});

describe('registerSourceOf and phoneOf', () => {
  it('maps the three legacy login types and defaults the rest to h5', () => {
    expect(registerSourceOf('wechat')).toBe('wechat_oa');
    expect(registerSourceOf('routine')).toBe('wechat_mini');
    expect(registerSourceOf('h5')).toBe('h5');
    expect(registerSourceOf('')).toBe('h5');
  });

  it('keeps only something that could be a mainland mobile number', () => {
    expect(phoneOf('138-0013-8000')).toBe('13800138000');
    expect(phoneOf('0')).toBeNull();
    expect(phoneOf('12345')).toBeNull();
    expect(phoneOf('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

describe('mapUsers', () => {
  it('carries an ordinary customer across with its timestamps', () => {
    const { users, report } = mapUsers({ users: [legacyUser()] });

    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      id: 1,
      account: '13800138000',
      phone: '13800138000',
      passwordAlgo: 'bcrypt',
      passwordVersion: 1,
      nickname: '小明',
      realName: '张三',
      status: 'active',
      registerSource: 'h5',
      deletedAt: null,
    });
    expect(users[0]!.createdAt.toISOString()).toBe('2020-09-13T12:26:40.000Z');
    expect(users[0]!.lastLoginAt?.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    expect(report.users).toBe(1);
  });

  it('soft-deletes a cancelled account instead of dropping it', () => {
    // Orders, refunds and invoices reference the uid; a dropped row would take
    // a paying customer's history with it.
    const { users, keptUserIds, report } = mapUsers({ users: [legacyUser({ is_del: 1 })] });
    expect(users[0]!.deletedAt).not.toBeNull();
    expect(keptUserIds.has(1)).toBe(true);
    expect(report.usersCancelled).toBe(1);
  });

  it('disables an account the legacy status had banned', () => {
    const { users } = mapUsers({ users: [legacyUser({ status: 0 })] });
    expect(users[0]!.status).toBe('disabled');
  });

  it('renames an account that collides case-insensitively', () => {
    // `users_account_lower_uq` folds the case; the legacy table had no unique
    // index at all, so installs really do contain both spellings.
    const { users, report } = mapUsers({
      users: [
        legacyUser({ uid: 1, account: 'Xiaoming', phone: '' }),
        legacyUser({ uid: 42, account: 'xiaoming', phone: '' }),
      ],
    });

    expect(users.map((row) => row.account)).toEqual(['Xiaoming', 'xiaoming_u42']);
    expect(report.usersAccountRenamed).toBe(1);
    expect(report.renamedAccounts).toEqual([{ uid: 42, from: 'xiaoming', to: 'xiaoming_u42' }]);
  });

  it('gives a shared phone number to the first account and keeps the second', () => {
    const { users, report } = mapUsers({
      users: [
        legacyUser({ uid: 1, account: 'a' }),
        legacyUser({ uid: 2, account: 'b', phone: '13800138000' }),
      ],
    });

    expect(users[0]!.phone).toBe('13800138000');
    expect(users[1]!.phone).toBeNull();
    expect(users[1]!.id).toBe(2); // still migrated, orders and all
    expect(report.usersDroppedDuplicatePhone).toBe(1);
  });

  it('counts the accounts that arrive without a usable password', () => {
    const { users, report } = mapUsers({
      users: [
        legacyUser({ uid: 1, account: 'a', phone: '', pwd: '' }),
        legacyUser({ uid: 2, account: 'b', phone: '', pwd: MD5 }),
      ],
    });

    expect(users[0]!.passwordHash).toBeNull();
    expect(users[0]!.passwordAlgo).toBeNull();
    expect(users[1]!.passwordAlgo).toBe('md5_legacy');
    expect(report).toMatchObject({ usersWithoutPassword: 1, usersWithLegacyMd5: 1 });
  });
});

// ---------------------------------------------------------------------------
// groups, addresses, labels
// ---------------------------------------------------------------------------

describe('groups', () => {
  it('turns the single legacy group_id into a membership row', () => {
    const { groups, groupMemberships } = mapUsers({
      users: [legacyUser({ group_id: 7 })],
      groups: [{ id: 7, group_name: '老客户' }],
    });

    expect(groups).toEqual([{ id: 7, name: '老客户', sortOrder: 0 }]);
    expect(groupMemberships).toEqual([{ userId: 1, groupId: 7 }]);
  });

  it('ignores a group_id that points at nothing', () => {
    const { groupMemberships } = mapUsers({ users: [legacyUser({ group_id: 99 })], groups: [] });
    expect(groupMemberships).toEqual([]);
  });
});

describe('addresses', () => {
  it('maps one address with its frozen division names', () => {
    const { addresses } = mapUsers({ users: [legacyUser()], addresses: [legacyAddress()] });

    expect(addresses[0]).toMatchObject({
      id: 1,
      userId: 1,
      receiverName: '张三',
      provinceName: '北京市',
      districtName: '朝阳区',
      cityId: 110100,
      postCode: '100000',
      lng: '116.480000',
      isDefault: true,
      deletedAt: null,
    });
  });

  it('leaves exactly one live default per customer', () => {
    // `user_addresses_default_uq` is a partial unique index; the legacy table
    // has no such constraint and two defaults do occur.
    const { addresses } = mapUsers({
      users: [legacyUser()],
      addresses: [legacyAddress({ id: 1 }), legacyAddress({ id: 2 })],
    });

    expect(addresses.filter((row) => row.isDefault)).toHaveLength(1);
    expect(addresses[0]!.isDefault).toBe(true);
  });

  it('never marks a deleted address as the default', () => {
    const { addresses } = mapUsers({
      users: [legacyUser()],
      addresses: [legacyAddress({ id: 1, is_del: 1 }), legacyAddress({ id: 2 })],
    });

    expect(addresses[0]).toMatchObject({ isDefault: false });
    expect(addresses[0]!.deletedAt).not.toBeNull();
    expect(addresses[1]!.isDefault).toBe(true);
  });

  it('drops the legacy "0" coordinates rather than shipping a point off Africa', () => {
    const { addresses } = mapUsers({
      users: [legacyUser()],
      addresses: [legacyAddress({ longitude: '0', latitude: '0' })],
    });
    expect(addresses[0]).toMatchObject({ lng: null, lat: null });
  });

  it('counts an address whose owner did not migrate', () => {
    const { addresses, report } = mapUsers({
      users: [legacyUser()],
      addresses: [legacyAddress({ uid: 999 })],
    });
    expect(addresses).toEqual([]);
    expect(report.addressesDroppedUnknownUser).toBe(1);
  });

  describe('city_id 与新库的城市字典对不上时（CR-3-j）', () => {
    // The dictionary is seeded, not migrated, and `city_id` is a real foreign
    // key. An id it does not have would fail the insert — and a group is one
    // transaction, so it would take every member, address and label with it.
    it('清掉链接并计数，地址本身照常迁移', () => {
      const { addresses, report } = mapUsers({
        users: [legacyUser()],
        addresses: [legacyAddress({ city_id: 999_999 })],
        knownCityIds: new Set([110100]),
      });
      expect(addresses).toHaveLength(1);
      expect(addresses[0]?.cityId).toBeNull();
      expect(report.addressesCityCleared).toBe(1);
      // 省市区的文字是客户真正会读的东西，一个字都不能少。
      expect(addresses[0]).toMatchObject({
        provinceName: '北京市',
        cityName: '北京市',
        districtName: '朝阳区',
        detail: '建国路 88 号',
      });
    });

    it('字典里有的 id 原样保留', () => {
      const { addresses, report } = mapUsers({
        users: [legacyUser()],
        addresses: [legacyAddress()],
        knownCityIds: new Set([110100]),
      });
      expect(addresses[0]?.cityId).toBe(110100);
      expect(report.addressesCityCleared).toBe(0);
    });

    it('旧库的 0 表示没选城市，既不算被清掉，也不会变成指向 0 的外键', () => {
      const { addresses, report } = mapUsers({
        users: [legacyUser()],
        addresses: [legacyAddress({ city_id: 0 })],
        knownCityIds: new Set([110100]),
      });
      expect(addresses[0]?.cityId).toBeNull();
      expect(report.addressesCityCleared).toBe(0);
    });

    it('没有告诉 mapper 字典内容时不做检查——那是目标库的事实，纯函数无从得知', () => {
      const { addresses, report } = mapUsers({
        users: [legacyUser()],
        addresses: [legacyAddress({ city_id: 999_999 })],
      });
      expect(addresses[0]?.cityId).toBe(999_999);
      expect(report.addressesCityCleared).toBe(0);
    });
  });
});

describe('labels', () => {
  it('synthesises the categories the missing eb_user_label_cate would have held', () => {
    // The dump has no `CREATE TABLE eb_user_label_cate`, so an export may not
    // contain it. Losing the grouping would flatten a taxonomy the operator built.
    const { labelCategories, labels, report } = mapUsers({
      users: [legacyUser()],
      labels: [
        { id: 1, label_cate: 5, label_name: '爱买鞋' },
        { id: 2, label_cate: 5, label_name: '常退货' },
      ],
    });

    expect(labelCategories).toEqual([{ id: 5, name: '分类 5', sortOrder: 0 }]);
    expect(labels.map((label) => label.categoryId)).toEqual([5, 5]);
    expect(report.labelCategoriesSynthesised).toBe(1);
  });

  it('prefers a real category row when the live database has one', () => {
    const { labelCategories, report } = mapUsers({
      users: [legacyUser()],
      labels: [{ id: 1, label_cate: 5, label_name: '爱买鞋' }],
      labelCategories: [{ id: 5, label_name: '购物偏好' }],
    });

    expect(labelCategories).toEqual([{ id: 5, name: '购物偏好', sortOrder: 0 }]);
    expect(report.labelCategoriesSynthesised).toBe(0);
  });

  it('drops a duplicate label name and the memberships that pointed at it', () => {
    // The new `user_labels_name_uq` is global where the legacy name was unique
    // only inside a category, so the collision is real and has to be counted.
    const { labels, labelMemberships, report } = mapUsers({
      users: [legacyUser()],
      labels: [
        { id: 1, label_cate: 5, label_name: 'VIP' },
        { id: 2, label_cate: 6, label_name: 'vip' },
      ],
      labelRelations: [
        { uid: 1, label_id: 1 },
        { uid: 1, label_id: 2 },
      ],
    });

    expect(labels).toHaveLength(1);
    expect(labelMemberships).toEqual([{ userId: 1, labelId: 1 }]);
    expect(report).toMatchObject({
      labelsDroppedDuplicateName: 1,
      labelMembershipsDroppedUnknown: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// cancellations and WeChat identities
// ---------------------------------------------------------------------------

describe('cancellation requests', () => {
  it('maps the three legacy statuses', () => {
    const { cancellations } = mapUsers({
      users: [legacyUser({ uid: 1 }), legacyUser({ uid: 2, account: 'b', phone: '' })],
      cancellations: [
        {
          id: 1,
          uid: 1,
          name: '小明',
          phone: '13800138000',
          add_time: 1,
          status: 1,
          up_time: 2,
          remark: '已处理',
        },
        {
          id: 2,
          uid: 2,
          name: '小红',
          phone: '',
          add_time: 1,
          status: 2,
          up_time: 2,
          remark: '资料不符',
        },
      ],
    });

    expect(cancellations.map((row) => row.status)).toEqual(['approved', 'rejected']);
    expect(cancellations[0]!.reviewRemark).toBe('已处理');
    expect(cancellations[1]!.reviewedAt).not.toBeNull();
  });

  it('keeps one open request per customer and withdraws the rest', () => {
    // `user_cancellation_requests_open_uq` allows one; withdrawing the extra
    // keeps it visible to the reviewer instead of deleting the evidence.
    const { cancellations } = mapUsers({
      users: [legacyUser()],
      cancellations: [
        { id: 1, uid: 1, name: '', phone: '', add_time: 1, status: 0, up_time: 0, remark: '' },
        { id: 2, uid: 1, name: '', phone: '', add_time: 2, status: 0, up_time: 0, remark: '' },
      ],
    });

    expect(cancellations.map((row) => row.status)).toEqual(['pending', 'withdrawn']);
  });
});

describe('WeChat identities', () => {
  it('maps a follower to an oa identity with its subscription state', () => {
    const { wechatIdentities } = mapUsers({
      users: [legacyUser()],
      wechatUsers: [legacyWechatUser()],
    });

    expect(wechatIdentities[0]).toMatchObject({
      userId: 1,
      platform: 'oa',
      openid: 'o_oa_1',
      unionid: 'un_1',
      subscribed: true,
    });
  });

  it('沿用 eb_wechat_user.id，否则重跑一次同一行就换了号（CR-3-j）', () => {
    const { wechatIdentities } = mapUsers({
      users: [legacyUser()],
      wechatUsers: [legacyWechatUser({ id: 77 })],
    });
    expect(wechatIdentities[0]?.id).toBe(77);
  });

  it('drops a second row for the same openid or the same customer', () => {
    const { wechatIdentities, report } = mapUsers({
      users: [legacyUser({ uid: 1 }), legacyUser({ uid: 2, account: 'b', phone: '' })],
      wechatUsers: [
        legacyWechatUser({ id: 1, uid: 1, openid: 'o_oa_1' }),
        legacyWechatUser({ id: 2, uid: 2, openid: 'o_oa_1' }),
        legacyWechatUser({ id: 3, uid: 1, openid: 'o_oa_2' }),
      ],
    });

    expect(wechatIdentities).toHaveLength(1);
    expect(report.wechatIdentitiesDroppedDuplicateOpenid).toBe(2);
  });

  it('counts a follower whose customer did not migrate', () => {
    const { wechatIdentities, report } = mapUsers({
      users: [legacyUser()],
      wechatUsers: [legacyWechatUser({ uid: 999 })],
    });
    expect(wechatIdentities).toEqual([]);
    expect(report.wechatIdentitiesDroppedUnknownUser).toBe(1);
  });
});
