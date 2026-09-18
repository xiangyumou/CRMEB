'use strict';
/**
 * Fail if retired-feature identifiers reappear in the live backend or admin source.
 * Historical pay-type labels are allowed: they only render old orders.
 *
 * Two independent checks run here:
 *   1. retired class/config identifiers, which class-level deletion already cleans,
 *   2. bare retired table names, which survive inside hand-written SQL strings.
 * The second check exists because `SystemClearServices` and the `util` command
 * kept UPDATE/TRUNCATE statements against tables that `apply` renames away, so
 * "replace site url" and "clear data" fail on the very database they target.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

const SCAN = [
  'crmeb/app',
  'crmeb/crmeb',
  'crmeb/route',
  'template/admin/src',
  'template/uni-app/api',
  'template/uni-app/pages/admin',
];

const SYMBOLS = [
  'StoreBargainServices', 'StoreSeckillServices', 'LuckLotteryServices', 'LuckLotteryRecordServices',
  'LiveRoomServices', 'LiveAnchorServices', 'StoreIntegralOrderServices', 'StoreIntegralServices',
  'AgentManageServices', 'AgentLevelServices', 'AgentLevelTaskServices', 'DivisionServices',
  'KefuServices', 'StoreServiceServices', 'StoreServiceRecordServices', 'StoreServiceLogServices',
  'MemberCardServices', 'MemberRightServices', 'MemberCardBatchServices',
  'UserBrokerageServices', 'UserBrokerageFrozenServices', 'UserUserBrokerageServices',
  'UserExtractServices', 'UserRechargeServices', 'UserSignServices', 'UserLevelServices',
  'UserMoneyServices', 'SystemUserLevelServices', 'SystemSignRewardServices', 'SystemUserTaskServices',
  'YuePayServices', 'OrderOfflineServices', 'RechargeServices', 'DeliveryServiceServices',
  'StoreOrderWriteOffServices', 'OtherOrderServices', 'OtherOrderStatusServices',
  'StoreActivityServices', 'PayTransferNotifyServices', 'AliPayService', 'UpgradeService',
  'CoreStoreAdmin', 'DISABLED_CONFIG',
];

/**
 * Files that may still name a retired table because they must reason about it:
 * the migration renames these tables, and its `RETIRED_TABLES` const is the
 * single source of truth this guard reads.
 */
const TABLE_SCAN_EXEMPT = [
  'crmeb/upgrade/core-store/drop-retired.php',
  'crmeb/app/services/CoreStore.php',
  // Laravel-style column names, not table references.
  'crmeb/app/services/message/MessageSystemServices.php',
  'crmeb/app/services/system/SystemEventServices.php',
  'crmeb/app/services/system/SystemCrudServices.php',
  'crmeb/app/adminapi/controller/v1/system/SystemCrud.php',
];

/**
 * Files that still name retired tables because a later cleanup phase rewrites
 * them. These are the real defects this scan was added to catch — "replace site
 * url" and "clear data" fail on any database the migration has run against —
 * and they are listed here only so the guard can land before the rewrite.
 *
 * The baseline is self-expiring: once a file stops referencing retired tables it
 * must be dropped from this list, or the "resolved" check below fails.
 */
const TABLE_BASELINE = [
  'crmeb/app/adminapi/controller/v1/system/SystemClearData.php',
  'crmeb/app/services/system/SystemClearServices.php',
  'crmeb/crmeb/command/Util.php',
];

const failures = [];
const baselined = new Map(TABLE_BASELINE.map((file) => [file, []]));

/** Tables dropped by the migration, plus the notice tables retired alongside them. */
function retiredTables() {
  const migration = fs.readFileSync(path.join(root, 'crmeb/upgrade/core-store/drop-retired.php'), 'utf8');
  const block = /const RETIRED_TABLES = \[([\s\S]*?)\];/.exec(migration);
  assert(block, 'RETIRED_TABLES not found in the migration script');
  const names = new Set([...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]));
  for (const extra of ['system_notice', 'system_notice_admin', 'user_notice', 'user_notice_see', 'user_enter']) names.add(extra);
  assert(names.size > 40, `only ${names.size} retired tables were parsed`);
  return names;
}

