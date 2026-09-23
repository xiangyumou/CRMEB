/**
 * The migration, end to end, against a real MySQL and a real PostgreSQL.
 *
 * The mappers have unit tests on literal rows; this file tests the things a
 * pure function cannot have an opinion about — that the rows survive an actual
 * `INSERT` past actual constraints, that the ids and sequences come out right,
 * and above all that **running it twice produces the same database**. That last
 * one is the property the whole design rests on: a rehearsal that cannot be
 * repeated is a rehearsal you only get to do once.
 *
 * Idempotency is checked by dumping every migrated table after run #1, running
 * the whole thing again, dumping again and comparing the two dumps — not by
 * comparing row counts, which would miss a reload that changed a value, and not
 * by trusting the runner's own report, which is the thing under test.
 *
 * The fixture is synthetic (`test/fixtures/legacy-mini.sql`). Nothing here has
 * ever touched a production dump.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { createDb } from '@shop/db';
import { seedReference } from '@shop/db/seed';
import { createTestDatabase, type TestDatabase } from '@shop/testing';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GROUPS } from './groups';
import { digestText } from './lib/digest';
import { defineGroup } from './mapper';
import { MissingReferenceDataError, run, type RunResult } from './runner';
import { openSource, type Source } from './source';
import { openTarget, type Target } from './target';
import { verify } from './verify';

const FIXTURE = path.resolve(import.meta.dirname, '../test/fixtures/legacy-mini.sql');

/**
 * The files the fixture's `eb_system_attachment` rows point at. `missing.png`
 * is deliberately absent: an attachment whose bytes are gone must be dropped
 * and counted, never given an invented digest (ETL-F1-004).
 */
const UPLOAD_FILES: Record<string, string> = {
  'demo/logo.png': 'synthetic-logo-bytes',
  'demo/banner.jpg': 'synthetic-banner-bytes',
  'demo/goods-1.png': 'synthetic-goods-bytes',
};

/** Load order, as `groups.ts` declares it: a foreign-key order. */
const ALL_GROUPS = [
  'system',
  'config',
  'storage',
  'user',
  'shipping',
  'catalog',
  'groupbuy',
  'presale',
  'coupon',
  'cms',
  'diy',
  'wechat-oa',
  'notification',
];

/** A group whose mapper has not landed, for the `--require-complete` refusal. */
const UNFINISHED = defineGroup<{ rows?: readonly unknown[] }, { report: object }>({
  name: 'unfinished',
  title: '测试用：还没落地的 group',
  owner: 'test',
  mapper: null,
  sources: [],
  targets: [],
});

/** A group that maps fine and then fails inside the transaction, last in the run. */
const EXPLODING = defineGroup<object, { report: object }>({
  name: 'exploding',
  title: '测试用：在事务里失败的 group',
  owner: 'test',
  mapper: () => ({ report: {} }),
  sources: [],
  targets: [],
  extras: async (context) => {
    await context.selectTarget('no_such_table', ['id']);
    return {};
  },
});

function reportOf(result: RunResult, group: string): Record<string, unknown> {
  const found = result.groups.find((entry) => entry.group === group);
  return (found?.report ?? {}) as Record<string, unknown>;
}

