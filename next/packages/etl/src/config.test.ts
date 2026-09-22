import '@shop/core/domains';
import { allConfigGroups, defineConfigGroup } from '@shop/core/kernel/config-registry';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DROPPED_CONFIG_KEYS, isDroppedConfigKey } from './config-dropped';
import { IGNORED_CONFIG_CLAIMS, isIgnoredClaim } from './config-overrides';
import {
  ConfigMigrationError,
  buildLegacyKeyIndex,
  mapConfig,
  type LegacySystemConfigRow,
} from './config';

const NOW = new Date('2026-09-23T00:00:00Z');

/** Two throwaway groups, so the unit tests do not move when a domain does. */
const alpha = defineConfigGroup({
  group: 'etl-test-alpha',
  title: 'α',
  schema: z.object({
    siteName: z.string().max(8).default(''),
    window: z.number().int().min(1).default(30),
  }),
  ui: {},
  legacyKeys: { siteName: 'etl_test_site_name', window: 'order_cancel_time' },
});

const beta = defineConfigGroup({
  group: 'etl-test-beta',
  title: 'β',
  schema: z.object({ appId: z.string().default(''), secret: z.string().default('') }),
  ui: {},
  legacyKeys: { appId: 'etl_test_appid', secret: 'etl_test_secret' },
});

/**
 * One field fed by three legacy aliases, which is `storage.s3AccessKeyId` in
 * miniature: a shop that used one vendor has rows for all of them and the other
 * two are empty strings.
 */
const gamma = defineConfigGroup({
  group: 'etl-test-gamma',
  title: 'γ',
  schema: z.object({ accessKey: z.string().default('') }),
  ui: {},
  legacyKeys: {
    accessKey: ['etl_test_key_a', 'etl_test_key_b', 'etl_test_key_c'],
  },
});

const groups = [alpha, beta, gamma];

function row(menu_name: string, value: string): LegacySystemConfigRow {
  return { menu_name, value };
}

describe('buildLegacyKeyIndex', () => {
  it('fans one legacy key out to every group that claims it', () => {
    const index = buildLegacyKeyIndex(groups);
    expect(index.get('etl_test_site_name')).toEqual([
      { group: 'etl-test-alpha', key: 'siteName', alias: 0 },
    ]);
  });

  it('really does fan out on the live registry — wechat_appid has two claimants', () => {
    // `wechat` (C's) and `wechat-oa` (F1's) both claim it while the transition
    // runs. A one-to-one map would drop one of them silently: CR-1-j.
    const claimants = buildLegacyKeyIndex().get('wechat_appid') ?? [];
    expect(claimants.length).toBeGreaterThan(1);
    expect(claimants.map((c) => c.group).sort()).toEqual(['wechat', 'wechat-oa']);
  });
});

