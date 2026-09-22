import { z } from 'zod';
import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import { shippingTemplateOptions } from '../shipping/schemas';
import {
  pagedStaffProducts,
  staffBulkResult,
  staffCategoryAssignmentBody,
  staffCategoryNodeExample,
  staffLabelAssignmentBody,
  staffLabelGroupExample,
  staffProductCategories,
  staffProductForm,
  staffProductFormExample,
  staffProductLabels,
  staffProductListItemExample,
  staffProductListQuery,
  staffProductVisibilityBody,
  staffSkuExample,
  staffSkus,
  staffSkuUpdateBody,
  staffProductListItem,
} from './catalog.staff.schemas';

/**
 * 商品管理 for the mobile 商家管理 console — CR-4-h2, accepted in full.
 *
 * Ten routes, every one `auth: 'staff'`: the same guard B2's
 * `/api/v1/staff/orders` declares, resolved against the `orderStaff` config
 * list. There are no permission atoms because staff is not a role — a shopper
 * either is on the list or gets a 403 — and there is deliberately nothing here
 * an admin holding `catalog:*` could not already do from the console. Every
 * route is a thin call onto the same `core/src/catalog` service the admin
 * surface uses, so the two can never drift.
 *
 * Why these ten and not the console's twenty-nine: they are exactly the calls
 * `template/uni-app/api/admin.js` makes, which CR-4-h2 lists screen by screen.
 * 回收站, 导出, 卡密, 评价 and the whole taxonomy CRUD stay in the console.
 *
 * One route lives here rather than in `shipping/`: `GET
 * /api/v1/staff/shipping-templates`, the 添加商品 运费模板 picker. It answers
 * with F2's own `shippingTemplateOptions` and its handler calls F2's own
 * `templates.options`, exactly as B2's `/api/v1/staff/express-companies`
 * inherited its body from the admin route. It is grouped with the form it
 * serves rather than split across two files for a schema it does not own.
 */

const productParams = z.object({ id });

// ---------------------------------------------------------------------------
// the list and the 上架/下架 switch
// ---------------------------------------------------------------------------

