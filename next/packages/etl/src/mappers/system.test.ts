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
});

describe('config', () => {
  const keyMap = new Map([
    ['site_name', { group: 'site', key: 'siteName' }],
    ['site_logo', { group: 'site', key: 'logo' }],
    ['order_cancel_time', { group: 'order', key: 'cancelAfterMinutes' }],
  ]);

  it('routes legacy keys to the group that claimed them', () => {
    const out = mapSystem({
      configs: [
        { menu_name: 'site_name', value: 'CRMEB 商城' },
        { menu_name: 'site_logo', value: '/uploads/logo.png' },
      ],
      configKeyMap: keyMap,
    });
    expect(out.configValues).toEqual([
      { group: 'site', key: 'siteName', value: 'CRMEB 商城' },
      { group: 'site', key: 'logo', value: '/uploads/logo.png' },
    ]);
  });

  it('lists a legacy key no group claims instead of dropping it silently', () => {
    const out = mapSystem({
      configs: [{ menu_name: 'copy_command', value: '1' }],
      configKeyMap: keyMap,
    });
    expect(out.configValues).toEqual([]);
    expect(out.report.configKeysUnclaimed).toEqual(['copy_command']);
  });

  it('converts order_cancel_time from hours to minutes', () => {
    // The one conversion that silently ruins the shop if it is missed: copying
    // `2` across would cancel every unpaid order after two minutes.
    const out = mapSystem({
      configs: [{ menu_name: 'order_cancel_time', value: '2' }],
      configKeyMap: keyMap,
      configValueTransforms: CONFIG_VALUE_TRANSFORMS,
    });
    expect(out.configValues[0]).toEqual({
      group: 'order',
      key: 'cancelAfterMinutes',
      value: 120,
    });
  });

  it('lets the first legacy alias win when several feed one key', () => {
    // 七牛/OSS/COS all fold onto `s3AccessKeyId`; the group's `legacyKeys` order
    // is the precedence, and a second alias must not overwrite the first.
    const map = new Map([
      ['accessKey', { group: 'storage', key: 's3AccessKeyId' }],
      ['accessKeyId', { group: 'storage', key: 's3AccessKeyId' }],
    ]);
    const out = mapSystem({
      configs: [
        { menu_name: 'accessKey', value: 'qiniu-key' },
        { menu_name: 'accessKeyId', value: 'oss-key' },
      ],
      configKeyMap: map,
    });
    expect(out.configValues).toEqual([
      { group: 'storage', key: 's3AccessKeyId', value: 'qiniu-key' },
    ]);
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