describe('etl run + verify', () => {
  let container: StartedMySqlContainer;
  let legacyUrl: string;
  let database: TestDatabase;
  let uploadsRoot: string;
  let source: Source;
  let target: Target;

  beforeAll(async () => {
    container = await new MySqlContainer('mysql:8.0')
      .withDatabase('crmeb_legacy')
      .withUsername('crmeb')
      .withUserPassword('crmeb')
      .start();
    legacyUrl = container.getConnectionUri();

    // Loading the dump needs `multipleStatements`, which `openSource`
    // deliberately refuses — so it gets its own short-lived connection.
    const loader = await mysql.createConnection({
      uri: legacyUrl,
      multipleStatements: true,
      charset: 'utf8mb4_general_ci',
    });
    const { readFile } = await import('node:fs/promises');
    await loader.query(await readFile(FIXTURE, 'utf8'));
    await loader.end();

    uploadsRoot = await mkdtemp(path.join(tmpdir(), 'etl-uploads-'));
    for (const [relative, contents] of Object.entries(UPLOAD_FILES)) {
      const file = path.join(uploadsRoot, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents);
    }

    database = await createTestDatabase();
    source = await openSource(legacyUrl);
    target = openTarget(database.url);
    await seedCities(target);
    await seedCouriers(target);
  }, 300_000);

  afterAll(async () => {
    await source?.close().catch(() => undefined);
    await target?.close().catch(() => undefined);
    await database?.drop().catch(() => undefined);
    await container?.stop().catch(() => undefined);
    if (uploadsRoot) await rm(uploadsRoot, { recursive: true, force: true });
  }, 120_000);

  it('迁移一遍，把该迁的迁过去，把该丢的丢掉并记账', async () => {
    // The cutover gate itself: every group has landed, so `--require-complete`
    // runs rather than refusing (ETL-J-005).
    const result = await run({
      source,
      target,
      uploadsRoot,
      requireComplete: true,
      migratedAt: new Date('2026-01-01'),
    });

    const loaded = result.groups.filter((group) => group.status === 'loaded');
    expect(loaded.map((group) => group.group)).toEqual(ALL_GROUPS);
    expect(result.pending).toEqual([]);

    // 三个管理员，其中一个 is_del = 1。
    expect(await target.countRows('admins')).toBe(2);
    expect(await target.countRows('roles')).toBe(3);

    // 四张券，去掉会员券和已删除的，剩两张。
    expect(await target.countRows('coupon_templates')).toBe(2);

    // 软删除的商品也要在，但 deleted_at 不为空。
    expect(await target.countRows('products')).toBe(4);
    const [deleted] = await target.query<{ count: string }>(
      'select count(*)::text as count from products where deleted_at is not null',
    );
    expect(deleted?.count).toBe('1');

    // 旧 id 必须原样保留——工单里引用的商品号迁完还要能用。
    const ids = await target.query<{ id: string }>(
      'select id::text as id from products order by id',
    );
    expect(ids.map((row) => row.id)).toEqual(['1', '2', '3', '4']);

    // 文件存在的附件才迁，缺文件的那一行被丢掉，摘要是真算出来的。
    expect(await target.countRows('attachments')).toBe(3);
    const [logo] = await target.query<{ sha256: string; storage_key: string }>(
      `select sha256, storage_key from attachments where storage_key like '%logo.png'`,
    );
    expect(logo?.sha256).toBe(digestText(UPLOAD_FILES['demo/logo.png']!));

    // 用户先于 catalog 迁移，所以指向用户的行这次有主人了：两张领取记录、
    // 两条收藏（第三条是 like，不是收藏），评价的 user_id 也补齐了。
    expect(await target.countRows('user_coupons')).toBe(2);
    expect(await target.countRows('product_favorites')).toBe(2);
    expect(await target.countRows('product_reviews')).toBe(2);
    expect(await target.countWhere('product_reviews', 'user_id is null')).toBe(0);

    // 地址：city_id = 0 的那条必须落成 NULL，而不是指向 id 0 的外键；字典里查不到
    // 的那条也落成 NULL 并被点名计数，而不是让一条外键把整个 group 一起回滚。
    expect(await target.countRows('user_addresses')).toBe(4);
    expect(await target.countWhere('user_addresses', 'city_id is null')).toBe(2);
    expect(await target.countWhere('user_addresses', 'city_id = 1')).toBe(2);
    const userGroup = loaded.find((group) => group.group === 'user');
    expect((userGroup?.report as { addressesCityCleared?: number }).addressesCityCleared).toBe(1);

    // 微信身份沿用 eb_wechat_user.id，所以重跑一次同一个关注者还是同一个号。
    const identityIds = await target.query<{ id: string }>(
      'select id::text as id from wechat_identities order by id',
    );
    expect(identityIds.map((row) => row.id)).toEqual(['1']);
    const catalog = loaded.find((group) => group.group === 'catalog');
    expect(JSON.stringify(catalog?.report)).toMatch(/\d/);

    // --- shipping ----------------------------------------------------------
    // 两个模板；#1 的兜底 + 北京两城一条规则，#2 补出来的零运费兜底 = 3 条规则。
    // 只指向字典外城市的那条规则整条丢掉，孤儿行、无门槛的包邮行也丢掉，都记账。
    expect(await target.countRows('shipping_templates')).toBe(2);
    expect(await target.countRows('shipping_template_regions')).toBe(3);
    expect(await target.countWhere('shipping_template_regions', 'is_fallback')).toBe(2);
    expect(await target.countRows('shipping_template_region_cities')).toBe(2);
    expect(await target.countRows('shipping_template_free_rules')).toBe(1);
    expect(await target.countRows('shipping_template_free_rule_cities')).toBe(1);
    expect(await target.countRows('shipping_template_no_delivery_cities')).toBe(1);
    // 种子里的三家还是三家：两家带上了运营的排序与开关，撞编码的那家留给种子。
    expect(await target.countRows('express_companies')).toBe(3);
    const couriers = await target.query<{ id: string; sort_order: number; is_enabled: boolean }>(
      'select id::text as id, sort_order, is_enabled from express_companies order by id',
    );
    expect(couriers).toEqual([
      { id: '2', sort_order: 10, is_enabled: true },
      { id: '3', sort_order: 20, is_enabled: false },
      { id: '4', sort_order: 0, is_enabled: true },
    ]);
    expect(reportOf(result, 'shipping')).toMatchObject({
      templatesFallbackSynthesised: 1,
      citiesDroppedUnknown: 2,
      rulesDroppedNoKnownCity: 1,
      orphanedChildRows: 1,
      freeRulesWithoutThreshold: 1,
      expressDroppedCodeTaken: 1,
    });
    // 商品乙按模板计运费：shipping 先迁，所以这次链接保得住。
    expect(await target.countWhere('products', 'shipping_template_id = 1')).toBe(1);

    // --- cms -------------------------------------------------------------------
    expect(await target.countRows('article_categories')).toBe(3);
    expect(await target.countWhere('article_categories', 'deleted_at is not null')).toBe(1);
    expect(await target.countRows('articles')).toBe(2);
    expect(await target.countWhere('articles', 'product_id = 1')).toBe(1);
    expect(await target.countRows('article_contents')).toBe(2);
    expect(await target.countWhere('article_contents', `content_html like '%<script%'`)).toBe(0);
    expect(reportOf(result, 'cms')).toMatchObject({
      articlesProductCleared: 1,
      contentsOrphaned: 1,
      contentsUnsanitised: 0,
    });

    // --- wechat-oa -------------------------------------------------------------
    expect(await target.countRows('wechat_oa_menus')).toBe(1);
    expect(await target.countRows('wechat_auto_replies')).toBe(3);
    expect(await target.countRows('wechat_qrcode_categories')).toBe(3);
    expect(await target.countWhere('wechat_qrcode_categories', `name = '线下门店（#2）'`)).toBe(1);
    expect(await target.countRows('wechat_qrcodes')).toBe(1);
    expect(await target.countWhere('wechat_qrcodes', `scene = '1'`)).toBe(1);
    expect(await target.countRows('wechat_qrcode_scans')).toBe(2);
    expect(await target.countWhere('wechat_qrcode_scans', 'user_id is null')).toBe(1);
    expect(await target.countRows('wechat_media')).toBe(1);
    expect(reportOf(result, 'wechat-oa')).toMatchObject({
      repliesDroppedKefu: 1,
      repliesDroppedNoKeyword: 1,
      repliesDroppedUnknownType: 1,
      categoriesRenamedDuplicate: 1,
      qrcodesDroppedNoTicket: 1,
      scansDroppedUnknownQrcode: 1,
      mediaDroppedExpired: 1,
      mediaDroppedNoHandle: 1,
    });

    // --- notification ----------------------------------------------------------
    // 三个旧模板落到新 code 上；分销的那个点名丢弃。站内信：收件人不存在的、
    // 已删除的丢弃，发给管理员的落在 admin_id 上。
    const codes = await target.query<{ code: string }>(
      'select code from notification_templates order by code',
    );
    expect(codes.map((row) => row.code)).toEqual([
      'admin_order_paid',
      'order_paid',
      'order_received',
    ]);
    expect(await target.countRows('notification_messages')).toBe(3);
    expect(await target.countWhere('notification_messages', 'admin_id = 1')).toBe(1);
    expect(reportOf(result, 'notification')).toMatchObject({
      templatesDroppedUnknownMark: ['revenue_received（收益到账）'],
      messagesDroppedDeleted: 1,
      messagesDroppedUnknownRecipient: 1,
    });

    // --- groupbuy / presale ----------------------------------------------------
    // 活动迁过去，活动价行按 (商品, 规格) 对上新 SKU；团和预售订单是订单的一部分，
    // 只记数，不搬运。
    expect(await target.countRows('groupbuy_activities')).toBe(2);
    expect(await target.countRows('groupbuy_activity_skus')).toBe(3);
    expect(await target.countWhere('groupbuy_activities', 'shipping_template_id is null')).toBe(1);
    expect(reportOf(result, 'groupbuy')).toMatchObject({
      activitiesDroppedDeleted: 1,
      activitiesDroppedSeats: 1,
      activitiesDroppedUnknownProduct: 1,
      activitiesShippingTemplateCleared: 1,
      activitySkusDroppedUnknownSku: 1,
      virtualPercentagesDropped: 1,
      teamsSkipped: 2,
    });
    expect(await target.countRows('presale_activities')).toBe(1);
    expect(await target.countRows('presale_activity_skus')).toBe(2);
    expect(await target.countWhere('presale_activities', `payment_mode = 'deposit'`)).toBe(1);
    expect(reportOf(result, 'presale')).toMatchObject({
      activitiesDroppedDeleted: 1,
      activitiesDroppedUnknownProduct: 1,
      activitySkusDroppedUnknownSku: 1,
      presaleOrdersSkipped: 1,
    });

    // 序列必须走到 max(id) 之后，否则运营新建的第一个商品就撞上 1 号。
    const [next] = await target.query<{ value: string }>(
      `select nextval(pg_get_serial_sequence('products','id'))::text as value`,
    );
    expect(Number(next?.value)).toBeGreaterThan(4);
  }, 300_000);

  it('order_cancel_time 按小时换算成分钟（先 JSON 解码再换算）', async () => {
    const [row] = await target.query<{ value: string }>(
      `select value::text as value from config_values
        where "group" = 'order' and key = 'payWindowMinutes'`,
    );
    // 旧库里是 JSON 编码的 "2"（小时）。忘了解码就会得到 NaN，然后静默
    // 回落到默认的 30 分钟——这个断言就是为了钉死那个回落。
    expect(row?.value).toBe('120');
  });

  it('字符串型的数字配置会被转成 schema 要的类型，而不是退回默认值', async () => {
    // 旧库里 store_stock 是 JSON 编码的 "5"，而新 schema 要的是 number。
    // 不做转换的话，真实商城里几乎每一个数值配置都会校验失败，
    // --allow-invalid-config 会把它们统统恢复成出厂设置。
    const [row] = await target.query<{ value: string }>(
      `select value::text as value from config_values
        where "group" = 'catalog' and key = 'stockWarningThreshold'`,
    );
    expect(row?.value).toBe('5');
  });

  it('分类页 / 个人中心 的版式跟着迁过来，运营不用重挑一次', async () => {
    // 旧库把这两个数字放在 eb_diy 里（template_name = category / member，
    // value 是个裸数字），而不是 eb_system_config，所以它们没有 legacyKeys 可
    // 认领。不专门搬一趟，迁完的商城前台「分类」和「我的」两页就悄悄回到版式
    // 一，而且没有任何报告会提这件事。
    const rows = await target.query<{ key: string; value: string }>(
      `select key, value::text as value from config_values
        where "group" = 'diy' order by key`,
    );
    expect(rows).toEqual([
      { key: 'categoryLayout', value: '2' },
      { key: 'userCenterLayout', value: '3' },
    ]);

    // 写进去的是 jsonb 数字，不是字符串 "2"——配置读出来要能直接喂给 schema。
    const [typed] = await target.query<{ kind: string }>(
      `select jsonb_typeof(value) as kind from config_values
        where "group" = 'diy' and key = 'categoryLayout'`,
    );
    expect(typed?.kind).toBe('number');

    // 这两行是 config group 写的，而 diy group 排在它后面。config_values 只能
    // 有一个 owner：run 在重灌一个 group 之前会清空它的目标表，所以 diy group
    // 要是也写这张表，上面那次完整迁移跑到 diy 时就会把 config 刚写进去的几十
    // 项设置一起删掉。下面这条断言就是在钉死"它们还在"。
    expect(await target.countWhere('config_values', `"group" = 'order'`)).toBeGreaterThan(0);
    expect(await target.countWhere('config_values', `"group" = 'catalog'`)).toBeGreaterThan(0);
  });

  it('配置里没有无人认领的键，值一个都没被打印出来', async () => {
    const result = await run({
      source,
      target,
      group: 'config',
      uploadsRoot,
      migratedAt: new Date('2026-01-01'),
    });
    const report = result.groups[0]?.report as {
      unmapped: string[];
      dropped: { legacyKey: string }[];
      mapped: { marker: string }[];
    };
    expect(report.unmapped).toEqual([]);
    // 显式丢弃清单上的键要算作 dropped，而不是 unmapped。
    expect(report.dropped.map((entry) => entry.legacyKey)).toContain('config_export_open');
    // 报告里只有 <set>/<empty> 标记，没有任何取值。这是这份报告最重要的性质：
    // 它会被贴进工单、留在 CI 日志里，而 eb_system_config 里躺着商户私钥。
    for (const entry of report.mapped) {
      expect(['<set>', '<empty>']).toContain(entry.marker);
    }
    const serialised = JSON.stringify(report);
    for (const value of ['示例商城', 'https://shop.example.invalid', '400-000-0000']) {
      expect(serialised).not.toContain(value);
    }
  }, 120_000);

  it('跑第二遍得到逐字节相同的数据库', async () => {
    const before = await dumpMigratedTables(target);
    await run({ source, target, uploadsRoot, migratedAt: new Date('2026-01-01') });
    const after = await dumpMigratedTables(target);
    expect(after).toEqual(before);
  }, 300_000);

  it('verify 全部通过', async () => {
    const result = await verify({ source, target, uploadsRoot, fullDigest: true });
    const failed = result.checks.filter((check) => !check.ok);
    expect(failed.map((check) => `${check.name}: ${check.detail}`)).toEqual([]);
    expect(result.ok).toBe(true);
  }, 300_000);

  it('试运行什么也不改', async () => {
    const before = await dumpMigratedTables(target);
    const result = await run({
      source,
      target,
      dryRun: true,
      uploadsRoot,
      migratedAt: new Date('2026-01-01'),
    });
    expect(result.groups.every((g) => g.status === 'skipped' || g.status === 'pending')).toBe(true);
    expect(await dumpMigratedTables(target)).toEqual(before);
  }, 300_000);

  it('--require-complete 在还有 group 没落地时拒绝跑', async () => {
    // Every real group has landed, so the refusal is proved against a registry
    // with one pending group added — the gate's logic, not today's backlog.
    const before = await dumpMigratedTables(target);
    await expect(
      run({ source, target, requireComplete: true, uploadsRoot, groups: [...GROUPS, UNFINISHED] }),
    ).rejects.toThrow(/mapper 没有落地/);
    // It refuses before touching anything.
    expect(await dumpMigratedTables(target)).toEqual(before);
  });

  it('一个 group 失败，整次迁移回滚，目标库保持原样', async () => {
    // One run is one transaction: a group that fails after earlier groups
    // already wrote leaves the database exactly as it was, not half-migrated.
    const before = await dumpMigratedTables(target);
    const failing = run({
      source,
      target,
      uploadsRoot,
      migratedAt: new Date('2026-01-01'),
      groups: [...GROUPS, EXPLODING],
    });
    await expect(failing).rejects.toThrow(/整次迁移的事务已回滚/);
    expect(await dumpMigratedTables(target)).toEqual(before);
  }, 300_000);

  it('下一次发版重跑 db:seed，迁过来的快递排序、显示开关和通知模板名称都还在', async () => {
    // compose 的 migrate 在每次升级时都跑种子数据（CR-1-r7）。
    const handle = createDb(database.url);
    try {
      await handle.db.transaction((tx) => seedReference(tx));
    } finally {
      await handle.close();
    }
    const result = await verify({ source, target, uploadsRoot });
    const kept = result.checks.filter((check) =>
      ['shipping:express', 'notification:templates'].includes(check.name),
    );
    expect(kept.map((check) => `${check.name}: ${check.ok ? 'ok' : check.detail}`)).toEqual([
      'shipping:express: ok',
      'notification:templates: ok',
    ]);
  }, 300_000);

  it('没跑过种子数据的库，迁移在动手之前就拒绝开始', async () => {
    // 收货地址的 city_id 指向 cities，而 cities 不由迁移产生。忘了跑种子数据时，
    // 正确的表现是开跑之前就说清楚"去跑 db:seed"，而不是在插到一半时抛出一个
    // 外键约束名，让人对着半迁完的库猜。
    const unseeded = await createTestDatabase();
    const emptyTarget = openTarget(unseeded.url);
    try {
      expect(await emptyTarget.query(`select 1 from cities limit 1`)).toEqual([]);
      const failure = run({ source, target: emptyTarget, group: 'user', uploadsRoot });
      await expect(failure).rejects.toThrow(MissingReferenceDataError);
      await expect(failure).rejects.toThrow(/db:seed/);
      // 拒绝得够早：一行都没写进去。
      expect(await emptyTarget.countRows('users')).toBe(0);
    } finally {
      await emptyTarget.close().catch(() => undefined);
      await unseeded.drop().catch(() => undefined);
    }
  }, 120_000);
});

