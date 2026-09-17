'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const audit = JSON.parse(read('docs/maintenance/request-audit.json'));
const userPage = read('template/admin/src/pages/user/list/index.vue');
const details = read('template/admin/src/pages/user/list/handle/userDetails.vue');
const routes = read('crmeb/app/adminapi/route/user.php').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const retired = ['levelLists()', 'membershipDataList()', 'levelListApi(', 'membershipDataListApi(', 'agentSpreadApi(', 'giveLevelTimeApi(', 'editOtherApi(', 'user/del_level/'];
for (const call of retired) assert(!userPage.includes(call), `user page calls retired feature: ${call}`);
for (const type of ['integral', 'sign', 'spread', 'balance_change']) {
  assert(!details.includes(`val: '${type}'`), `user details exposes ${type}`);
}
for (const route of ["Route::get('give_level/", "Route::put('save_give_level/", "Route::delete('del_level/"]) {
  assert(!routes.includes(route), `retired route registered: ${route}`);
}
for (const entry of audit.requests) {
  assert(entry.trigger && entry.method && entry.path && entry.backend && entry.status && entry.verification, 'Incomplete request audit entry');
  assert(!/token=|1[3-9]\d{9}/i.test(entry.path), 'Audit contains request data');
}
console.log(`Admin contract checked: ${audit.requests.length} audited request paths.`);
