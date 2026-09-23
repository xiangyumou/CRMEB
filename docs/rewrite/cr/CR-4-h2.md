# CR-4-h2 — 商家管理's 商品管理 has an admin console behind it and no staff surface

**Status (R5 sweep, 2026-09-23): RESOLVED** — `catalog.staff.contract.ts` has the ten staff routes (A2, `a867050b7`). The status line below is kept as history.

- **Stream:** H (uni-app storefront), raised against A (catalog)
- **Status:** open
- **Affects:** a new `next/packages/contracts/src/catalog/catalog.staff.contract.ts`
  (or ten routes added to the existing staff surface)

B2 built `/api/v1/staff/*` for the mobile 商家管理 and stopped at orders and
refunds — deliberately, and its status file says the 商品 and 用户 screens belong
to A and E1. This is the A half: ten calls in `api/admin.js`, five pages plus
four components, all still shipped and all still in `pages.json`.

The capability exists. `/admin-api/catalog/products`, `…/{id}/status`,
`/admin-api/catalog/labels`, `/admin-api/catalog/category-tree` and
`/admin-api/shipping/template-options` do every one of these things — for an
**admin session**. A 店员 does not have one, and `GET /api/v1/staff/me` is the
only thing that says whether this shopper is staff at all.

## What the screens call

| Call | Screen | Admin route that already does it |
| ---- | ------ | -------------------------------- |
| `adminProductList` | `pages/admin/goods/index.vue` | `GET /admin-api/catalog/products` |
| `productSetShow` | same (上架/下架 switch) | `POST /admin-api/catalog/products/:id/status` |
| `getProductLabel` | `components/label` | `GET /admin-api/catalog/labels` |
| `postBatchProcess` | same (批量打标签) | — (admin PUTs one product at a time) |
| `getProductCate` | `components/classify` | `GET /admin-api/catalog/category-tree` |
| `postManageSaveCate` | same (批量改分类) | — |
| `getManageProductAttr` | `goods/specs.vue` | `GET /admin-api/catalog/products/:id` |
| `postUpdateAttrs` | `specs.vue`, `components/editPrice` | `PUT /admin-api/catalog/products/:id` |
| `getTemplateOption` | `goods/addGoods.vue` | `GET /admin-api/shipping/template-options` |
| `productCreate` | same | `POST /admin-api/catalog/products` |

Two of them have no admin equivalent because the console edits one product at a
time: the mobile screens select rows with checkboxes and apply a label or a
category to all of them at once.

## Ask

Ten routes under `/api/v1/staff/`, `auth: 'staff'` (the same guard
`/api/v1/staff/orders` uses), reusing A's existing schemas wherever the payload
is the same:

```
GET  /api/v1/staff/products              ?page&pageSize&keyword&state
       state ∈ on-sale | in-stock | sold-out | low-stock   (legacy `type` 1/2/4/5)
POST /api/v1/staff/products/:id/visibility     { visible }
GET  /api/v1/staff/product-labels
POST /api/v1/staff/products/label-assignments  { productIds[], labelIds[] }
GET  /api/v1/staff/product-categories
POST /api/v1/staff/products/category-assignments { productIds[], categoryId }
GET  /api/v1/staff/products/:id/skus
PUT  /api/v1/staff/products/:id/skus     { items: [{ id, price, stock, … }] }
GET  /api/v1/staff/shipping-templates
POST /api/v1/staff/products                    (the 添加商品 form)
```

Three notes from reading the screens:

- **库存预警 (`state: 'low-stock'`) needs a threshold the shop configures.** The
  legacy list passed `type: 5` and the server compared against a config value.
  If that config is not being ported, the tab should be dropped rather than
  guessed at.
- **`productCreate` posts a much smaller product than the console's.** The form
  is `store_name`, one image plus up to nine slider images, `cate_id`,
  `unit_name`, `spec_type: 0`, one `attr` row (price/cost/ot_price/stock/
  bar_code/weight/volume), `freight`/`temp_id`, `content`, `is_show`. A
   multi-spec product cannot be created from a phone and never could.
- **`logistics: ['1','2']` in that form is 快递 + 到店.** 门店自提 is retired
  shop-wide, so the storefront should send `['1']` and the field can be dropped
  from the request entirely. H will fix the form once there is a route to send
  it to.

If A would rather the phone not create products at all — a defensible call, the
form is thin and the console is a better place for it — then say so and the
`添加商品` screen goes, leaving eight routes and a read-mostly 商品管理.

## Until then

All ten stay `CONTRACT-PENDING(A)` against the paths above. `pages/admin/goods/**`
loads an empty list and every action on it fails; the 商家管理 home still works,
because orders and refunds are B2's and are live.
