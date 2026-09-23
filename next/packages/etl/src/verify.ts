/**
 * `etl verify` — the question "did the migration work?" answered by looking at
 * both databases, not by trusting the run that just finished.
 *
 * It runs after `run`, against the same pair of databases, and is the check an
 * operator reads before switching traffic. Every check names what it compared
 * so a failure is actionable; nothing here prints a config value.
 *
 * The seven checks (every group has at least a row count in the first):
 *
 *  1. **row counts** — a declared expectation per group, written as a *source
 *     filter → target table* pair. `exact` where the mapper's filter is simple
 *     and documented (a deleted admin is dropped, a 会员券 is dropped); `atMost`
 *     where it drops rows for reasons only its own report can explain, so that
 *     this file does not quietly become a second copy of the mapper.
 *  2. **money sums** — coupon face values, SKU and product prices, group-buy
 *     and presale activity prices add up to the same total on both sides, in
 *     integer arithmetic (`lib/money.ts`). A mapping that loses a row usually
 *     keeps the count and changes the total, or the other way round; checking
 *     both catches either. Groups with no money (system, config, storage,
 *     user, cms, diy, wechat-oa, notification) have nothing to sum; shipping
 *     has prices but regroups them — one legacy row per city became one rule
 *     per set of cities — so a total is not an invariant there, and
 *     **per-group structure** checks what is: every template has exactly one
 *     fallback rule, every courier override landed, every QR code answers to
 *     its legacy scene, every legacy notification template landed under its
 *     new code.
 *  3. **DIY pages as parsed JSON** — CR-1-g1: `jsonb` reorders the keys inside
 *     a node, so byte comparison is meaningless and *document* comparison is
 *     the real invariant. The column is read as text (the driver-wide parser in
 *     `@shop/db`) and parsed here exactly once.
 *  4. **attachments** — every row's file is under the uploads root and its
 *     bytes hash to the stored `sha256`. This is the check that turns "the
 *     rsync said it copied" into "the shop can serve every image".
 *  5. **foreign keys** — every FK constraint is validated and has no orphan.
 *     PostgreSQL enforces these on insert, so a failure here means a constraint
 *     the schema forgot rather than a row the ETL got wrong — which is exactly
 *     the kind of gap worth finding before the cutover and not after.
 *  6. **sequences** — `nextval` is past `max(id)` for every migrated table.
 *     Skip it and the first product an operator creates collides with #1.
 *  7. **not migrated** — the order, cart, payment and refund families are
 *     empty, and no migrated coupon points at an order.
 */

import { stat } from 'node:fs/promises';

import { allNotificationEvents } from '@shop/core/notification';

import { GROUPS } from './groups';
import { digestFile } from './lib/digest';
import { sumDecimalStrings } from './lib/money';
import { findNotMigratedOffenders } from './lib/not-migrated';
import { localFilePath } from './lib/storage-keys';
import { MARK_TO_CODE } from './mappers/notification';
import type { Source } from './source';
import type { Target } from './target';

