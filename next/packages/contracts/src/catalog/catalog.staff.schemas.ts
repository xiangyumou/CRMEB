import { z } from 'zod';
import { id, money, pageQuery, paged } from '../_conventions/common';
import { productFreightMode, productKind, volume, weight } from './schemas';

/**
 * 移动端商家管理 — the 商品管理 half.
 *
 * `/api/v1/staff/*` serves the phone's 商家管理; orders and refunds live in the
 * order domain, and this file is the catalog's part. Ten routes,
 * `auth: 'staff'`, the same guard `/api/v1/staff/orders` declares — a staff
 * member either has the console or does not, so there are no permission atoms
 * here.
 *
 * **Thinner than the console, deliberately.** A list row carries what
 * `template/uni-app/pages/admin/goods/index.vue` renders and nothing else: no
 * product-level 成本价 (the phone has no business showing margin on a list it
 * scrolls in public), no recycle bin, no export. The per-SKU 成本价 *is* here,
 * because 修改价格/库存 edits it and always has.
 *
 * Every shape is either one of the catalog's admin schemas or a strict subset
 * of one, so the phone and the console can never disagree about what a product
 * is.
 */

// ---------------------------------------------------------------------------
// the list
// ---------------------------------------------------------------------------

/**
 * The four tabs of 商品管理, as keys rather than integers.
 *
 * `low-stock` compares against the shop's configured
 * `catalog.stockWarningThreshold` — the same key the `admin_low_stock`
 * notification reads — so the badge on the phone and the 库存预警 screen in the
 * console are the same number. `in-stock` (仓库中) is everything live that is
 * not on the shelf, which in the three-value `status` means `off_shelf` *and*
 * `draft`; otherwise a draft would be invisible to the phone.
 */
export const staffProductState = z.enum(['on-sale', 'in-stock', 'sold-out', 'low-stock']);
export type StaffProductState = z.infer<typeof staffProductState>;

export const staffProductListQuery = pageQuery.extend({
  keyword: z.string().max(64).optional(),
  state: staffProductState.optional(),
});
export type StaffProductListQuery = z.infer<typeof staffProductListQuery>;

/** One row of 商品管理. A strict subset of `adminProductListItem`. */
export const staffProductListItem = z.object({
  id,
  name: z.string(),
  imageUrl: z.string(),
  price: money,
  /** Sum of visible SKU stock, same rollup the console reads. */
  stock: z.number().int().min(0),
  sales: z.number().int().min(0),
  /** `status === 'on_shelf'`. The 上架/下架 switch writes this, not `status`. */
  visible: z.boolean(),
  /** `true` means the 规格 screen; `false` means the 修改价格/库存 drawer. */
  specMode: z.boolean(),
  kind: productKind,
  unitName: z.string().nullable(),
  categoryIds: z.array(id),
  labelIds: z.array(id),
});
export type StaffProductListItem = z.infer<typeof staffProductListItem>;

export const pagedStaffProducts = paged(staffProductListItem);

export const staffProductVisibilityBody = z.object({ visible: z.boolean() });

// ---------------------------------------------------------------------------
// labels and categories, as the two drawers read them
// ---------------------------------------------------------------------------

/**
 * 商品标签, grouped by 标签分类.
 *
 * The drawer renders a heading per group and the chips under it, so the
 * grouping is the server's rather than a flat list the phone has to bucket.
 * Labels with no category come back in one trailing group whose `categoryId` is
 * `null`. Disabled labels are omitted: a staff member cannot apply one.
 */
export const staffLabelGroup = z.object({
  categoryId: id.nullable(),
  categoryName: z.string(),
  labels: z.array(z.object({ id, name: z.string() })),
});
export type StaffLabelGroup = z.infer<typeof staffLabelGroup>;

export const staffProductLabels = z.object({ items: z.array(staffLabelGroup) });

/** Ids a batch action may carry. 100 is the ceiling the list page already slices to. */
const productIds = z.array(id).min(1).max(100);

/**
 * 批量打标签.
 *
 * The labels **replace** whatever the selected products carried, which is what
 * the drawer does: it loads the current set, lets the operator toggle chips and
 * sends the result. An empty array therefore clears the labels, on purpose.
 */
