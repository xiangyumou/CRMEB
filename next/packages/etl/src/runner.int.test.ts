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
import { createTestDatabase, type TestDatabase } from '@shop/testing';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { digestText } from './lib/digest';
import { MissingReferenceDataError, run } from './runner';
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
  }, 300_000);

  afterAll(async () => {
    await source?.close().catch(() => undefined);
    await target?.close().catch(() => undefined);
    await database?.drop().catch(() => undefined);
    await container?.stop().catch(() => undefined);
    if (uploadsRoot) await rm(uploadsRoot, { recursive: true, force: true });
  }, 120_000);

  it('迁移一遍，把该迁的迁过去，把该丢的丢掉并记账', async () => {
    const result = await run({ source, target, uploadsRoot, migratedAt: new Date('2026-01-01') });

    const loaded = result.groups.filter((group) => group.status === 'loaded');
    expect(loaded.map((group) => group.group)).toEqual([
      'system',
      'config',
      'storage',
      'user',
      'catalog',
      'coupon',
      'diy',
    ]);
    expect(result.pending.map((group) => group.group)).toEqual([
      'shipping',
      'cms',
      'wechat-oa',
      'notification',
    ]);

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

    // 地址：city_id = 0 的那条必须落成 NULL，而不是指向 id 0 的外键。
    expect(await target.countRows('user_addresses')).toBe(3);
    expect(await target.countWhere('user_addresses', 'city_id is null')).toBe(1);
    expect(await target.countWhere('user_addresses', 'city_id = 1')).toBe(2);
    const catalog = loaded.find((group) => group.group === 'catalog');
    expect(JSON.stringify(catalog?.report)).toMatch(/\d/);

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
    await expect(run({ source, target, requireComplete: true, uploadsRoot })).rejects.toThrow(
      /mapper 没有落地/,
    );
  });

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
