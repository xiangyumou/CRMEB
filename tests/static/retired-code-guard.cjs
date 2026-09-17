'use strict';
/**
 * Fail if retired-feature identifiers reappear in the live backend or admin source.
 * Historical pay-type labels are allowed: they only render old orders.
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

const ALLOWED = [
  // The historical label table only maps old order rows to display text.
  { file: 'crmeb/app/services/CoreStore.php', symbol: 'DISABLED_CONFIG' },
];

const failures = [];
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
      if (!new RegExp('\\b' + symbol + '\\b').test(source)) continue;
      if (ALLOWED.some((entry) => entry.file === relative && entry.symbol === symbol)) continue;
      failures.push(`${relative}: retired identifier ${symbol}`);
    }
  }
}

// The hiding mechanism is gone, so its fixtures must not come back either.
for (const gone of ['crmeb/config/core_store_removed_admin.json', 'crmeb/config/upgrade.php', 'crmeb/app/services/CoreStoreAdmin.php', 'template/admin/src/utils/coreStoreAdmin.js']) {
  assert(gone.endsWith('coreStoreAdmin.js') || !fs.existsSync(path.join(root, gone)), `hiding fixture returned: ${gone}`);
}

assert.deepStrictEqual(failures, [], 'Retired-feature identifiers found:\n' + failures.join('\n'));
console.log(`No retired identifiers in ${SCAN.length} scanned roots.`);
