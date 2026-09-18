'use strict';
/**
 * Keep the install SQL and the migration's retired lists in agreement.
 *
 * The install SQL must not ship what `drop-retired.php` removes, and the
 * migration must remove what the install SQL no longer ships — otherwise a
 * migrated shop and a fresh install drift apart. This guard parses the retired
 * lists out of the migration script (the single source of truth) and asserts
 * none of them appear in the install SQL's seed rows.
 *
 * The route registry (`eb_system_route`) is deliberately not checked: its rows
 * are inert API documentation, `SystemRouteServices::syncRoute` prunes the stale
 * ones on the running shop, and the strings appear inside response-schema
 * descriptions that no code reads.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

const migration = fs.readFileSync(path.join(root, 'crmeb/upgrade/core-store/drop-retired.php'), 'utf8');
const installSql = fs.readFileSync(path.join(root, 'crmeb/public/install/crmeb.sql'), 'utf8');

function constList(name) {
  const block = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(migration);
  assert(block, name + ' not found in the migration script');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const configTabs = (() => {
  const block = /const RETIRED_CONFIG_TABS = \[([\s\S]*?)\];/.exec(migration);
  assert(block, 'RETIRED_CONFIG_TABS not found');
  return block[1].match(/\d+/g).map(Number);
})();

const failures = [];

// The notification marks, event values and config names double as ordinary
// words elsewhere (route-registry documentation, other identifiers), so each
// list is checked inside its own table's seed rows only.
function seedBlock(table) {
  const statement = new RegExp('INSERT INTO `' + table + '`[\\s\\S]*?VALUES\\n([\\s\\S]*?);\\n').exec(installSql);
  assert(statement, table + ' seed statement not found');
  return statement[1];
}

const configBlock = seedBlock('eb_system_config');
for (const name of constList('RETIRED_CONFIG')) {
  if (name.endsWith('*')) continue;
  if (configBlock.includes("'" + name + "',")) failures.push(`config ${name} still seeded`);
}
for (const auth of constList('RETIRED_MENU_UNIQUE_AUTH')) {
  if (installSql.includes("'" + auth + "'")) failures.push(`menu ${auth} still seeded`);
}
const eventBlock = seedBlock('eb_system_event_data');
for (const value of constList('RETIRED_EVENT_VALUES')) {
  if (eventBlock.includes(", '" + value + "',")) failures.push(`event ${value} still seeded`);
}

const notificationBody = seedBlock('eb_system_notification');
for (const mark of constList('RETIRED_NOTIFICATION_MARKS')) {
  if (notificationBody.includes("'" + mark + "',")) failures.push(`notification ${mark} still seeded`);
}

// Retired tabs must not appear as a seed row id of the config-tab table.
const tabBlock = seedBlock('eb_system_config_tab');
assert(tabBlock, 'eb_system_config_tab seed statement not found');
const tabIds = [...tabBlock.matchAll(/\((\d+),/g)].map((m) => Number(m[1]));
for (const id of configTabs) {
  if (tabIds.includes(id)) failures.push(`config tab ${id} still seeded`);
}

assert.deepStrictEqual(failures, [], 'The install SQL still ships retired seeds:\n' + failures.join('\n'));
console.log(`Install SQL checked: retired config/menu/notification/event seeds absent, ${configTabs.length} retired tabs absent.`);