export interface Check {
  group: string;
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerifyResult {
  checks: Check[];
  pending: { group: string; owner: string }[];
  ok: boolean;
}

export interface VerifyOptions {
  source: Source;
  target: Target;
  uploadsRoot?: string | null;
  /** Hash every attachment rather than a sample. Slow on a real uploads tree. */
  fullDigest?: boolean;
  log?: (line: string) => void;
}

/** A declared expectation: this source filter should produce this many target rows. */
interface CountExpectation {
  group: string;
  sourceTable: string;
  sourceWhere?: string;
  targetTable: string;
  /**
   * Counts only part of the target table — for a table several sources feed.
   * A constant in this file, never interpolated, and printed with the check.
   */
  targetWhere?: string;
  mode: 'exact' | 'atMost';
  /** Why `atMost` rather than `exact`, so the looseness is a decision. */
  note?: string;
}

/**
 * A channel code that was actually generated at WeChat: its ticket lives in
 * `eb_qrcode`, not on the code's own row. The same predicate the mapper applies.
 */
const WECHAT_QRCODE_WITH_TICKET =
  "id in (select third_id from eb_qrcode where third_type = 'wechatqrcode' and ticket <> '')";

/**
 * The activities the mappers keep. Catalog migrates every product, soft-deleted
 * ones included (the `products` count is exact), so "the product survived" is
 * "the product is in the dump". `people >= 2` is the new CHECK on team size.
 */
const GROUPBUY_KEPT =
  'is_del = 0 and people >= 2 and product_id in (select id from eb_store_product)';
const PRESALE_KEPT = 'is_del = 0 and product_id in (select id from eb_store_product)';

const COUNTS: readonly CountExpectation[] = [
  {
    group: 'system',
    sourceTable: 'eb_system_admin',
    sourceWhere: 'is_del = 0',
    targetTable: 'admins',
    mode: 'exact',
  },
  { group: 'system', sourceTable: 'eb_system_role', targetTable: 'roles', mode: 'exact' },
  {
    group: 'storage',
    sourceTable: 'eb_system_attachment_category',
    targetTable: 'attachment_categories',
    mode: 'atMost',
    note: '父子成环的分类会被丢弃并计数（见 storage 报告 categoriesDroppedCycle）',
  },
  {
    group: 'storage',
    sourceTable: 'eb_system_attachment',
    targetTable: 'attachments',
    mode: 'atMost',
    note: '没有路径、路径重复、或本地文件缺失（算不出 sha256）的行会被丢弃并计数',
  },
  {
    group: 'user',
    sourceTable: 'eb_user',
    targetTable: 'users',
    mode: 'exact',
    note: '注销的会员也迁移（带 deleted_at），否则他们的历史订单会悬空',
  },
  {
    group: 'user',
    sourceTable: 'eb_user_address',
    sourceWhere: 'uid in (select uid from eb_user)',
    targetTable: 'user_addresses',
    mode: 'exact',
  },
  {
    group: 'user',
    sourceTable: 'eb_user_label',
    targetTable: 'user_labels',
    mode: 'atMost',
    note: '同名标签只留第一个，其余丢弃并计数（labelsDroppedDuplicateName）',
  },
  {
    group: 'user',
    sourceTable: 'eb_wechat_user',
    targetTable: 'wechat_identities',
    mode: 'atMost',
    note: '账号已不存在或 openid 重复的行会被丢弃并计数',
  },
  {
    group: 'shipping',
    sourceTable: 'eb_shipping_templates',
    targetTable: 'shipping_templates',
    mode: 'exact',
  },
  {
    group: 'catalog',
    sourceTable: 'eb_store_category',
    targetTable: 'product_categories',
    mode: 'exact',
  },
  {
    group: 'catalog',
    sourceTable: 'eb_store_product',
    targetTable: 'products',
    mode: 'exact',
    note: '软删除的商品也要迁移，否则订单明细会悬空',
  },
  {
    group: 'groupbuy',
    sourceTable: 'eb_store_combination',
    sourceWhere: GROUPBUY_KEPT,
    targetTable: 'groupbuy_activities',
    mode: 'exact',
    note: '已删除的、一人成团的（新 CHECK 不允许）、商品已不存在的活动丢弃并计数',
  },
  {
    group: 'groupbuy',
    sourceTable: 'eb_store_product_attr_value',
    sourceWhere: 'type = 3',
    targetTable: 'groupbuy_activity_skus',
    mode: 'atMost',
    note: '活动已丢弃、或商品已没有这个规格的活动价行会被丢弃并计数',
  },
  {
    group: 'presale',
    sourceTable: 'eb_store_advance',
    sourceWhere: PRESALE_KEPT,
    targetTable: 'presale_activities',
    mode: 'exact',
    note: '已删除的、商品已不存在的活动丢弃并计数',
  },
  {
    group: 'presale',
    sourceTable: 'eb_store_product_attr_value',
    sourceWhere: 'type = 6',
    targetTable: 'presale_activity_skus',
    mode: 'atMost',
    note: '活动已丢弃、或商品已没有这个规格的活动价行会被丢弃并计数',
  },
  {
    group: 'coupon',
    sourceTable: 'eb_store_coupon_issue',
    sourceWhere: 'is_del = 0 and receive_type <> 4',
    targetTable: 'coupon_templates',
    mode: 'exact',
    note: '会员券（receive_type = 4）没有新的领取方式，按 COUPON-001 丢弃',
  },
  {
    group: 'coupon',
    sourceTable: 'eb_store_coupon_user',
    targetTable: 'user_coupons',
    mode: 'atMost',
    note: '模板或账号已不存在的券会被丢弃并计数',
  },
  {
    group: 'diy',
    sourceTable: 'eb_diy',
    targetTable: 'diy_pages',
    mode: 'atMost',
    note: 'template_name 行是设置不是页面，value 不是 JSON 的行也不是页面',
  },
  {
    group: 'cms',
    sourceTable: 'eb_article_category',
    targetTable: 'article_categories',
    mode: 'exact',
    note: '删除的分类也迁移（带 deleted_at），过深的层级挂到顶级祖先下',
  },
  { group: 'cms', sourceTable: 'eb_article', targetTable: 'articles', mode: 'exact' },
  {
    group: 'cms',
    sourceTable: 'eb_article_content',
    sourceWhere: 'nid in (select id from eb_article)',
    targetTable: 'article_contents',
    mode: 'exact',
  },
  {
    group: 'wechat-oa',
    sourceTable: 'eb_wechat_qrcode_cate',
    targetTable: 'wechat_qrcode_categories',
    mode: 'exact',
    note: '删除的分类也迁移（带 deleted_at），同名的在线分类后一个名字加上 （#旧 id）',
  },
  {
    group: 'wechat-oa',
    sourceTable: 'eb_wechat_qrcode',
    sourceWhere: WECHAT_QRCODE_WITH_TICKET,
    targetTable: 'wechat_qrcodes',
    mode: 'exact',
    note: '在 eb_qrcode 里没有 ticket 的码从未在微信侧生成过，丢弃并计数',
  },
  {
    group: 'wechat-oa',
    sourceTable: 'eb_wechat_qrcode_record',
    sourceWhere: `qid in (select id from eb_wechat_qrcode where ${WECHAT_QRCODE_WITH_TICKET})`,
    targetTable: 'wechat_qrcode_scans',
    mode: 'exact',
  },
  {
    group: 'wechat-oa',
    // One new row per trigger, not per reply: a legacy reply answering three
    // keywords becomes three rows, so the keys are what is counted.
    sourceTable: 'eb_wechat_key',
    targetTable: 'wechat_auto_replies',
    mode: 'atMost',
    note: '客服消息、空关键词、关键词重复、回复类型未知的触发词丢弃并计数',
  },
  {
    group: 'wechat-oa',
    sourceTable: 'eb_wechat_media',
    sourceWhere: "media_id <> ''",
    targetTable: 'wechat_media',
    mode: 'atMost',
    note: '已过期的临时素材和 (类型, media_id) 重复的行丢弃并计数',
  },
  {
    group: 'notification',
    sourceTable: 'eb_message_system',
    sourceWhere: 'is_del = 0',
    targetTable: 'notification_messages',
    mode: 'atMost',
    note: '收件的会员或管理员已不存在的站内信丢弃并计数',
  },
  {
    // 分类页 / 个人中心 版式：旧库把它们放在 eb_diy 里，新库是 diy 配置组的
    // 两个字段，由 config group 搬运（见 config.ts）。放在这里计数，是因为
    // "运营迁完还得自己重挑一次版式" 正是这条路径存在之前的状况。
    group: 'config',
    sourceTable: 'eb_diy',
    sourceWhere: "template_name in ('category', 'member')",
    targetTable: 'config_values',
    targetWhere: `"group" = 'diy'`,
    mode: 'atMost',
    note: 'value 不是数字的行说明不了任何事，按"没设过"处理，留给 schema 的默认值',
  },
];

export async function verify(options: VerifyOptions): Promise<VerifyResult> {
  const { source, target } = options;
  const log = options.log ?? (() => undefined);
  const checks: Check[] = [];
  const add = (check: Check): void => {
    checks.push(check);
    log(`  ${check.ok ? 'ok  ' : 'FAIL'} ${check.group}/${check.name}: ${check.detail}`);
  };

  const pendingGroups = new Set(GROUPS.filter((group) => group.pending).map((g) => g.name));

  // --- 1. row counts --------------------------------------------------------
  for (const expectation of COUNTS) {
    if (pendingGroups.has(expectation.group)) continue;
    const expected = await source.count(expectation.sourceTable, expectation.sourceWhere);
    const actual =
      expectation.targetWhere === undefined
        ? await target.countRows(expectation.targetTable)
        : await target.countWhere(expectation.targetTable, expectation.targetWhere);
    const ok = expectation.mode === 'exact' ? actual === expected : actual <= expected;
    const where = expectation.sourceWhere === undefined ? '' : ` where ${expectation.sourceWhere}`;
    const targetWhere =
      expectation.targetWhere === undefined ? '' : ` where ${expectation.targetWhere}`;
    add({
      group: expectation.group,
      // A table two expectations look at needs two distinguishable names, or
      // the second check silently reads as a restatement of the first.
      name: `rows:${expectation.targetTable}${targetWhere}`,
      ok,
      detail:
        `${expectation.sourceTable}${where} = ${String(expected)} → ` +
        `${expectation.targetTable}${targetWhere} = ${String(actual)} (${expectation.mode})` +
        (expectation.note === undefined ? '' : `；${expectation.note}`),
    });
  }

  // --- 2. money sums --------------------------------------------------------
  if (!pendingGroups.has('coupon')) {
    await compareMoney(add, {
      group: 'coupon',
      name: 'money:coupon_templates.discount_amount',
      source,
      target,
      sourceTable: 'eb_store_coupon_issue',
      sourceWhere: 'is_del = 0 and receive_type <> 4',
      sourceColumn: 'coupon_price',
      targetTable: 'coupon_templates',
      targetColumn: 'discount_amount',
    });
  }
  if (!pendingGroups.has('catalog')) {
    await compareMoney(add, {
      group: 'catalog',
      name: 'money:product_skus.price',
      source,
      target,
      // `type = 0` is the ordinary SKU. 3 (group-buy) and 6 (presale) are
      // checked under their own groups; the rest belong to retired activities.
      sourceTable: 'eb_store_product_attr_value',
      sourceWhere: 'type = 0',
      sourceColumn: 'price',
      targetTable: 'product_skus',
      targetColumn: 'price',
    });
    await compareMoney(add, {
      group: 'catalog',
      name: 'money:products.price',
      source,
      target,
      sourceTable: 'eb_store_product',
      sourceColumn: 'price',
      targetTable: 'products',
      targetColumn: 'price',
    });
  }

  // Activity prices. Only the activity-level price: the per-variant rows can
  // lose a variant the product no longer has, which the count check allows
  // for, and a sum over them would then fail for a reason already reported.
  if (!pendingGroups.has('groupbuy')) {
    await compareMoney(add, {
      group: 'groupbuy',
      name: 'money:groupbuy_activities.price',
      source,
      target,
      sourceTable: 'eb_store_combination',
      sourceWhere: GROUPBUY_KEPT,
      sourceColumn: 'price',
      targetTable: 'groupbuy_activities',
      targetColumn: 'price',
    });
  }
  if (!pendingGroups.has('presale')) {
    await compareMoney(add, {
      group: 'presale',
      name: 'money:presale_activities.price',
      source,
      target,
      sourceTable: 'eb_store_advance',
      sourceWhere: PRESALE_KEPT,
      sourceColumn: 'price',
      targetTable: 'presale_activities',
      targetColumn: 'price',
    });
  }

  // --- 2b. per-group structure ---------------------------------------------
  // What a count and a sum cannot see. Shipping has no money sum: one legacy
  // row per city became one rule per group of cities, so the prices are
  // regrouped rather than carried and a total means nothing on either side.
  // What must hold instead is that every template can price every address.
  if (!pendingGroups.has('shipping')) {
    add(await verifyShippingFallback(target));
    add(await verifyExpress(source, target));
  }
  if (!pendingGroups.has('wechat-oa')) {
    add(await verifyQrcodeScenes(target));
  }
  if (!pendingGroups.has('notification')) {
    add(await verifyNotificationTemplates(source, target));
  }

  // --- 3. DIY pages, compared as parsed JSON (CR-1-g1) ----------------------
  if (!pendingGroups.has('diy')) {
    add(await verifyDiy(source, target));
  }

  // --- 4. attachments -------------------------------------------------------
  if (!pendingGroups.has('storage')) {
    add(await verifyAttachments(target, options.uploadsRoot ?? null, options.fullDigest === true));
  }

  // --- 5. foreign keys ------------------------------------------------------
  for (const check of await verifyForeignKeys(target)) add(check);

  // --- 6. sequences ---------------------------------------------------------
  add(await verifySequences(target));

  // --- 7. what must not have been migrated ---------------------------------
  const offenders = await findNotMigratedOffenders(target);
  add({
    group: 'all',
    name: 'not-migrated',
    ok: offenders.length === 0,
    detail:
      offenders.length === 0
        ? '订单、购物车、支付、退款相关的表都是空的，已迁移的券也没有指向订单'
        : offenders.map((o) => `${o.table}=${String(o.rows)}（${o.reason}）`).join('; '),
  });

  return {
    checks,
    pending: GROUPS.filter((group) => group.pending).map((group) => ({
      group: group.name,
      owner: group.owner,
    })),
    ok: checks.every((check) => check.ok),
  };
}

// ---------------------------------------------------------------------------

/**
 * The same money column added up on both sides, in integer arithmetic.
 *
 * A mapping that loses rows usually keeps one of count and total unchanged and
 * moves the other, so checking both catches either mistake. Both sides are read
 * as **strings** — `decimal` from mysql2 and `::text` from PostgreSQL — because
 * a float sum of 100k prices is not the same number twice.
 */
async function compareMoney(
  add: (check: Check) => void,
  input: {
    group: string;
    name: string;
    source: Source;
    target: Target;
    sourceTable: string;
    sourceWhere?: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
  },
): Promise<void> {
  const sourceRows = await input.source.rows<Record<string, string | null>>(
    input.sourceTable,
    input.sourceWhere,
  );
  const targetRows = await input.target.query<{ amount: string | null }>(
    `select "${input.targetColumn}"::text as amount from "${input.targetTable}"`,
  );
  const expected = sumDecimalStrings(
    sourceRows.map((row) => row[input.sourceColumn] ?? '0').map(String),
  );
  const actual = sumDecimalStrings(targetRows.map((row) => row.amount ?? '0'));
  add({
    group: input.group,
    name: input.name,
    ok: expected === actual,
    detail:
      `${input.sourceTable}.${input.sourceColumn} 合计 ${expected} → ` +
      `${input.targetTable}.${input.targetColumn} 合计 ${actual}`,
  });
}

/** Every template has exactly one fallback rule, or some address has no price. */
async function verifyShippingFallback(target: Target): Promise<Check> {
  const rows = await target.query<{ id: string; fallbacks: string }>(
    `select t.id::text as id,
            (select count(*) from shipping_template_regions r
              where r.template_id = t.id and r.is_fallback)::text as fallbacks
       from shipping_templates t
      order by t.id`,
  );
  const wrong = rows.filter((row) => row.fallbacks !== '1');
  return {
    group: 'shipping',
    name: 'shipping:fallback',
    ok: wrong.length === 0,
    detail:
      wrong.length === 0
        ? `${String(rows.length)} 个运费模板都恰好有一条兜底规则，任何收货地址都算得出运费`
        : `兜底规则不是恰好一条的模板：${wrong
            .slice(0, 10)
            .map((row) => `#${row.id}（${row.fallbacks} 条）`)
            .join(', ')}`,
  };
}

/**
 * Every legacy courier is in `express_companies` with the operator's code,
 * sort order and switch — or, when a different seeded id already holds its
 * code, the seed row is still there (the mapper left it and counted it).
 */
async function verifyExpress(source: Source, target: Target): Promise<Check> {
  interface LegacyExpress {
    id: number;
    code: string;
    sort: number;
    is_show: number;
  }
  const legacy = await source.rows<LegacyExpress>('eb_express');
  const rows = await target.query<{
    id: string;
    code: string;
    sort_order: number;
    is_enabled: boolean;
  }>('select id::text as id, code, sort_order, is_enabled from express_companies');
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  const byCode = new Map(rows.map((row) => [row.code, Number(row.id)]));

  const wrong: string[] = [];
  let leftToSeed = 0;
  for (const row of legacy) {
    const holder = byCode.get(row.code);
    if (holder !== undefined && holder !== row.id) {
      leftToSeed += 1;
      continue;
    }
    const stored = byId.get(row.id);
    if (
      stored?.code !== row.code ||
      stored.sort_order !== row.sort ||
      stored.is_enabled !== (row.is_show === 1)
    ) {
      wrong.push(`#${String(row.id)} ${row.code}`);
    }
  }
  return {
    group: 'shipping',
    name: 'shipping:express',
    ok: wrong.length === 0,
    detail:
      wrong.length === 0
        ? `eb_express 的 ${String(legacy.length - leftToSeed)} 家快递公司的排序与显示开关都已覆盖到种子行上` +
          (leftToSeed === 0
            ? ''
            : `；${String(leftToSeed)} 家的编码已被种子里另一个 id 占用，保留种子行`)
        : `与旧库不一致的快递公司：${wrong.slice(0, 10).join(', ')}`,
  };
}

