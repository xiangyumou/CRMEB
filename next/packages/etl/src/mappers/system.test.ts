import { describe, expect, it } from 'vitest';
import {
  CONFIG_VALUE_TRANSFORMS,
  decodeConfigValue,
  mapSystem,
  parseIdList,
  type LegacySystemAdmin,
  type LegacySystemRole,
} from './system';

/**
 * The rows below are copied out of `crmeb/public/install/crmeb.sql`, including
 * the bcrypt hash the stock installer ships.
 */

const ADMIN: LegacySystemAdmin = {
  id: 1,
  account: 'admin',
  head_pic: '/statics/system_images/admin_head_pic.png',
  pwd: '$2y$10$Nw3c1OStH4mrTCir9P.wB.J7oeUSwMDMQRuW.4qNTyhcADean.YeS',
  real_name: 'CRMEB',
  roles: '1',
  last_ip: '124.116.164.158',
  last_time: 1669195280,
  add_time: 1669194971,
  login_count: 1,
  level: 0,
  status: 1,
  is_del: 0,
};

const ROLE: LegacySystemRole = {
  id: 1,
  role_name: '客服',
  rules: '1,2,3,47,48',
  level: 0,
  status: 1,
};

describe('admins', () => {
  it('migrates the stock admin with its bcrypt hash untouched', () => {
    const out = mapSystem({ admins: [ADMIN], roles: [ROLE] });
    expect(out.admins).toHaveLength(1);
    expect(out.admins[0]).toMatchObject({
      id: 1,
      account: 'admin',
      name: 'CRMEB',
      // `level = 0` is the legacy super admin, which is how it keeps every
      // permission without a single grant being translated.
      isSuper: true,
      passwordHash: ADMIN.pwd,
      passwordAlgo: 'bcrypt',
      status: 1,
    });
    expect(out.report.adminsWithLegacyPassword).toBe(0);
  });

  it('不搬管理员的最后登录 IP：新库没有这一列，也没有功能读它（CR-4-j）', () => {
    // `toMatchObject` above would not notice an extra field, and an extra field
    // is not harmless here: the runner checks every key a mapper emits against
    // the table's real columns and refuses the whole group when one has no home.
    const out = mapSystem({ admins: [ADMIN], roles: [ROLE] });
    expect(out.admins[0]).not.toHaveProperty('lastLoginIp');
    // The *time* does have a column, and does come across.
    expect(out.admins[0]?.lastLoginAt).toEqual(new Date(ADMIN.last_time * 1000));
  });

  it('keeps an MD5 password as MD5 rather than pretending it is bcrypt', () => {
    // Re-hashing needs the plaintext, which nobody has. The column carries the
    // algorithm so login can verify the old hash once and upgrade it.
    const out = mapSystem({ admins: [{ ...ADMIN, pwd: 'e10adc3949ba59abbe56e057f20f883e' }] });
    expect(out.admins[0]).toMatchObject({ passwordAlgo: 'md5' });
    expect(out.report.adminsWithLegacyPassword).toBe(1);
  });

  it('drops soft-deleted accounts and counts them', () => {
    const out = mapSystem({ admins: [ADMIN, { ...ADMIN, id: 2, account: 'gone', is_del: 1 }] });
    expect(out.admins.map((a) => a.id)).toEqual([1]);
    expect(out.report.adminsDroppedDeleted).toBe(1);
  });

  it('links admins to roles and drops links to roles that are not there', () => {
    const out = mapSystem({
      admins: [{ ...ADMIN, roles: '1,7,,x' }],
      roles: [ROLE],
    });
    expect(out.adminRoles).toEqual([{ adminId: 1, roleId: 1 }]);
    expect(out.report.adminRoleLinksDroppedUnknownRole).toBe(1);
  });

  it('never invents a creation time', () => {
    // A migration that stamps `now` makes every account look created on the
    // day of the cutover, which destroys the only ordering anybody has.
    const out = mapSystem({ admins: [ADMIN] });
    expect(out.admins[0]?.createdAt).toEqual(new Date(1669194971 * 1000));
    expect(out.admins[0]?.lastLoginAt).toEqual(new Date(1669195280 * 1000));
  });
});

describe('roles', () => {
  it('migrates the role but not its grants, and says so', () => {
    const out = mapSystem({ roles: [ROLE], admins: [ADMIN] });
    expect(out.roles[0]).toMatchObject({ id: 1, name: '客服', status: 1 });
    // The legacy `rules` are `eb_system_menus` ids: rows in a table that no
    // longer exists. Translating them would be a guess about who may issue
    // refunds, so every such role is reported for re-granting instead.
    expect(out.report.rolesNeedingRegrant).toBe(1);
    expect(out.report.roleIdsNeedingRegrant).toEqual([1]);
  });

  it('does not report a role that had no grants anyway', () => {
    const out = mapSystem({ roles: [{ ...ROLE, rules: '' }] });
    expect(out.report.rolesNeedingRegrant).toBe(0);
  });

  it('不产出 deletedAt：roles 表没有软删除列，eb_system_role 也没有 is_del（CR-4-j）', () => {
    const out = mapSystem({ roles: [ROLE], admins: [ADMIN] });
    expect(out.roles[0]).not.toHaveProperty('deletedAt');
    // Admins *are* soft-deletable, so that one keeps its field.
    expect(out.admins[0]).toHaveProperty('deletedAt', null);
  });
});

describe('config', () => {
  // Routing `eb_system_config` used to live in this mapper, through a
  // `configKeyMap` the runner built. It does not any more (CR-1-j): a legacy
  // key can have more than one claimant, which a one-to-one map cannot express,
  // and validating a value means running a group's zod schema, which a pure
  // mapper cannot do. `config.ts` owns it and `config.test.ts` covers it —
  // routing, unclaimed keys, the hours → minutes conversion and alias
  // precedence all have tests there. What stays here is the domain knowledge.

  it('这个 mapper 不再产出配置值', () => {
    expect(mapSystem({ admins: [ADMIN], roles: [ROLE] })).not.toHaveProperty('configValues');
  });

  it('把小时换算成分钟的规则留在本域，因为理由是本域的事实', () => {
    // The one conversion that silently ruins the shop if it is missed: copying
    // `2` across would cancel every unpaid order after two minutes.
    const transform = CONFIG_VALUE_TRANSFORMS.get('order_cancel_time');
    expect(transform).toBeDefined();
    expect(transform?.('2')).toBe(120);
    // A value that is not a number at all falls back to the legacy default
    // rather than writing NaN into the shop's cancel timer.
    expect(transform?.('')).toBe(30);
  });
});

describe('value decoding', () => {
  it('keeps a numeric string a string and parses real JSON', () => {
    // `"0755"` must not become `755`; the group's zod schema coerces properly.
    expect(decodeConfigValue('0755')).toBe('0755');
    expect(decodeConfigValue('{"a":1}')).toEqual({ a: 1 });
    expect(decodeConfigValue('["a","b"]')).toEqual(['a', 'b']);
    expect(decodeConfigValue('')).toBe('');
    // Malformed JSON is text, not an exception in the middle of a migration.
    expect(decodeConfigValue('{oops')).toBe('{oops');
  });

  it('parses the comma-separated id lists the legacy schema is built on', () => {
    expect(parseIdList('1,2, 3')).toEqual([1, 2, 3]);
    expect(parseIdList('')).toEqual([]);
    expect(parseIdList(null)).toEqual([]);
    expect(parseIdList('0,-1,x')).toEqual([]);
  });
});
