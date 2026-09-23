// The staff order screens hide the actions a shop has not granted its staff.
//
// `GET /api/v1/staff/me` carries `abilities: { refundReview, adjustPrice }`,
// one per `order-staff` switch, and each route behind a switch answers 403
// while it is off. A screen that offered the button anyway would only earn the
// operator a refusal, so the button follows the ability:
//
//   - 一键改价 on the order list and the order detail follows `adjustPrice`;
//   - 退款审核 on the refund list follows `refundReview`.
//
// The pages are loaded as they ship: the `<script>` block's own options (data,
// onLoad, onShow, methods) over a stubbed `@/api/admin` whose answers go
// through the real mappers from the contract's own examples, and the
// `<template>` compiled and rendered with Vue 2. What is asserted is the
// rendered text, in both states of each switch.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { example } from './helpers.mjs';
import {
  toLegacyStaffIdentity,
  toLegacyStaffOrderDetail,
  toLegacyStaffOrderList,
  toLegacyStaffRefundList,
} from '../api/mappers/staff.js';

const require = createRequire(import.meta.url);
const compiler = require('vue-template-compiler');
const Vue = require('vue/dist/vue.runtime.common.prod.js');

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// loading a page
// ---------------------------------------------------------------------------

/** Every binding an `import` statement at the top of the script introduces. */
function importedNames(script) {
  const bindings = [];
  const re = /^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm;
  for (const [, clause, source] of script.matchAll(re)) {
    const isComponent = source.endsWith('.vue') || /^@\/components\/[^.]+$/.test(source);
    const named = clause.match(/\{([\s\S]*)\}/);
    const defaultName = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();
    if (defaultName) bindings.push({ name: defaultName, isComponent });
    for (const part of named ? named[1].split(',') : []) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) bindings.push({ name, isComponent: false });
    }
  }
  return bindings;
}

/**
 * The page's component options, with each import bound to `api[name]` when the
 * test provides one, an empty component for a `.vue` import, and an inert
 * function otherwise.
 */
function loadPage(rel, api) {
  const sfc = compiler.parseComponent(fs.readFileSync(path.join(APP, rel), 'utf8'));
  const script = sfc.script.content;
  const bindings = importedNames(script);
  const body = script
    .replace(/^\s*import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/gm, '')
    .replace(/export\s+default/, 'return');
  const values = bindings.map(({ name, isComponent }) =>
    name in api ? api[name] : isComponent ? {} : () => new Promise(() => {}),
  );
  const options = new Function(...bindings.map((b) => b.name), body)(...values);
  const { render, staticRenderFns } = compiler.compileToFunctions(sfc.template.content);
  return { ...options, render, staticRenderFns };
}

Vue.prototype.$util = { getWXStatusHeight: () => ({ barTop: 0, barHeight: 0 }), Tips: () => {} };
Vue.prototype.$store = { state: { app: { identity: 0 } } };
Vue.prototype.$t = (key) => key;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Every text node the page renders, in order. */
function renderedText(vm) {
  const out = [];
  const walk = (vnode) => {
    if (!vnode) return;
    if (vnode.text) out.push(vnode.text.trim());
    for (const child of vnode.children || []) walk(child);
  };
  walk(vm._render());
  return out.filter(Boolean);
}

/** Loads a page, runs `onLoad(query)` and `onShow()` as uni-app would, and settles. */
async function open(rel, api, query = {}) {
  const vm = new Vue(loadPage(rel, api));
  vm.$options.onLoad?.call(vm, query);
  vm.$options.onShow?.call(vm);
  await flush();
  return vm;
}

/** `getStaffIdentity()` as the page sees it, for a staff member with `abilities`. */
function identityWith(abilities) {
  const dto = { ...example('GET /api/v1/staff/me'), abilities };
  return () => Promise.resolve({ data: toLegacyStaffIdentity(dto) });
}

const OFF = { refundReview: false, adjustPrice: false };

// ---------------------------------------------------------------------------
// 一键改价
// ---------------------------------------------------------------------------