/**
 * A printed poster encodes the scene string; the new code must answer to the
 * same one, or every poster already on a shop wall stops attributing.
 */
async function verifyQrcodeScenes(target: Target): Promise<Check> {
  const rows = await target.query<{ id: string; scene: string }>(
    'select id::text as id, scene from wechat_qrcodes where scene <> id::text order by id',
  );
  const [total] = await target.query<{ count: string }>(
    'select count(*)::text as count from wechat_qrcodes',
  );
  return {
    group: 'wechat-oa',
    name: 'wechat:scene',
    ok: rows.length === 0,
    detail:
      rows.length === 0
        ? `${total?.count ?? '0'} 个渠道码的 scene 都等于旧 id，已印出去的海报扫出来仍然记在原渠道上`
        : `scene 与旧 id 不符：${rows
            .slice(0, 10)
            .map((row) => `#${row.id}→${row.scene}`)
            .join(', ')}`,
  };
}

/**
 * Every legacy template the registry still knows is in the table under its new
 * code, with the operator's name and audience — i.e. the legacy wording landed
 * rather than a default. First row per code wins, as in the mapper.
 */
async function verifyNotificationTemplates(source: Source, target: Target): Promise<Check> {
  interface LegacyNotification {
    id: number;
    mark: string;
    name: string;
    type: number;
  }
  const registered = new Set(allNotificationEvents().map((event) => event.code));
  const legacy = [...(await source.rows<LegacyNotification>('eb_system_notification'))].sort(
    (a, b) => a.id - b.id,
  );
  const rows = await target.query<{ code: string; name: string; audience: string }>(
    'select code, name, audience::text as audience from notification_templates',
  );
  const byCode = new Map(rows.map((row) => [row.code, row]));

  const seen = new Set<string>();
  const wrong: string[] = [];
  for (const row of legacy) {
    const code = MARK_TO_CODE.get(row.mark);
    if (code === undefined || !registered.has(code) || seen.has(code)) continue;
    seen.add(code);
    const stored = byCode.get(code);
    const audience = row.type === 2 ? 'admin' : 'user';
    if (stored?.name !== row.name || stored.audience !== audience)
      wrong.push(`${row.mark}→${code}`);
  }
  // A registered event with no row is not a failure: the notification service
  // seeds a missing row from the registry's defaults on first read. It is
  // named, so an operator knows which wording is the shipped default.
  const fromDefaults = [...registered].filter((code) => !byCode.has(code)).length;
  return {
    group: 'notification',
    name: 'notification:templates',
    ok: wrong.length === 0,
    detail:
      wrong.length === 0
        ? `${String(seen.size)} 个旧通知模板按新 code 落到表里，名称与受众与旧库一致；` +
          `注册表另有 ${String(fromDefaults)} 个事件没有行，首次读取时按默认值补齐`
        : `未落地或与旧库不一致的模板：${wrong.join(', ')}`,
  };
}

async function verifyDiy(source: Source, target: Target): Promise<Check> {
  interface LegacyDiyRow {
    id: number;
    name: string;
    value: string | null;
  }
  const legacy = await source.rows<LegacyDiyRow>('eb_diy');
  // `content` is jsonb; `@shop/db` makes the driver hand it over as TEXT, so
  // it is parsed here exactly once (CR-6-c) and compared as a document, never
  // as text — `jsonb` reorders the keys inside a node (CR-1-g1).
  const migrated = await target.query<{ id: string; content: string }>(
    'select id::text as id, content::text as content from diy_pages',
  );
  const byId = new Map(migrated.map((row) => [Number(row.id), row.content]));

  const mismatches: string[] = [];
  let compared = 0;
  for (const row of legacy) {
    const stored = byId.get(row.id);
    if (stored === undefined) continue; // dropped on purpose; the count check covers it
    let expected: unknown;
    try {
      expected = JSON.parse(row.value ?? 'null');
    } catch {
      continue;
    }
    compared += 1;
    if (!deepEqual(expected, JSON.parse(stored))) mismatches.push(`#${String(row.id)} ${row.name}`);
  }
  return {
    group: 'diy',
    name: 'diy:content',
    ok: mismatches.length === 0,
    detail:
      mismatches.length === 0
        ? `${String(compared)} 个页面的 content 解析为 JSON 后与旧库完全一致（CR-1-g1：比文档不比字节）`
        : `与旧库不一致的页面：${mismatches.join(', ')}`,
  };
}

