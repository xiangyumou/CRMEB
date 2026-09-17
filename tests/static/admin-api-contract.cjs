'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const removed = JSON.parse(read('crmeb/config/core_store_removed_admin.json'));
const removedPages = JSON.parse(read('crmeb/config/core_store_removed_pages.json'));
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

const source = read('template/admin/src/utils/coreStoreAdmin.js')
  .replace(/^import removed from .*;$/m, '')
  .replace(/^import removedPages from .*;$/m, '')
  .replace(/^export /gm, '');
const context = { removed, removedPages };
vm.createContext(context);
vm.runInContext(source, context);
for (const pathname of removed.menuPaths) {
  assert(context.isRemovedAdminPath('/admin' + pathname), `retired page reachable: ${pathname}`);
}
for (const pathname of ['/admin/user/list', '/admin/user/group', '/admin/marketing/store_combination/index', '/admin/marketing/store_advance/index', '/admin/setting/kefu_config/2/69']) {
  assert(!context.isRemovedAdminPath(pathname), `retained page removed: ${pathname}`);
}
for (const type of removed.removedLinkTypes) assert(context.isRemovedStoreLink(type));
for (const pathname of removedPages) assert(context.isRemovedStoreLink(null, '/' + pathname), `retired link reachable: ${pathname}`);
for (const type of ['combination', 'advance', 'product', 'news']) assert(!context.isRemovedStoreLink(type));
const categories = context.filterStoreLinkCategories([{ type: 'marketing_link', children: [{ type: 'seckill' }, { type: 'combination' }] }]);
assert.strictEqual(categories[0].children.length, 1);
assert.strictEqual(categories[0].children[0].type, 'combination');
const legacyCategories = context.filterStoreLinkCategories([{ type: 'link', name: '营销链接', children: [
  { type: 'link', name: '秒杀链接' }, { type: 'link', name: '拼团链接' },
  { type: 'link', name: '优惠券链接' }, { type: 'link', name: '抽奖链接' }
] }]);
assert.deepStrictEqual(Array.from(legacyCategories[0].children, (item) => item.name), ['拼团链接', '优惠券链接']);
const filtered = context.filterRemovedAdminRoutes([{ path: '/admin/user', children: [{ path: 'level' }, { path: 'list' }] }]);
assert.strictEqual(filtered[0].children.length, 1);
assert.strictEqual(filtered[0].children[0].path, 'list');
assert.strictEqual(context.filterRemovedAdminMenus([{ path: '/admin/user/level', children: [{ path: '/' }] }]).length, 0);
assert.strictEqual(context.filterRemovedAdminMenus([{ path: '/admin/kefu', children: [{ path: '/admin/setting/kefu_config/2/69' }] }])[0].path, '/admin/setting/kefu_config/2/69');
for (const entry of audit.requests) {
  assert(entry.trigger && entry.method && entry.path && entry.backend && entry.status && entry.verification, 'Incomplete request audit entry');
  assert(!/token=|1[3-9]\d{9}/i.test(entry.path), 'Audit contains request data');
}
const configRoutes = removed.api.filter((entry) => entry.method !== 'GET' || !entry.path.includes('?'));
for (const entry of configRoutes) {
  assert(entry.method && entry.path && /^[A-Z]+$/.test(entry.method), 'Invalid retired API entry');
}
console.log(`Admin contract checked: ${audit.requests.length} audited request paths, ${removed.menuPaths.length} retired page prefixes.`);