describe('mapConfig', () => {
  it('maps a claimed key into its group', () => {
    const { values, report } = mapConfig([row('etl_test_site_name', '"小店"')], {
      groups,
      now: NOW,
    });
    expect(values).toEqual([
      { group: 'etl-test-alpha', key: 'siteName', value: '小店', updatedAt: NOW, updatedBy: null },
    ]);
    expect(report.mapped).toEqual([
      {
        legacyKey: 'etl_test_site_name',
        group: 'etl-test-alpha',
        key: 'siteName',
        marker: '<set>',
      },
    ]);
  });

  it('converts order_cancel_time from hours to minutes (ETL-F1-003)', () => {
    const { values } = mapConfig([row('order_cancel_time', '"2"')], { groups, now: NOW });
    expect(values[0]?.value).toBe(120);
  });

  describe('several legacy aliases feeding one field', () => {
    // `storage.s3AccessKeyId` lists six of them (七牛/腾讯/京东/华为/天翼/…).
    // The shop used one vendor, so five rows are empty strings — and all six
    // are present in the dump.
    const gammaOnly = { groups: [gamma], now: NOW };

    it('一个有值的别名胜过空别名，无论 dump 里谁在后面', () => {
      const { values, report } = mapConfig(
        [
          row('etl_test_key_a', '""'),
          row('etl_test_key_b', '"real-key"'),
          row('etl_test_key_c', '""'),
        ],
        gammaOnly,
      );
      expect(values).toEqual([
        {
          group: 'etl-test-gamma',
          key: 'accessKey',
          value: 'real-key',
          updatedAt: NOW,
          updatedBy: null,
        },
      ]);
      // And the report says the other two did not migrate, so "腾讯云的 key
      // 怎么没过来" has an answer instead of being a mystery.
      expect(report.aliasesNotUsed.map((entry) => entry.legacyKey).sort()).toEqual([
        'etl_test_key_a',
        'etl_test_key_c',
      ]);
      expect(report.aliasesNotUsed.every((entry) => entry.insteadOf === 'etl_test_key_b')).toBe(
        true,
      );
      // The report names the key the value really came from, once.
      expect(report.mapped).toEqual([
        {
          legacyKey: 'etl_test_key_b',
          group: 'etl-test-gamma',
          key: 'accessKey',
          marker: '<set>',
        },
      ]);
    });

    it('两个别名都有值时，按组里声明的顺序决定，而不是按 dump 的行序', () => {
      const declared = mapConfig(
        [row('etl_test_key_c', '"third"'), row('etl_test_key_a', '"first"')],
        gammaOnly,
      );
      expect(declared.values[0]?.value).toBe('first');

      // The same two rows the other way round must give the same answer —
      // otherwise the migrated value depends on how the dump was written.
      const reversed = mapConfig(
        [row('etl_test_key_a', '"first"'), row('etl_test_key_c', '"third"')],
        gammaOnly,
      );
      expect(reversed.values[0]?.value).toBe('first');
    });

    it('全都是空的时候也不报错，只是这个字段没有被迁移的值', () => {
      const { values } = mapConfig([row('etl_test_key_a', '""'), row('etl_test_key_b', '""')], {
        groups: [gamma],
        now: NOW,
      });
      expect(values).toEqual([
        { group: 'etl-test-gamma', key: 'accessKey', value: '', updatedAt: NOW, updatedBy: null },
      ]);
    });
  });

  it('writes only the fields a legacy key fed, not the schema defaults', () => {
    // Storing a default turns it into a value that survives a later change of
    // that default — the settings screen then shows the old number for ever.
    const { values } = mapConfig([row('etl_test_site_name', '"小店"')], { groups, now: NOW });
    expect(values.map((v) => v.key)).toEqual(['siteName']);
  });

  it('reports a key on the drop list with its reason, and writes nothing', () => {
    const { values, report } = mapConfig([row('watermark_text', 'CRMEB')], { groups, now: NOW });
    expect(values).toEqual([]);
    expect(report.dropped).toEqual([
      { legacyKey: 'watermark_text', reason: expect.stringContaining('水印'), marker: '<set>' },
    ]);
  });

  it('FAILS on a key nobody claims and nobody dropped', () => {
    // The whole point: a migration that quietly ignores a config key is how a
    // shop comes up with a feature off and nobody able to say when.
    expect(() => mapConfig([row('a_key_from_the_future', '1')], { groups, now: NOW })).toThrow(
      ConfigMigrationError,
    );
    expect(() => mapConfig([row('a_key_from_the_future', '1')], { groups, now: NOW })).toThrow(
      /a_key_from_the_future/,
    );
  });

  it('fails on a value the group schema refuses, and names the field not the value', () => {
    let error: ConfigMigrationError | undefined;
    try {
      mapConfig([row('etl_test_site_name', '"这个站点名字实在是太长了放不进去"')], {
        groups,
        now: NOW,
      });
    } catch (thrown) {
      error = thrown as ConfigMigrationError;
    }
    expect(error).toBeInstanceOf(ConfigMigrationError);
    expect(error?.message).toContain('etl-test-alpha.siteName');
    expect(error?.message).not.toContain('这个站点名字实在是太长了放不进去');
  });

  it('lets --allow-invalid-config drop the offending field and keep the rest', () => {
    const { values, report } = mapConfig(
      [
        row('etl_test_site_name', '"这个站点名字实在是太长了放不进去"'),
        row('order_cancel_time', '"1"'),
      ],
      { groups, now: NOW, allowInvalid: true },
    );
    expect(report.invalid).toHaveLength(1);
    expect(values.map((v) => v.key)).toEqual(['window']);
  });

  it('never puts a value in the report — only <set> or <empty>', () => {
    const { report } = mapConfig(
      [
        row('etl_test_secret', '"a-merchant-secret-nobody-should-see"'),
        row('etl_test_appid', '""'),
      ],
      { groups, now: NOW },
    );
    const rendered = JSON.stringify(report);
    expect(rendered).not.toContain('a-merchant-secret-nobody-should-see');
    expect(report.mapped).toContainEqual({
      legacyKey: 'etl_test_secret',
      group: 'etl-test-beta',
      key: 'secret',
      marker: '<set>',
    });
    expect(report.mapped).toContainEqual({
      legacyKey: 'etl_test_appid',
      group: 'etl-test-beta',
      key: 'appId',
      marker: '<empty>',
    });
  });

  it('reports groups no legacy key fed, so nobody assumes they migrated', () => {
    const { report } = mapConfig([row('etl_test_site_name', '"小店"')], { groups, now: NOW });
    expect(report.groupsWithoutLegacyValues).toEqual(['etl-test-beta', 'etl-test-gamma']);
  });
});