async function verifyAttachments(
  target: Target,
  uploadsRoot: string | null,
  full: boolean,
): Promise<Check> {
  const rows = await target.query<{
    id: string;
    storage_key: string;
    sha256: string;
    driver: string;
  }>(
    `select id::text as id, storage_key, sha256, driver from attachments
      where driver = 'local' order by id`,
  );
  if (rows.length === 0) {
    return {
      group: 'storage',
      name: 'storage:files',
      ok: true,
      detail: '没有本地驱动的附件需要核对',
    };
  }
  if (uploadsRoot === null) {
    return {
      group: 'storage',
      name: 'storage:files',
      ok: false,
      detail: `有 ${String(rows.length)} 个本地附件，但没有给 --uploads-root，无法证明文件真的到位了`,
    };
  }
  // Every row's file must exist — that is the check that turns "rsync said it
  // copied" into "the shop can serve every image", and it is cheap. Hashing is
  // not: an uploads tree with videos in it takes minutes, which is a poor use
  // of a cutover window, so by default one row in fifty is hashed and
  // `--full-digest` is the belt-and-braces run before the real switch.
  const every = Math.max(1, Math.ceil(rows.length / 50));
  const missing: string[] = [];
  const wrong: string[] = [];
  let hashed = 0;

  for (const [index, row] of rows.entries()) {
    const file = localFilePath(uploadsRoot, row.storage_key);
    if (file === null) {
      // A key that will not resolve to a path under the uploads root at all:
      // traversal, a NUL, or empty. Nothing can serve it.
      missing.push(row.storage_key);
      continue;
    }
    if (!(full || index % every === 0)) {
      if (!(await fileExists(file))) missing.push(row.storage_key);
      continue;
    }
    const digest = await digestFile(file);
    hashed += 1;
    if (digest === null) missing.push(row.storage_key);
    else if (digest !== row.sha256) wrong.push(row.storage_key);
  }

  const ok = missing.length === 0 && wrong.length === 0;
  return {
    group: 'storage',
    name: 'storage:files',
    ok,
    detail: ok
      ? `${String(rows.length)} 个本地附件的文件都在，其中 ${String(hashed)} 个逐字节校验了 sha256` +
        (full ? '' : '（切换前请用 --full-digest 全量校验一次）')
      : `缺失 ${String(missing.length)} 个（${missing.slice(0, 5).join(', ')}）；` +
        `摘要不符 ${String(wrong.length)} 个（${wrong.slice(0, 5).join(', ')}）`,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function verifyForeignKeys(target: Target): Promise<Check[]> {
  const constraints = await target.query<{
    name: string;
    child: string;
    parent: string;
    child_columns: string[];
    parent_columns: string[];
    validated: boolean;
  }>(`
    select c.conname as name,
           child.relname as child,
           parent.relname as parent,
           array_agg(child_attr.attname order by u.ord) as child_columns,
           array_agg(parent_attr.attname order by u.ord) as parent_columns,
           c.convalidated as validated
      from pg_constraint c
      join pg_class child on child.oid = c.conrelid
      join pg_class parent on parent.oid = c.confrelid
      join lateral unnest(c.conkey, c.confkey) with ordinality as u(child_att, parent_att, ord)
        on true
      join pg_attribute child_attr
        on child_attr.attrelid = c.conrelid and child_attr.attnum = u.child_att
      join pg_attribute parent_attr
        on parent_attr.attrelid = c.confrelid and parent_attr.attnum = u.parent_att
     where c.contype = 'f'
       and child.relnamespace = 'public'::regnamespace
     group by c.conname, child.relname, parent.relname, c.convalidated
     order by child.relname, c.conname
  `);

  const unvalidated = constraints.filter((row) => !row.validated);
  const checks: Check[] = [
    {
      group: 'all',
      name: 'fk:validated',
      ok: unvalidated.length === 0,
      detail:
        unvalidated.length === 0
          ? `${String(constraints.length)} 个外键约束全部处于 VALIDATED 状态`
          : `未校验的外键：${unvalidated.map((row) => row.name).join(', ')}`,
    },
  ];

  // PostgreSQL enforces these on insert, so an orphan means a constraint the
  // schema forgot rather than a row the ETL got wrong. Cheap, and exactly the
  // gap worth finding before a cutover.
  const orphaned: string[] = [];
  for (const constraint of constraints) {
    const childColumn = constraint.child_columns[0];
    const parentColumn = constraint.parent_columns[0];
    if (constraint.child_columns.length !== 1 || !childColumn || !parentColumn) continue;
    const rows = await target.query<{ count: string }>(
      `select count(*)::text as count
         from "${constraint.child}" child
        where child."${childColumn}" is not null
          and not exists (
            select 1 from "${constraint.parent}" parent
             where parent."${parentColumn}" = child."${childColumn}")`,
    );
    if (Number(rows[0]?.count ?? '0') > 0) {
      orphaned.push(
        `${constraint.child}.${childColumn} → ${constraint.parent} (${rows[0]?.count ?? '?'})`,
      );
    }
  }
  checks.push({
    group: 'all',
    name: 'fk:orphans',
    ok: orphaned.length === 0,
    detail: orphaned.length === 0 ? '没有任何悬空外键' : orphaned.join('; '),
  });
  return checks;
}

async function verifySequences(target: Target): Promise<Check> {
  // `pg_get_serial_sequence` *raises* on a table with no such column rather
  // than returning null, and PostgreSQL is free to evaluate it before the join
  // that would have excluded that table — which it does, on `role_permissions`
  // and every other composite-key join table. `materialized` forces the filter
  // to happen first, so the function only ever sees a table that has an `id`.
  const rows = await target.query<{ table_name: string; sequence: string }>(`
    with with_id as materialized (
      select c.relname
        from pg_class c
        join pg_attribute a
          on a.attrelid = c.oid and a.attname = 'id' and a.attnum > 0 and not a.attisdropped
       where c.relkind = 'r' and c.relnamespace = 'public'::regnamespace
    )
    select relname as table_name, pg_get_serial_sequence(relname, 'id') as sequence
      from with_id
     where pg_get_serial_sequence(relname, 'id') is not null
     order by relname
  `);
  const behind: string[] = [];
  let checked = 0;
  for (const row of rows) {
    const [result] = await target.query<{ max_id: string | null; next: string }>(
      `select (select max(id)::text from "${row.table_name}") as max_id,
              (select last_value::text from ${row.sequence}) as next`,
    );
    if (!result || result.max_id === null) continue;
    checked += 1;
    if (Number(result.next) < Number(result.max_id)) {
      behind.push(`${row.table_name}: last_value=${result.next} < max(id)=${result.max_id}`);
    }
  }
  return {
    group: 'all',
    name: 'sequences',
    ok: behind.length === 0,
    detail:
      behind.length === 0
        ? `${String(checked)} 张有数据的表，序列都在 max(id) 之后`
        : behind.join('; '),
  };
}

/** Structural equality for parsed JSON. Key order is irrelevant by design. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    if (leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    return leftKeys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}

export { deepEqual };