const tables = retiredTables();

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');
}

/**
 * Retired table names inside PHP string literals of the backend.
 *
 * Only string literals count: the same words appear as route marks, JSON keys and
 * frontend prop names, and flagging those would bury the real SQL. A literal is
 * treated as SQL when it contains a statement keyword or when it is exactly one
 * table name — the shape `clearData(['store_seckill', …])` uses.
 */
/** Matches a table name, with or without the `eb_` prefix used in hand-written SQL. */
function tablePattern(table) {
  return new RegExp('(^|[^a-z0-9_])(?:[a-z0-9]+_)?' + table + '([^a-z0-9_]|$)');
}

function retiredTableLiterals(source) {
  const sqlKeyword = /\b(SELECT|UPDATE|DELETE|INSERT|REPLACE|TRUNCATE|ALTER|DROP|FROM|JOIN|INTO|TABLE|SHOW\s+TABLES)\b/i;
  const found = new Set();
  for (const match of source.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
    const value = match[1] !== undefined ? match[1] : match[2];
    if (sqlKeyword.test(value)) {
      for (const table of tables) {
        if (tablePattern(table).test(value)) found.add(table);
      }
      continue;
    }
    if (!tables.has(value.trim())) continue;
    // A bare table name only counts as a table when it is a list element or an
    // argument; route marks such as `'mark' => 'user_level'` are just labels.
    const before = source.slice(Math.max(0, match.index - 12), match.index);
    if (/=>\s*$/.test(before)) continue;
    found.add(value.trim());
  }
  return found;
}

for (const dir of SCAN) {
  const base = path.join(root, dir);
  if (!fs.existsSync(base)) continue;
  const files = [];
  (function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', 'unpackage', 'dist', '.git'].includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(php|js|vue|cjs|mjs)$/.test(entry.name)) files.push(full);
    }
  })(base);
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const source = fs.readFileSync(file, 'utf8');
    for (const symbol of SYMBOLS) {
      if (new RegExp('\\b' + symbol + '\\b').test(source)) {
        failures.push(`${relative}: retired identifier ${symbol}`);
      }
    }
    if (!/^crmeb\/(app|crmeb)\//.test(relative) || TABLE_SCAN_EXEMPT.includes(relative)) continue;
    for (const table of retiredTableLiterals(stripComments(source))) {
      if (baselined.has(relative)) baselined.get(relative).push(table);
      else failures.push(`${relative}: retired table ${table}`);
    }
  }
}

const resolvedBaseline = [...baselined]
  .filter(([, hits]) => hits.length === 0)
  .map(([file]) => file);
assert.deepStrictEqual(resolvedBaseline, [],
  'These files no longer reference retired tables — drop them from TABLE_BASELINE:\n' + resolvedBaseline.join('\n'));

// The hiding mechanism is gone, so its fixtures must not come back either.
for (const gone of ['crmeb/config/core_store_removed_admin.json', 'crmeb/config/upgrade.php', 'crmeb/app/services/CoreStoreAdmin.php']) {
  assert(!fs.existsSync(path.join(root, gone)), `hiding fixture returned: ${gone}`);
}
assert(!new RegExp('\\bDISABLED_CONFIG\\b').test(fs.readFileSync(path.join(root, 'crmeb/app/services/CoreStore.php'), 'utf8')),
  'CoreStore.php still defines the retired DISABLED_CONFIG override');

assert.deepStrictEqual(failures, [], 'Retired-feature references found:\n' + failures.join('\n'));
console.log(`No retired identifiers or table names in ${SCAN.length} scanned roots (${tables.size} tables).`);
