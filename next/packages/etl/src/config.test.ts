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
import { CONFIG_VALUE_TRANSFORMS } from './mappers/system';

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
 * A second claimant of `etl_test_site_name`.
 *
 * Two groups claiming one legacy key is a defect on the live registry (see the
 * "one claimant" test below) — but the *fan-out* code has to keep working,
 * because it is what makes that defect visible instead of silently writing the
 * value into whichever group the map happened to iterate first. So the
 * behaviour is covered here, on a registry that exists only in this file.
 */
const delta = defineConfigGroup({
  group: 'etl-test-delta',
  title: 'δ',
  schema: z.object({ siteName: z.string().max(8).default('') }),
  ui: {},
  legacyKeys: { siteName: 'etl_test_site_name' },
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
  it('lists the one group that claims a key', () => {
    const index = buildLegacyKeyIndex(groups);
    expect(index.get('etl_test_site_name')).toEqual([
      { group: 'etl-test-alpha', key: 'siteName', alias: 0 },
    ]);
  });

  it('fans one legacy key out to every group that claims it', () => {
    // Synthetic on purpose: no live key has two claimants any more (the test
    // below is what keeps it that way), and the fan-out is what would report
    // the next one rather than silently picking a winner.
    const index = buildLegacyKeyIndex([...groups, delta]);
    expect(index.get('etl_test_site_name')).toEqual([
      { group: 'etl-test-alpha', key: 'siteName', alias: 0 },
      { group: 'etl-test-delta', key: 'siteName', alias: 0 },
    ]);
  });

  it('gives wechat_appid to the wechat group alone', () => {
    // `wechat` (C's) and `wechat-oa` both used to claim it, so a migrated shop
    // held the app id in one screen and a blank in the other. CR-1-j settled it
    // the other way round: the `wechat` group owns the Official Account
    // credentials and `wechat-oa` reads them. This guards that decision.
    const claimants = buildLegacyKeyIndex().get('wechat_appid') ?? [];
    expect(claimants).toEqual([{ group: 'wechat', key: 'oaAppId', alias: 0 }]);
  });

  it('gives routine_appId to the wechat group alone', () => {
    // The mini-program sibling of the case above, settled by E4 the same way:
    // every WeChat credential belongs to the `wechat` group, and `wechat-mini`
    // keeps only the switch and the 客服 settings.
    const claimants = buildLegacyKeyIndex().get('routine_appId') ?? [];
    expect(claimants).toEqual([{ group: 'wechat', key: 'miniAppId', alias: 0 }]);
  });

  it('no legacy key on the live registry has two claimants, beyond the one that is tracked', () => {
    // The general form of the two tests above, and the reason CR-1-j was filed:
    // a key claimed twice migrates into one screen and leaves the other blank,
    // with nothing on either screen to say why. A group that copies an existing
    // `legacyKeys` entry fails here rather than in a migrated shop.
    //
    // The exceptions are spelled out with their reason rather than skipped, and
    // the assertion is an equality: a new duplicate fails, and so does removing
    // one of these without deleting its line — which is how the entry gets
    // cleaned up when CR-6-f1 lands instead of outliving it.
    const EXPECTED: Record<string, string> = {
      // B3 folded `trade` away (CR-6-f1, 2026-09-23): the four keys it shared
      // with `catalog`, `order-fulfil` and `order-staff` now have one claimant
      // each, which is what this test wants to stay true.
      // Not a duplicate of the CR-1-j kind: one legacy value that two domains
      // genuinely read — the pay-notify callback host and the storefront's own
      // base url. They are separately editable afterwards (a shop that moves
      // its H5 site keeps the notify host), so both claim the seed value.
      site_url: 'payment, storefront-auth',
    };

    const shared = Object.fromEntries(
      [...buildLegacyKeyIndex().entries()]
        // The throwaway groups above register themselves like any other, so
        // they turn up in the live index too. `etl_test_site_name` is claimed
        // twice on purpose by the fan-out test.
        .map(
          ([legacyKey, claimants]) =>
            [
              legacyKey,
              [...new Set(claimants.map((c) => c.group))].filter(
                (group) => !group.startsWith('etl-test-'),
              ),
            ] as const,
        )
        .filter(([, groups]) => groups.length > 1)
        .map(([legacyKey, groups]) => [legacyKey, [...groups].sort().join(', ')]),
    );
    expect(shared).toEqual(EXPECTED);
  });

  it('no WeChat credential is claimed twice', () => {
    // The part of the rule above that E4 is answerable for, stated so it cannot
    // be widened by adding a line to that table: nothing under `wechat_*` or
    // `routine_*` may be claimed by two groups, whatever else is.
    const shared = [...buildLegacyKeyIndex().entries()]
      .filter(([key]) => key.startsWith('wechat_') || key.startsWith('routine_'))
      .filter(([, claimants]) => new Set(claimants.map((c) => c.group)).size > 1)
      .map(
        ([legacyKey, claimants]) => `${legacyKey} → ${claimants.map((c) => c.group).join(', ')}`,
      );
    expect(shared).toEqual([]);
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

// ---------------------------------------------------------------------------
// the two 版式 numbers, which were never eb_system_config rows
// ---------------------------------------------------------------------------

/**
 * `diy.categoryLayout` / `diy.userCenterLayout` (F4's leftover).
 *
 * Against the **real** `diy` group rather than a throwaway one, because half of
 * what is being tested is that the legacy number satisfies the schema the admin
 * screen validates against: CR-3-h2 §3 described these as booleans, the
 * production fixtures carry `category: 1` and `member: 2`, and a boolean would
 * have collapsed two of the three layouts into one.
 */
describe('版式 rows out of eb_diy', () => {
  const diyGroup = allConfigGroups().find((group) => group.group === 'diy');
  const only = { groups: diyGroup === undefined ? [] : [diyGroup], now: NOW };

  /** One `eb_diy` row, as the group's `where` clause hands it over. */
  const diyRow = (
    template_name: string,
    value: unknown,
  ): { template_name: string; value: unknown } => ({
    template_name,
    value,
  });

  it('the diy group is on the live registry, with both fields', () => {
    expect(diyGroup).toBeDefined();
    expect(diyGroup!.schema.safeParse({ categoryLayout: 2, userCenterLayout: 3 }).success).toBe(
      true,
    );
  });

  it('carries both numbers into config_values, out of a longtext column', () => {
    const { values, report } = mapConfig([], {
      ...only,
      // The column is a longtext, so a real dump hands the number over as a
      // string while an already-parsed row hands over a number. Both must land.
      diy: [diyRow('category', '2'), diyRow('member', 3)],
    });

    expect(values).toEqual([
      { group: 'diy', key: 'categoryLayout', value: 2, updatedAt: NOW, updatedBy: null },
      { group: 'diy', key: 'userCenterLayout', value: 3, updatedAt: NOW, updatedBy: null },
    ]);
    // Named by the table and `template_name` they really came from — there is
    // no `menu_name` to quote, and inventing one would be a lie in the report
    // an operator reads to answer "did my settings come across".
    expect(report.mapped).toEqual([
      { legacyKey: 'eb_diy.category', group: 'diy', key: 'categoryLayout', marker: '<set>' },
      { legacyKey: 'eb_diy.member', group: 'diy', key: 'userCenterLayout', marker: '<set>' },
    ]);
    expect(report.groupsWithoutLegacyValues).toEqual([]);
  });

  it('writes only the row that exists, and leaves the other to its default', () => {
    const { values, report } = mapConfig([], { ...only, diy: [diyRow('category', '3')] });

    // Not `userCenterLayout: 1`: storing a default turns it into a value that
    // survives a later change of that default.
    expect(values).toEqual([
      { group: 'diy', key: 'categoryLayout', value: 3, updatedAt: NOW, updatedBy: null },
    ]);
    expect(report.invalid).toEqual([]);
  });

  it('ignores a settings row that says nothing, and the ones with no new home', () => {
    const { values } = mapConfig([], {
      ...only,
      diy: [
        diyRow('category', ''), // the operator never touched the screen
        diyRow('member', null), // ditto, in a dump that writes NULL
        diyRow('color_change', '1'), // 一键换色 is not ported
        diyRow('product_detail', '{"value":[]}'), // a template row, not a number
      ],
    });
    expect(values).toEqual([]);
  });

  it('走的是同一条校验路径：schema 不收的版式号照样让迁移停下来', () => {
    let error: ConfigMigrationError | undefined;
    try {
      mapConfig([], { ...only, diy: [diyRow('category', '9')] });
    } catch (thrown) {
      error = thrown as ConfigMigrationError;
    }
    expect(error).toBeInstanceOf(ConfigMigrationError);
    expect(error?.message).toContain('diy.categoryLayout');
  });

  it('--allow-invalid-config 让坏掉的那个回落到默认值，好的那个照迁', () => {
    const { values, report } = mapConfig([], {
      ...only,
      allowInvalid: true,
      diy: [diyRow('category', '9'), diyRow('member', '2')],
    });
    expect(report.invalid).toHaveLength(1);
    expect(values).toEqual([
      { group: 'diy', key: 'userCenterLayout', value: 2, updatedAt: NOW, updatedBy: null },
    ]);
  });

  it('跑两遍得到一模一样的行（ETL-J-001）', () => {
    const input = { ...only, diy: [diyRow('category', '2'), diyRow('member', '3')] };
    expect(mapConfig([], input).values).toEqual(mapConfig([], input).values);
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

describe('物流查询服务 (CR-2-f2)', () => {
  it('no legacy logistics_type value can land on 快递100', () => {
    // The option is gone from `logisticsConfig.provider`, and the reason it
    // could go without a data decision is that nothing migrates onto it: the
    // legacy column carries `2` (阿里云云市场; `1` was 一号通). This pins that — every spelling
    // the old form could have written is checked against the *live* registry,
    // so re-adding the value to the enum without re-reading this test fails.
    const logistics = allConfigGroups().find((group) => group.group === 'logistics');
    expect(logistics?.legacyKeys?.['provider']).toBe('logistics_type');

    for (const raw of ['"1"', '"2"', '"0"', '"kuaidi100"', '"aliyun-market"']) {
      const { values } = mapConfig([row('logistics_type', raw)], {
        now: NOW,
        allowInvalid: true,
      });
      const provider = values.filter((v) => v.group === 'logistics' && v.key === 'provider');
      expect(provider.map((v) => v.value)).not.toContain('kuaidi100');
    }
  });

  it('the group no longer carries the 快递100-only 客户编号 field', () => {
    const logistics = allConfigGroups().find((group) => group.group === 'logistics');
    expect(Object.keys(logistics?.schema.shape ?? {})).not.toContain('customer');
  });
});

describe('legacy radio codes decode onto the named enums (first production-dump drill)', () => {
  // The dump's own shape: JSON-encoded, the option *code* the legacy form wrote.
  const valueOf = (legacyKey: string, raw: string, group: string, key: string): unknown => {
    const { values, report } = mapConfig([row(legacyKey, raw)], { now: NOW });
    expect(report.invalid).toEqual([]);
    return values.find((v) => v.group === group && v.key === key)?.value;
  };

  it.each([
    ['upload_type', '"1"', 'storage', 'driver', 'local'],
    ['upload_type', '"3"', 'storage', 'driver', 's3'],
    ['sms_type', '"0"', 'sms', 'provider', 'none'],
    ['sms_type', '1', 'sms', 'provider', 'aliyun'],
    ['sms_type', '2', 'sms', 'provider', 'tencent'],
    ['logistics_type', '1', 'logistics', 'provider', 'none'],
    ['logistics_type', '2', 'logistics', 'provider', 'aliyun-market'],
    ['routine_encode', '0', 'wechat', 'miniMessageMode', 'plain'],
    ['wechat_encode', '1', 'wechat-oa', 'messageMode', 'compatible'],
    ['wechat_encode', '"2"', 'wechat-oa', 'messageMode', 'safe'],
    ['routine_contact_type', '0', 'wechat-mini', 'contactType', 'mini-program'],
    ['routine_contact_type', '1', 'wechat-mini', 'contactType', 'mini-program'],
  ])('%s = %s → %s.%s = %s', (legacyKey, raw, group, key, expected) => {
    expect(valueOf(legacyKey, raw, group, key)).toBe(expected);
  });

  it('order_notice_admin_uids: a comma list becomes user ids, an empty one none', () => {
    expect(valueOf('order_notice_admin_uids', '"12,34"', 'order-staff', 'staffUserIds')).toEqual([
      12, 34,
    ]);
    expect(valueOf('order_notice_admin_uids', '""', 'order-staff', 'staffUserIds')).toEqual([]);
  });

  it('every claimed enum or array field has a decoder', () => {
    // A string can satisfy a string field and a "0"/"1" a boolean one (coerce),
    // but a legacy code can never satisfy a named enum or a list by itself.
    const typeOf = (schema: unknown): string | undefined => {
      let node = schema as { _zod?: { def: Record<string, unknown> } } | undefined;
      while (
        node?._zod &&
        ['default', 'optional', 'nullable', 'catch'].includes(String(node._zod.def['type']))
      ) {
        node = node._zod.def['innerType'] as typeof node;
      }
      return node?._zod?.def['type'] as string | undefined;
    };
    const missing: string[] = [];
    for (const group of allConfigGroups()) {
      const shape = (group.schema as unknown as { shape: Record<string, unknown> }).shape;
      for (const [field, legacy] of Object.entries(group.legacyKeys ?? {})) {
        if (!['enum', 'array'].includes(typeOf(shape[field]) ?? '')) continue;
        for (const legacyKey of [legacy].flat().filter((k): k is string => k !== undefined)) {
          const decoder =
            CONFIG_VALUE_TRANSFORMS.get(`${group.group}.${field}`) ??
            CONFIG_VALUE_TRANSFORMS.get(legacyKey);
          if (!decoder) missing.push(`${group.group}.${field} ← ${legacyKey}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
