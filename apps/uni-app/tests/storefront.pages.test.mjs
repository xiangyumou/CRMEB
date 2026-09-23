// Page-level guarantees: the ones that live in a page, `App.vue` or `static/`,
// not in a mapper, pinned by reading the sources the build compiles. A mapper fix is tested beside its mapper; this file holds what a
// mapper test cannot see.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(APP, rel), 'utf8');

/** Every file `build:h5` / `build:mp-weixin` bundles from, relative to the app root. */
function sources() {
  const roots = ['App.vue', 'main.js', 'pages', 'components', 'subpackage', 'api', 'utils', 'libs', 'mixins', 'config', 'store'];
  const out = [];
  const walk = (rel) => {
    const abs = path.join(APP, rel);
    const stat = fs.statSync(abs, { throwIfNoEntry: false });
    if (!stat) return;
    if (stat.isFile()) {
      if (/\.(vue|js|scss|css)$/.test(rel)) out.push(rel);
      return;
    }
    for (const child of fs.readdirSync(abs)) walk(path.join(rel, child));
  };
  roots.forEach(walk);
  return out;
}

describe('App.vue does not fetch a custom script', () => {
  it('has no /api/get_script call, so no HTML 404 is ever appended as a <script>', () => {
    // Code only: the comment that says why the fetch is gone may name it.
    const code = read('App.vue')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/get_script/);
    expect(code).not.toMatch(/fetch\(/);
    expect(code).not.toMatch(/appendChild\(newScript\)/);
  });
});

describe('the shared images ship inside the build', () => {
  const files = sources();
  const IMAGE_DIR = 'static/images/common';
  const referenced = new Set();
  for (const file of files) {
    for (const match of read(file).matchAll(/\/static\/images\/common\/([\w.-]+)/g)) {
      referenced.add(match[1]);
    }
  }

  it('walks the real tree', () => {
    expect(files).toContain('App.vue');
    expect(files).toContain('components/emptyPage.vue');
    expect(files.length).toBeGreaterThan(200);
  });

  it('references no /statics/images path, which nothing serves', () => {
    const offenders = files.filter((file) => read(file).includes('statics/images'));
    expect(offenders).toEqual([]);
  });

  it('ships every shared image a page references, and nothing no page references', () => {
    const shipped = fs.readdirSync(path.join(APP, IMAGE_DIR)).sort();
    expect([...referenced].sort()).toEqual(shipped);
    // The empty states, the coupon bag and the 开团 gif.
    for (const name of ['empty-box.png', 'noCoupon.png', 'co-bag.png', 'open.gif', 'noAddress.png']) {
      expect(shipped).toContain(name);
    }
  });

});