export const catalogStaffProductList = defineRoute({
  id: 'catalog.staffProductList',
  method: 'GET',
  path: '/api/v1/staff/products',
  auth: 'staff',
  summary: '店员商品列表',
  tags: ['catalog'],
  query: staffProductListQuery,
  response: pagedStaffProducts,
  examples: [
    {
      name: 'on-sale',
      query: { page: 1, pageSize: 20, state: 'on-sale' },
      response: { items: [staffProductListItemExample], total: 1, page: 1, pageSize: 20 },
    },
    {
      name: 'low-stock',
      query: { page: 1, pageSize: 20, state: 'low-stock' },
      response: {
        items: [{ ...staffProductListItemExample, stock: 3 }],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    },
    {
      name: 'search',
      query: { page: 1, pageSize: 20, keyword: '白T' },
      response: { items: [staffProductListItemExample], total: 1, page: 1, pageSize: 20 },
    },
  ],
});

/**
 * 上架 / 下架, risk-matrix §1 from the phone.
 *
 * The body is `{ visible }` rather than the console's `{ status }`: the switch
 * on the list has two positions and a staff member has no way to make a draft.
 * `false` files the product as `off_shelf`, and the same conditional update the
 * console runs is what does it — the moment it commits the product is out of
 * every storefront list and unsellable.
 */
export const catalogStaffProductSetVisibility = defineRoute({
  id: 'catalog.staffProductSetVisibility',
  method: 'POST',
  path: '/api/v1/staff/products/:id/visibility',
  auth: 'staff',
  summary: '店员上架/下架商品',
  tags: ['catalog'],
  params: productParams,
  body: staffProductVisibilityBody,
  response: staffProductListItem,
  errors: ['CATALOG_PRODUCT_NOT_FOUND'],
  examples: [
    {
      name: 'off-shelf',
      params: { id: '1' },
      body: { visible: false },
      response: { ...staffProductListItemExample, visible: false },
    },
  ],
});

// ---------------------------------------------------------------------------
// the two batch drawers
// ---------------------------------------------------------------------------

export const catalogStaffProductLabels = defineRoute({
  id: 'catalog.staffProductLabels',
  method: 'GET',
  path: '/api/v1/staff/product-labels',
  auth: 'staff',
  summary: '店员商品标签',
  tags: ['catalog'],
  response: staffProductLabels,
  examples: [
    {
      name: 'ok',
      response: {
        items: [
          staffLabelGroupExample,
          { categoryId: null, categoryName: '未分类', labels: [{ id: '9', name: '清仓' }] },
        ],
      },
    },
  ],
});

/**
 * 批量打标签.
 *
 * The console edits one product at a time from the product form; the phone
 * selects rows with checkboxes and applies a set to all of them, which is why
 * this route exists and the console has no equivalent. The write replaces each
 * product's labels with the submitted set inside one transaction, so a
 * half-applied batch is not a state the shop can be in.
 */
export const catalogStaffLabelAssignments = defineRoute({
  id: 'catalog.staffLabelAssignments',
  method: 'POST',
  path: '/api/v1/staff/products/label-assignments',
  auth: 'staff',
  summary: '批量设置商品标签',
  tags: ['catalog'],
  body: staffLabelAssignmentBody,
  response: staffBulkResult,
  errors: ['CATALOG_PRODUCT_NOT_FOUND', 'CATALOG_LABEL_NOT_FOUND'],
  examples: [
    {
      name: 'two-products',
      body: { productIds: ['1', '2'], labelIds: ['3'] },
      response: { updated: 2 },
    },
    { name: 'clear', body: { productIds: ['1'], labelIds: [] }, response: { updated: 1 } },
  ],
});

export const catalogStaffProductCategories = defineRoute({
  id: 'catalog.staffProductCategories',
  method: 'GET',
  path: '/api/v1/staff/product-categories',
  auth: 'staff',
  summary: '店员商品分类',
  tags: ['catalog'],
  response: staffProductCategories,
  examples: [{ name: 'ok', response: { items: [staffCategoryNodeExample] } }],
});

export const catalogStaffCategoryAssignments = defineRoute({
  id: 'catalog.staffCategoryAssignments',
  method: 'POST',
  path: '/api/v1/staff/products/category-assignments',
  auth: 'staff',
  summary: '批量设置商品分类',
  tags: ['catalog'],
  body: staffCategoryAssignmentBody,
  response: staffBulkResult,
  errors: ['CATALOG_PRODUCT_NOT_FOUND', 'CATALOG_CATEGORY_NOT_FOUND'],
  examples: [
    {
      name: 'two-products',
      body: { productIds: ['1', '2'], categoryIds: ['17'] },
      response: { updated: 2 },
    },
  ],
});

// ---------------------------------------------------------------------------
// 规格 / 修改价格库存
// ---------------------------------------------------------------------------

export const catalogStaffProductSkus = defineRoute({
  id: 'catalog.staffProductSkus',
  method: 'GET',
  path: '/api/v1/staff/products/:id/skus',
  auth: 'staff',
  summary: '店员商品规格',
  tags: ['catalog'],
  params: productParams,
  response: staffSkus,
  errors: ['CATALOG_PRODUCT_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '1' }, response: { items: [staffSkuExample] } }],
});

/**
 * 修改价格 / 库存.
 *
 * A patch per SKU: an absent key is left alone. Legacy rewrote the whole row,
 * so editing a price from a screen loaded two minutes ago wrote back the stock
 * that screen was showing and un-sold every order placed in between — the one
 * defect this route exists to not have.
 *
 * A stock change is applied under the SKU's own row lock and rolled up to
 * `products.stock` in the same transaction, so it serialises with an order's
 * reservation instead of racing it.
 */
export const catalogStaffProductSkuUpdate = defineRoute({
  id: 'catalog.staffProductSkuUpdate',
  method: 'PUT',
  path: '/api/v1/staff/products/:id/skus',
  auth: 'staff',
  summary: '店员修改规格价格库存',
  tags: ['catalog'],
  params: productParams,
  body: staffSkuUpdateBody,
  response: staffSkus,
  errors: [
    'CATALOG_PRODUCT_NOT_FOUND',
    'CATALOG_SKU_NOT_FOUND',
    'CATALOG_CARD_STOCK_NOT_EDITABLE',
    'CATALOG_NAME_TAKEN',
  ],
  examples: [
    {
      name: 'reprice-one',
      params: { id: '1' },
      body: { items: [{ id: '1001', price: '55.00' }] },
      response: { items: [{ ...staffSkuExample, price: '55.00' }] },
    },
    {
      name: 'restock',
      params: { id: '1' },
      body: { items: [{ id: '1001', stock: 80 }] },
      response: { items: [{ ...staffSkuExample, stock: 80 }] },
    },
  ],
});

// ---------------------------------------------------------------------------
// 添加商品
// ---------------------------------------------------------------------------

/** The 运费模板 select on 添加商品. F2's shape, F2's service, staff-scoped path. */
export const catalogStaffShippingTemplates = defineRoute({
  id: 'catalog.staffShippingTemplates',
  method: 'GET',
  path: '/api/v1/staff/shipping-templates',
  auth: 'staff',
  summary: '店员运费模板选项',
  tags: ['catalog'],
  response: shippingTemplateOptions,
  examples: [
    {
      name: 'ok',
      response: { items: [{ id: '1', name: '全国包邮（满 5 件）', chargeMode: 'quantity' }] },
    },
  ],
});

/**
 * 添加商品 — a single-spec product, created through the console's own service.
 *
 * `specType: 'single'`, one SKU row, `kind: 'physical'`. A multi-spec product
 * cannot be built on a phone and never could. The request carries no
 * `logistics`: 门店自提 is retired shop-wide and the product ships by 快递.
 */
export const catalogStaffProductCreate = defineRoute({
  id: 'catalog.staffProductCreate',
  method: 'POST',
  path: '/api/v1/staff/products',
  auth: 'staff',
  summary: '店员添加商品',
  tags: ['catalog'],
  body: staffProductForm,
  response: staffProductListItem,
  status: 201,
  errors: ['CATALOG_CATEGORY_NOT_FOUND', 'CATALOG_PRODUCT_SPU_TAKEN'],
  examples: [
    {
      name: 'single-spec',
      body: staffProductFormExample,
      response: {
        ...staffProductListItemExample,
        id: '44',
        name: '手冲挂耳咖啡',
        imageUrl: 'https://cdn.example.com/p/44.png',
        price: '49.00',
        stock: 200,
        sales: 0,
        visible: true,
        specMode: false,
        unitName: '盒',
        labelIds: [],
      },
    },
  ],
});