export const staffLabelAssignmentBody = z.object({
  productIds,
  labelIds: z.array(id).max(20),
});
export type StaffLabelAssignmentBody = z.infer<typeof staffLabelAssignmentBody>;

/**
 * 批量改分类.
 *
 * `categoryIds`, not a singular `categoryId`: a product belongs to many
 * categories (`product_categories_map`), and the drawer's own checkbox group
 * collects a list. One name for one thing.
 */
export const staffCategoryAssignmentBody = z.object({
  productIds,
  categoryIds: z.array(id).min(1).max(20),
});
export type StaffCategoryAssignmentBody = z.infer<typeof staffCategoryAssignmentBody>;

/** How many products the batch actually touched. */
export const staffBulkResult = z.object({ updated: z.number().int().min(0) });

/**
 * 商品分类 for the picker: id, name, children. Three levels written out, for
 * the reason the admin tree is (`z.lazy` makes an OpenAPI `$ref` cycle).
 */
const staffCategoryBase = z.object({ id, name: z.string() });
const staffCategoryLeaf = staffCategoryBase;
const staffCategoryBranch = staffCategoryBase.extend({
  children: z.array(staffCategoryLeaf),
});
export const staffCategoryNode = staffCategoryBase.extend({
  children: z.array(staffCategoryBranch),
});
export type StaffCategoryNode = z.infer<typeof staffCategoryNode>;

export const staffProductCategories = z.object({ items: z.array(staffCategoryNode) });

// ---------------------------------------------------------------------------
// SKUs
// ---------------------------------------------------------------------------

/** One row of 商品规格 / 修改价格/库存. A strict subset of `productSku`. */
export const staffSku = z.object({
  id,
  skuCode: z.string(),
  /** `红|XL`; the empty string for a single-spec product. */
  specText: z.string(),
  imageUrl: z.string().nullable(),
  price: money,
  originalPrice: money.nullable(),
  cost: money.nullable(),
  stock: z.number().int().min(0),
  sales: z.number().int().min(0),
  weight: weight.nullable(),
  volume: volume.nullable(),
  isVisible: z.boolean(),
});
export type StaffSku = z.infer<typeof staffSku>;

export const staffSkus = z.object({ items: z.array(staffSku) });

const EDITABLE = [
  'price',
  'cost',
  'originalPrice',
  'stock',
  'skuCode',
  'weight',
  'volume',
] as const;

/**
 * A **patch**, not a replacement.
 *
 * Every field but `id` is optional and an absent key is left alone. Rewriting
 * the whole SKU row on every save would let a price edit from a screen loaded
 * two minutes ago write back the stock that screen was showing and silently
 * un-sell everything bought in between. Here a price edit is a price edit, and
 * the 批量改价 drawer — which sends only the fields the operator filled in —
 * means exactly what it says.
 */
export const staffSkuPatch = z
  .object({
    id,
    price: money.optional(),
    cost: money.optional(),
    originalPrice: money.optional(),
    stock: z.number().int().min(0).max(1_000_000_000).optional(),
    skuCode: z.string().min(1).max(32).optional(),
    weight: weight.optional(),
    volume: volume.optional(),
  })
  .superRefine((value, ctx) => {
    if (EDITABLE.every((key) => value[key] === undefined)) {
      ctx.addIssue({ code: 'custom', message: '修改内容至少填写一项' });
    }
  });
export type StaffSkuPatch = z.infer<typeof staffSkuPatch>;

export const staffSkuUpdateBody = z
  .object({ items: z.array(staffSkuPatch).min(1).max(200) })
  .superRefine((value, ctx) => {
    const ids = value.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: '同一规格不能出现两次' });
    }
  });
export type StaffSkuUpdateBody = z.infer<typeof staffSkuUpdateBody>;

// ---------------------------------------------------------------------------
// 添加商品
// ---------------------------------------------------------------------------