describe('一键改价 follows abilities.adjustPrice', () => {
  // An order that could be repriced: unpaid and not cancelled.
  const orders = toLegacyStaffOrderList(example('GET /api/v1/staff/orders')).map((row) => ({
    ...row,
    _status: 1,
    is_cancel: 0,
  }));
  const detail = toLegacyStaffOrderDetail(example('GET /api/v1/staff/orders/:id'));
  const unpaidDetail = { ...detail, _status: { ...detail._status, _type: 0 } };

  const listApi = (abilities) => ({
    getAdminOrderList: () => Promise.resolve({ data: orders }),
    getStaffIdentity: identityWith(abilities),
  });
  const detailApi = (abilities) => ({
    getAdminOrderDetail: () => Promise.resolve({ data: unpaidDetail }),
    getUserInfo: () => Promise.resolve({ data: {} }),
    getStaffIdentity: identityWith(abilities),
  });

  it('is offered on the order list when the shop lets staff reprice', async () => {
    const vm = await open('pages/admin/orderList/index.vue', listApi({ ...OFF, adjustPrice: true }));
    expect(vm.list.length).toBeGreaterThan(0);
    expect(renderedText(vm)).toContain('一键改价');
  });

  it('is hidden on the order list when it does not', async () => {
    const vm = await open('pages/admin/orderList/index.vue', listApi(OFF));
    expect(vm.list.length).toBeGreaterThan(0);
    expect(renderedText(vm)).toContain('订单备注');
    expect(renderedText(vm)).not.toContain('一键改价');
  });

  it('is hidden on the order list while the identity has not answered', async () => {
    const api = { ...listApi(OFF), getStaffIdentity: () => new Promise(() => {}) };
    const vm = await open('pages/admin/orderList/index.vue', api);
    expect(renderedText(vm)).not.toContain('一键改价');
  });

  it('is offered on the order detail when the shop lets staff reprice', async () => {
    const vm = await open(
      'pages/admin/orderDetail/index.vue',
      detailApi({ ...OFF, adjustPrice: true }),
      { id: detail.order_id },
    );
    expect(vm.types).toBe(0);
    expect(renderedText(vm)).toContain('一键改价');
  });

  it('is hidden on the order detail when it does not', async () => {
    const vm = await open('pages/admin/orderDetail/index.vue', detailApi(OFF), {
      id: detail.order_id,
    });
    expect(vm.types).toBe(0);
    expect(renderedText(vm)).toContain('订单备注');
    expect(renderedText(vm)).not.toContain('一键改价');
  });

  it('does not follow the other switch', async () => {
    const vm = await open(
      'pages/admin/orderList/index.vue',
      listApi({ refundReview: true, adjustPrice: false }),
    );
    expect(renderedText(vm)).not.toContain('一键改价');
  });
});

// ---------------------------------------------------------------------------
// 退款审核
// ---------------------------------------------------------------------------

describe('退款审核 follows abilities.refundReview', () => {
  // A 仅退款 request awaiting review.
  const refunds = toLegacyStaffRefundList(example('GET /api/v1/staff/refunds')).map((row) => ({
    ...row,
    refund_type: 1,
  }));
  const api = (abilities) => ({
    adminRefundList: () => Promise.resolve({ data: refunds }),
    getStaffIdentity: identityWith(abilities),
  });

  it('renders each request with its goods', async () => {
    const vm = await open('pages/admin/refund_order_list/index.vue', api(OFF));
    expect(vm.list.length).toBeGreaterThan(0);
    expect(renderedText(vm)).toContain(refunds[0].cartInfo[0].productInfo.store_name);
  });

  it('is offered when the shop lets staff review refunds', async () => {
    const vm = await open(
      'pages/admin/refund_order_list/index.vue',
      api({ ...OFF, refundReview: true }),
    );
    expect(renderedText(vm)).toContain('退款审核');
  });

  it('is hidden when it does not', async () => {
    const vm = await open('pages/admin/refund_order_list/index.vue', api(OFF));
    expect(renderedText(vm)).toContain('订单备注');
    expect(renderedText(vm)).not.toContain('退款审核');
  });
});
