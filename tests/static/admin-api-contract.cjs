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

// ---------------------------------------------------------------------------
// 配置表单页：所有配置页共用 setSystem 组件，接口必须真实存在，否则整页 404 后空白
// ---------------------------------------------------------------------------
const setSystem = read('template/admin/src/pages/setting/setSystem/index.vue');
for (const retired of ['integral_config', 'agent/config']) {
  assert(!setSystem.includes(retired), `setSystem still calls retired endpoint: ${retired}`);
  assert(!read('template/admin/src/api/order.js').includes(retired), `api/order.js still calls retired endpoint: ${retired}`);
}
const setSystemEndpoints = [...setSystem.matchAll(/'([a-z_/]+edit_basics)'/g)].map((match) => match[1]);
assert(setSystemEndpoints.length >= 3, 'setSystem no longer declares its config endpoints');
for (const endpoint of setSystemEndpoints) {
  const [group, ...rest] = endpoint.split('/');
  const routeFile = read(`crmeb/app/adminapi/route/${group}.php`);
  assert(routeFile.includes(`Route::group('${group}'`), `setSystem endpoint ${endpoint} has no ${group} route group`);
  assert(routeFile.includes(`'${rest.join('/')}'`), `setSystem endpoint ${endpoint} is not registered in ${group}.php`);
}

// ---------------------------------------------------------------------------
// 精简商城删掉的接口不能从仍可达的后台页面里发出来
// ---------------------------------------------------------------------------
const retiredApiPatterns = [
  /order\/write(_update)?/,
  /order\/pay_offline/,
  /order\/refund_integral/,
  /order\/scan_list/,
  /order\/offline_scan/,
  /order\/delivery\/(index|add|save|list|set_status|update|del)/,
  /setting\/(sign_data|seckill_data)/,
  /system\/version_(list|crate|save|del)/,
  /system\/(upgrade_status|upgrade\/|upgradeable\/|upgrade_log\/|package_download|upgrade_download\/|upgrade_progress|cross_version\/|rollback\/)/,
  /integral_config/,
  /agent\/config/,
  /merchant\//,
];
const adminSrc = path.join(root, 'template/admin/src');
const routerModules = fs.readdirSync(path.join(adminSrc, 'router/modules')).filter((file) => file.endsWith('.js'));
const retainedPages = new Set();
for (const moduleFile of routerModules) {
  const moduleSource = fs.readFileSync(path.join(adminSrc, 'router/modules', moduleFile), 'utf8');
  const rootMatch = moduleSource.match(/path:\s*routePre\s*\+\s*'([^']+)'/);
  const rootPath = rootMatch ? '/admin' + rootMatch[1] : '';
  const re = /path:\s*'([^']+)'([\s\S]{0,600}?)component:\s*\(\)\s*=>\s*import\('([^']+)'\)/g;
  let match;
  while ((match = re.exec(moduleSource))) {
    if (context.isRemovedAdminPath(rootPath + '/' + match[1])) continue;
    let relative = match[3].replace(/^@\//, '');
    if (!/\.(vue|js)$/.test(relative)) relative += '.vue';
    retainedPages.add(path.resolve(path.join(adminSrc, relative)));
  }
}
assert(retainedPages.size > 100, `unexpectedly few retained pages: ${retainedPages.size}`);

// 组件里的相对引用（弹窗、子组件）同样按保留页面处理
const pageSources = new Map();
const collectPage = (file, depth) => {
  if (pageSources.has(file) || depth > 3 || !fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  pageSources.set(file, text);
  for (const importMatch of text.matchAll(/from\s+'(\.[^']+)'/g)) {
    const base = path.resolve(path.dirname(file), importMatch[1]);
    for (const extension of ['', '.vue', '.js', '/index.vue', '/index.js']) {
      if (fs.existsSync(base + extension) && fs.statSync(base + extension).isFile()) {
        collectPage(base + extension, depth + 1);
        break;
      }
    }
  }
};
for (const page of retainedPages) collectPage(page, 0);

// api/*.js 的导出函数 -> 真实请求地址，用于发现只通过 import 引用的已删除接口
const apiEndpoints = new Map();
for (const apiFile of fs.readdirSync(path.join(adminSrc, 'api'))) {
  if (!apiFile.endsWith('.js')) continue;
  const apiSource = fs.readFileSync(path.join(adminSrc, 'api', apiFile), 'utf8');
  const byName = new Map();
  for (const fn of apiSource.matchAll(/export\s+function\s+(\w+)\s*\([\s\S]*?\n\}/g)) {
    byName.set(fn[1], [...fn[0].matchAll(/url:\s*(?:`|')([^`']+)(?:`|')/g)].map((url) => url[1]));
  }
  apiEndpoints.set(apiFile, byName);
}
for (const [file, text] of pageSources) {
  const hits = new Set(retiredApiPatterns.filter((pattern) => pattern.test(text)).map(String));
  for (const importMatch of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*'@\/api\/([\w/]+)'/g)) {
    const byName = apiEndpoints.get(importMatch[2] + '.js');
    if (!byName) continue;
    for (const name of importMatch[1].split(',').map((entry) => entry.trim().split(/\s+as\s+/)[0])) {
      for (const url of byName.get(name) || []) {
        if (retiredApiPatterns.some((pattern) => pattern.test(url))) hits.add(`${name}() -> ${url}`);
      }
    }
  }
  assert.strictEqual(hits.size, 0, `${path.relative(root, file)} still calls retired endpoints: ${[...hits].join(', ')}`);
}

// 已删除功能留下的菜单入口必须继续隐藏
for (const pathname of [
  '/setting/delivery_service/index', '/order/offline', '/app/app/version',
  '/system/crossVersionUpgrade/index', '/setting/system_group_data/sign/1',
  '/setting/merchant/system_verify_order/index', '/setting/merchant/system_store_staff/index',
  '/setting/sign_config/2/126', '/setting/recharge_config/2/28', '/marketing/sign_rewards',
]) {
  assert(context.isRemovedAdminPath('/admin' + pathname), `retired feature still reachable: ${pathname}`);
}
assert(read('template/admin/src/libs/socket.js').includes('new WebSocket(wss('), 'socket.js must upgrade ws:// URLs on HTTPS pages');
assert(/isAbsoluteUrl/.test(read('template/admin/src/libs/request.js')), 'request.js must not prepend baseURL to absolute URLs');

console.log(`Admin contract checked: ${audit.requests.length} audited request paths, ${removed.menuPaths.length} retired page prefixes, ${pageSources.size} retained page sources.`);