/**
 * The phone's 添加商品 form.
 *
 * **Single-spec only.** A multi-spec product cannot be created from a phone:
 * the uni-app form sends exactly one SKU. The console is where a spec matrix is
 * built.
 *
 * **No `logistics`.** 门店自提 is retired shop-wide, so express is the only
 * mode and the field is not in the request at all rather than accepted and
 * ignored.
 *
 * Everything else is the admin form's own rules: the freight refinements below
 * are the ones `adminProductForm` runs, because the service builds an
 * `AdminProductForm` out of this and calls the same `adminProductCreate` the
 * console does. A product created from the phone is in every storefront list
 * the moment it commits.
 */
export const staffProductForm = z
  .object({
    name: z.string().min(1).max(128),
    imageUrl: z.string().min(1).max(512),
    /** The 添加商品 uploader caps at nine. */
    sliderImages: z.array(z.string().max(512)).max(9).default([]),
    categoryIds: z.array(id).min(1).max(20),
    unitName: z.string().min(1).max(32),
    descriptionHtml: z.string().max(500_000).default(''),
    /** 立即上架. `false` files the product in 仓库中. */
    visible: z.boolean().default(false),
    freightMode: productFreightMode.default('free'),
    /** Per unit: the freight charged is this times the quantity. */
    fixedFreight: money.optional(),
    shippingTemplateId: id.optional(),
    sku: z.object({
      price: money,
      cost: money.optional(),
      originalPrice: money.optional(),
      stock: z.number().int().min(0).max(1_000_000_000),
      skuCode: z.string().max(32).optional(),
      barCode: z.string().max(50).optional(),
      weight: weight.optional(),
      volume: volume.optional(),
    }),
  })
  .superRefine((value, ctx) => {
    if (value.freightMode === 'fixed' && value.fixedFreight === undefined) {
      ctx.addIssue({ code: 'custom', path: ['fixedFreight'], message: '请填写固定运费' });
    }
    if (value.freightMode === 'template' && value.shippingTemplateId === undefined) {
      ctx.addIssue({ code: 'custom', path: ['shippingTemplateId'], message: '请选择运费模板' });
    }
    if (value.freightMode !== 'fixed' && value.fixedFreight !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['fixedFreight'],
        message: '当前计费方式不需要固定运费',
      });
    }
    if (value.freightMode !== 'template' && value.shippingTemplateId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['shippingTemplateId'],
        message: '当前计费方式不需要运费模板',
      });
    }
  });
export type StaffProductForm = z.infer<typeof staffProductForm>;

// ---------------------------------------------------------------------------
// examples
// ---------------------------------------------------------------------------

export const staffProductListItemExample: StaffProductListItem = {
  id: '1',
  name: '经典白T恤',
  imageUrl: 'https://cdn.example.com/p/1.png',
  price: '59.00',
  stock: 120,
  sales: 33,
  visible: true,
  specMode: true,
  kind: 'physical',
  unitName: '件',
  categoryIds: ['17'],
  labelIds: ['3'],
};

export const staffSkuExample: StaffSku = {
  id: '1001',
  skuCode: 'SKU7K3M9QX2',
  specText: '白|M',
  imageUrl: 'https://cdn.example.com/p/1-white.png',
  price: '59.00',
  originalPrice: '89.00',
  cost: '22.00',
  stock: 60,
  sales: 18,
  weight: '0.25',
  volume: null,
  isVisible: true,
};

export const staffLabelGroupExample: StaffLabelGroup = {
  categoryId: '2',
  categoryName: '促销',
  labels: [{ id: '3', name: '新品' }],
};

export const staffCategoryNodeExample: StaffCategoryNode = {
  id: '17',
  name: '男装',
  children: [{ id: '18', name: '上衣', children: [] }],
};

export const staffProductFormExample = {
  name: '手冲挂耳咖啡',
  imageUrl: 'https://cdn.example.com/p/44.png',
  sliderImages: ['https://cdn.example.com/p/44.png'],
  categoryIds: ['17'],
  unitName: '盒',
  descriptionHtml: '<p><img src="https://cdn.example.com/p/44-detail.png" /></p>',
  visible: true,
  freightMode: 'free' as const,
  sku: { price: '49.00', cost: '18.00', originalPrice: '69.00', stock: 200 },
};