/**
 * The slice of the city dictionary this fixture's addresses point at.
 *
 * In production the whole dictionary arrives from `packages/db`
 * (`pnpm --filter @shop/db db:seed`, 3,939 rows out of `seed-data/cities.json`)
 * before the ETL runs; `scripts/rehearse.sh` does exactly that. Here only the
 * three rows the fixture needs are inserted, with the ids and names the real
 * seed file gives them — the test is about the ETL's behaviour against a seeded
 * database, not about re-testing somebody else's seed.
 */
async function seedCities(target: Target): Promise<void> {
  await target.query(`
    insert into cities (id, parent_id, level, code, name, merger_name, is_visible) values
      (1, null, 0, '110000000000', '北京市', '北京', true),
      (2, 1,    1, '110100000000', '北京市', '北京,北京市', true),
      (3, 2,    2, '110101000000', '东城区', '北京,北京市,东城区', true)
  `);
  // The real seed ends the same way, and `verify` checks it: seed explicit ids
  // without pushing the sequence past them and the first city an operator adds
  // by hand collides with 北京市.
  await target.query(
    `select setval(pg_get_serial_sequence('cities', 'id'), (select max(id) from cities))`,
  );
}

/**
 * The slice of the courier dictionary the fixture's overrides land on, with the
 * ids, codes and defaults `seed-data/express-companies.json` gives them. The
 * `shipping` group upserts onto these rows rather than creating its own.
 */