describe('the drop list and the live registry together account for every key', () => {
  it('claims and drops are disjoint', () => {
    const claimed = new Set(buildLegacyKeyIndex().keys());
    const overlap = DROPPED_CONFIG_KEYS.map((d) => d.key).filter((key) => claimed.has(key));
    expect(overlap).toEqual([]);
  });

  it('every drop entry carries a reason a human can act on', () => {
    for (const entry of DROPPED_CONFIG_KEYS) {
      expect(entry.reason.length).toBeGreaterThan(4);
    }
  });

  it('has no duplicate entries', () => {
    const keys = DROPPED_CONFIG_KEYS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('`isDroppedConfigKey` does not answer for inherited object keys', () => {
    expect(isDroppedConfigKey('constructor')).toBe(false);
  });
});

describe('parked claims', () => {
  it('every ignored claim still matches a live legacyKeys entry', () => {
    // When the owning stream's CR lands, its claim disappears and this fails —
    // which is the signal to delete the entry rather than leave it for ever.
    const live = new Map(
      allConfigGroups().map((group) => [
        group.group,
        Object.entries(group.legacyKeys ?? {}).flatMap(([field, legacy]) =>
          (typeof legacy === 'string' ? [legacy] : (legacy ?? [])).map((key) => `${key}|${field}`),
        ),
      ]),
    );
    for (const override of IGNORED_CONFIG_CLAIMS) {
      expect(live.get(override.group) ?? []).toContain(`${override.legacyKey}|${override.key}`);
    }
  });

  it('every parked claim also appears on the drop list, so the key is accounted for', () => {
    for (const override of IGNORED_CONFIG_CLAIMS) {
      expect(isDroppedConfigKey(override.legacyKey)).toBe(true);
    }
  });

  it('`isIgnoredClaim` answers for exactly the parked entries and nothing else', () => {
    // The two tests above iterate the list, so an empty list makes them
    // vacuous. This one says something either way: nothing is parked that is
    // not on the list — today that is nothing at all, which is the state
    // CR-2-j left behind.
    for (const override of IGNORED_CONFIG_CLAIMS) {
      expect(isIgnoredClaim(override.legacyKey, override.group, override.key)).toBe(true);
    }
    expect(isIgnoredClaim('order_activity_time', 'order-fulfil', 'reviewWindowDays')).toBe(false);
  });

  it('评价期认领 system_comment_time（天），不再是按小时计的活动订单超时（CR-2-j）', () => {
    const fulfil = allConfigGroups().find((group) => group.group === 'order-fulfil');
    expect(fulfil?.legacyKeys?.['reviewWindowDays']).toBe('system_comment_time');
    // And the key it used to claim has no claimant at all now, only a reason.
    expect(buildLegacyKeyIndex().has('order_activity_time')).toBe(false);
    expect(isDroppedConfigKey('order_activity_time')).toBe(true);
  });
});