describe('立即开团 / 参团 select the SKU of a single-SKU product', () => {
  // A single-SKU product has no spec columns (`productAttr` is empty) and one
  // SKU keyed ''. Guarding the default selection on `productAttr.length` would
  // leave nothing selected, and the buy button would do nothing.
  it('goods_combination_details selects whenever a SKU was found', () => {
    const page = read('pages/activity/goods_combination_details/index.vue');
    const body = page.slice(page.indexOf('DefaultSelect: function () {'));
    expect(body.slice(0, 1200)).toMatch(/\n\s*if \(productSelect\) \{/);
    expect(body.slice(0, 1200)).not.toMatch(/if \(productSelect && productAttr\.length\)/);
  });

  it('goods_combination_status selects whenever a SKU was found, and always runs DefaultSelect', () => {
    const page = read('pages/activity/goods_combination_status/index.vue');
    const body = page.slice(page.indexOf('DefaultSelect() {'));
    expect(body.slice(0, 1200)).toMatch(/\n\s*if \(productSelect\) \{/);
    expect(page).not.toMatch(/productAttr != 0\) that\.DefaultSelect/);
    expect(page).toMatch(/that\.setProductSelect\(\);\s*that\.DefaultSelect\(\);/);
  });
});

describe('确认订单 passes the cart to every call that needs it', () => {
  const page = read('pages/goods/order_confirm/index.vue');
  const block = (start) => page.slice(page.indexOf(start), page.indexOf(start) + 900);

  it('computedPrice re-previews the same cart', () => {
    expect(block('computedPrice() {')).toMatch(/let data = \{\s*cartId: this\.cartId,/);
  });

  it('SubOrder creates the order for the same cart', () => {
    expect(page).toMatch(/data = \{\s*cartId: that\.cartId,\s*custom_form: that\.confirm,/);
  });

  it('getCouponList hands the coupon picker its checkout lines', () => {
    expect(block('getCouponList: function() {')).toMatch(/cartInfo: this\.cartInfo,/);
  });
});

describe('the 售后 list and the pay result name the order by its number', () => {
  it('user_return_list sends its tab as refund_status (what getNewOrderList now reads)', () => {
    expect(read('pages/users/user_return_list/index.vue')).toMatch(/refund_status: type \? type : that\.type/);
    expect(read('api/order.js')).toMatch(/fromPageRefundState\(src\.refund_status\)/);
  });

  it('user_return_list shows the order number, not the refund id it navigates by', () => {
    const page = read('pages/users/user_return_list/index.vue');
    expect(page).toMatch(/订单号`\)\}\}：\{\{item\.order_no \|\| item\.order_id\}\}/);
    expect(page).toMatch(/goOrderDetails\(item\.order_id\)/);
  });

  it('order_pay_status shows the order number, not the id in its query string', () => {
    expect(read('pages/goods/order_pay_status/index.vue')).toMatch(/\{\{ order_pay_info\.order_id \|\| orderId \}\}/);
  });
});

describe('every page — a single-SKU product has its one SKU selected', () => {
  // goods_details' 加入购物车 would post no skuId (a 422) for the same reason as
  // 拼团 if the selection were guarded on `productAttr.length`.
  it('no page guards the default selection on the product having spec columns', () => {
    const offenders = sources().filter((file) => /if \(productSelect && productAttr\.length\)/.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

describe('the 预售 pages render', () => {
  it('presell_details calls $t, not an undefined $, which would throw and blank the page', () => {
    expect(read('pages/activity/presell_details/index.vue')).not.toMatch(/\{\{\s*\$\(/);
    const offenders = sources().filter((file) => /\{\{\s*\$\(/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('presell/index`s default palette reads this.picList', () => {
    expect(read('pages/activity/presell/index.vue')).not.toMatch(/[^.]picList\[2\]/);
  });
});

// The `data-testid`s the storefront suite (`e2e/storefront`) locates
// elements by, each on its element. A static id is `data-testid="x"`; a bound one names the expression.
describe('the storefront suite’s data-testids are on their elements', () => {
  const TESTIDS = {
    'pages/order_addcart/order_addcart.vue': [
      'data-testid="cart-row" :data-sku-id="item.product_attr_unique"',
      'data-testid="cart-qty-plus"',
      'data-testid="cart-qty-minus"',
      'data-testid="cart-qty"',
      'data-testid="cart-total"',
      'data-testid="cart-checkout"',
    ],
    'pages/goods/order_confirm/index.vue': [
      'data-testid="confirm-address"',
      'data-testid="confirm-freight"',
      'data-testid="confirm-coupon"',
      'data-testid="confirm-coupon-discount"',
      'data-testid="confirm-total"',
      'data-testid="confirm-submit"',
    ],
    'components/couponListWindow/index.vue': ['data-testid="coupon-option" :data-coupon-id="item.id"'],
    'pages/goods/cashier/index.vue': [`:data-testid="'pay-method-' + item.value"`, 'data-testid="pay-submit"'],
    'pages/goods/order_pay_status/index.vue': ['data-testid="pay-status"', 'data-testid="pay-amount"'],
    'pages/goods/order_details/index.vue': [
      'data-testid="order-status" :data-status-type="orderInfo._status._type" :data-status-title="orderInfo._status._title"',
      'data-testid="order-receive"',
      'data-testid="order-logistics"',
      'data-testid="order-refund"',
    ],
    'components/orderGoods/index.vue': ['data-testid="order-review"', 'data-testid="order-refund"'],
    'pages/goods/goods_logistics/index.vue': ['data-testid="logistics-company"', 'data-testid="logistics-no"'],
    'pages/goods/goods_comment_con/index.vue': ['data-testid="review-text"', 'data-testid="review-submit"'],
    'pages/goods/goods_return/index.vue': ['data-testid="refund-reason"', 'data-testid="refund-submit"'],
    'pages/users/user_return_list/index.vue': [
      `:data-testid="'refund-tab-' + ['all', 'open', 'succeeded'][item.key]"`,
      'data-testid="refund-row" :data-refund-id="item.id"',
      'data-testid="refund-stamp" :data-refund-type="item.refund_type"',
    ],
    'pages/activity/goods_combination_details/index.vue': ['data-testid="groupbuy-open"', 'data-testid="groupbuy-solo"'],
    'components/productWindow/index.vue': ['data-testid="sku-popup-confirm"'],
    'pages/activity/goods_combination_status/index.vue': ['data-testid="groupbuy-join"', 'data-testid="groupbuy-invite"'],
    'pages/users/login/index.vue': [
      'data-testid="login-phone"',
      'data-testid="login-password"',
      'data-testid="login-code"',
      'data-testid="login-send-code"',
      'data-testid="login-terms"',
      'data-testid="login-submit"',
    ],
    'subpackage/diyComponents/pageDesign.vue': [`:data-testid="'diy-' + item.id"`],
    'pages/user/index.vue': ['data-testid="site-copyright"'],
  };

  for (const [file, ids] of Object.entries(TESTIDS)) {
    it(file, () => {
      const source = read(file);
      for (const id of ids) expect(source, id).toContain(id);
    });
  }

  it('the refund tab keys are the three tabs the page lists', () => {
    const source = read('pages/users/user_return_list/index.vue');
    const keys = [...source.matchAll(/^\s*key: (\d+),$/gm)].map((m) => Number(m[1]));
    expect(keys).toEqual([0, 1, 2]);
  });
});