async function seedCouriers(target: Target): Promise<void> {
  await target.query(`
    insert into express_companies (id, code, name, sort_order, is_enabled) values
      (2, 'shunfeng',  '顺丰速运', 0, true),
      (3, 'yuantong',  '圆通速递', 0, true),
      (4, 'zhongtong', '中通快递', 0, true)
  `);
  await target.query(
    `select setval(pg_get_serial_sequence('express_companies', 'id'), (select max(id) from express_companies))`,
  );
}

/**
 * Every row of every table a group writes, ordered, as text.
 *
 * `::text` on the whole row is the point: it compares *values*, so a reload
 * that changed a timestamp, a price or a JSON document shows up, which a row
 * count never would.
 */
async function dumpMigratedTables(target: Target): Promise<Record<string, string[]>> {
  const tables = await target.query<{ table_name: string }>(`
    select c.relname as table_name
      from pg_class c
     where c.relkind = 'r' and c.relnamespace = 'public'::regnamespace
     order by c.relname
  `);
  const dump: Record<string, string[]> = {};
  for (const { table_name: table } of tables) {
    const rows = await target.query<{ row: string }>(
      `select t::text as row from "${table}" t order by 1`,
    );
    if (rows.length > 0) dump[table] = rows.map((row) => row.row);
  }
  return dump;
}
