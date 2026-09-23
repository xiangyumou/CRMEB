import type {
  StaffCategoryAssignmentBody,
  StaffCategoryNode,
  StaffLabelAssignmentBody,
  StaffLabelGroup,
  StaffProductForm,
  StaffProductListItem,
  StaffProductListQuery,
  StaffProductState,
  StaffSku,
  StaffSkuUpdateBody,
} from '@shop/contracts/catalog/catalog.staff.schemas';
import type { AdminProductForm } from '@shop/contracts/catalog/schemas';
import type { Tx } from '@shop/db';

import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { catalogConfig } from './catalog.config';
import * as repo from './catalog.repo';
import { adminProductCreate, adminProductSetStatus, pageBounds } from './catalog.service';

/**
 * 移动端商家管理 — 商品管理.
 *
 * Ten thin functions over the catalog the admin surface already uses. Nothing
 * here reaches a table the admin surface does not, and nothing here can do
 * something an admin holding `catalog:*` could not: 上架/下架 and 添加商品 call
 * `adminProductSetStatus` and `adminProductCreate` outright, so a product
 * created from a phone is the same product, validated the same way, visible to
 * the storefront the instant it commits.
 *
 * The two batch writes (标签, 分类) have no console equivalent because the
 * console edits one product at a time from its form. They are the only genuinely
 * new capability in this file, and both are one transaction: a half-applied
 * batch is not a state the shop can be left in.
 */

// ---------------------------------------------------------------------------
// the list
// ---------------------------------------------------------------------------

/** 出售中 / 仓库中 / 已售罄 / 库存警告, as the console's own tabs. */
const TAB_OF: Record<StaffProductState, repo.ProductTab> = {
  'on-sale': 'on_shelf',
  'in-stock': 'not_on_shelf',
  'sold-out': 'sold_out',
  'low-stock': 'stock_warning',
};

export async function staffProductList(
  ctx: Ctx,
  query: StaffProductListQuery,
): Promise<{ items: StaffProductListItem[]; total: number; page: number; pageSize: number }> {
  // The same configured threshold 库存预警 and the `admin_low_stock` notice use,
  // never a number this route invents.
  const config = await ctx.config.get(catalogConfig);
  const { rows, total } = await repo.listProducts(ctx.db, {
    tab: query.state === undefined ? 'all' : TAB_OF[query.state],
    keyword: query.keyword,
    stockThreshold: config.stockWarningThreshold,
    sortBy: 'sortOrder',
    sortOrder: 'desc',
    ...pageBounds(query),
  });

  return { items: await decorate(ctx.db, rows), total, page: query.page, pageSize: query.pageSize };
}

/**
 * 上架 / 下架.
 *
 * `{ visible }` in, the console's own conditional status update underneath. A
 * staff member has no way to produce a draft, so `false` is `off_shelf` — which
 * is also what makes a draft they publish and then hide stay findable in 仓库中.
 */
export async function staffSetVisibility(
  ctx: Ctx,
  input: { id: string },
  body: { visible: boolean },
): Promise<StaffProductListItem> {
  await adminProductSetStatus(ctx, input, { status: body.visible ? 'on_shelf' : 'off_shelf' });
  return staffProductRow(ctx, Number(input.id));
}

// ---------------------------------------------------------------------------
// the two batch drawers
// ---------------------------------------------------------------------------

/** Every enabled label, grouped by 标签分类; the ungrouped ones come last. */
export async function staffProductLabels(ctx: Ctx): Promise<{ items: StaffLabelGroup[] }> {
  const { rows } = await repo.listLabels(ctx.db, {
    isEnabled: true,
    offset: 0,
    limit: LABEL_CEILING,
    sortBy: 'sortOrder',
    sortOrder: 'asc',
  });

  const groups = new Map<string, StaffLabelGroup>();
  for (const { label, categoryName } of rows) {
    const key = label.categoryId === null ? '' : String(label.categoryId);
    const group = groups.get(key) ?? {
      categoryId: label.categoryId === null ? null : String(label.categoryId),
      categoryName: categoryName ?? '未分类',
      labels: [],
    };
    group.labels.push({ id: String(label.id), name: label.name });
    groups.set(key, group);
  }

  // `''` is the ungrouped bucket and sorts last: a heading of 未分类 above the
  // shop's real groups reads like the most important one.
  const ordered = [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : 0))
    .map(([, group]) => group);
  return { items: ordered };
}

/** No shop has more labels than this, and an unbounded read behind a phone is a DoS. */
const LABEL_CEILING = 500;

/** The category picker: id, name, children, three levels, hidden ones included. */
export async function staffProductCategories(ctx: Ctx): Promise<{ items: StaffCategoryNode[] }> {
  const rows = await repo.listAllCategories(ctx.db, { visibleOnly: false });
  const childrenOf = (parentId: number | null) => rows.filter((row) => row.parentId === parentId);

  return {
    items: childrenOf(null).map((root) => ({
      id: String(root.id),
      name: root.name,
      children: childrenOf(root.id).map((branch) => ({
        id: String(branch.id),
        name: branch.name,
        children: childrenOf(branch.id).map((leaf) => ({
          id: String(leaf.id),
          name: leaf.name,
        })),
      })),
    })),
  };
}

export async function staffAssignLabels(
  ctx: Ctx,
  body: StaffLabelAssignmentBody,
): Promise<{ updated: number }> {
  const labelIds = body.labelIds.map(Number);
  return ctx.withTx(async (tx) => {
    const productIds = await assertLiveProducts(tx, body.productIds);
    if (labelIds.length > 0) {
      const found = await repo.existingLabelIds(tx, labelIds);
      if (found.size !== new Set(labelIds).size) throw new DomainError('CATALOG_LABEL_NOT_FOUND');
    }
    for (const productId of productIds) {
      await repo.replaceLabelLinks(tx, productId, labelIds);
    }
    return { updated: productIds.length };
  });
}

export async function staffAssignCategories(
  ctx: Ctx,
  body: StaffCategoryAssignmentBody,
): Promise<{ updated: number }> {
  const categoryIds = body.categoryIds.map(Number);
  return ctx.withTx(async (tx) => {
    const productIds = await assertLiveProducts(tx, body.productIds);
    const found = await repo.existingCategoryIds(tx, categoryIds);
    if (found.size !== new Set(categoryIds).size) {
      throw new DomainError('CATALOG_CATEGORY_NOT_FOUND');
    }
    for (const productId of productIds) {
      await repo.replaceCategoryLinks(tx, productId, categoryIds);
    }
    return { updated: productIds.length };
  });
}

/**
 * Every id must be a live product or the whole batch is a 404.
 *
 * Applying a label to nine of ten selected products and reporting success is
 * how an operator learns not to trust the screen; one missing id is the batch's
 * problem, not the nine's.
 */
async function assertLiveProducts(tx: Tx, ids: readonly string[]): Promise<number[]> {
  const wanted = [...new Set(ids.map(Number))];
  const found = await repo.productsByIds(tx, wanted);
  const live = wanted.filter((id) => found.get(id)?.deletedAt === null);
  if (live.length !== wanted.length) throw new DomainError('CATALOG_PRODUCT_NOT_FOUND');
  return live;
}

// ---------------------------------------------------------------------------
// 规格 / 修改价格库存
// ---------------------------------------------------------------------------

export async function staffProductSkus(
  ctx: Ctx,
  input: { id: string },
): Promise<{ items: StaffSku[] }> {
  const product = await repo.findProduct(ctx.db, Number(input.id));
  if (!product) throw new DomainError('CATALOG_PRODUCT_NOT_FOUND');
  const rows = await repo.listSkus(ctx.db, product.id);
  return { items: rows.map(toStaffSku) };
}

/**
 * 修改价格 / 库存, one patch per SKU.
 *
 * Three deliberate things:
 *
 *  - **an absent key is left alone.** Rewriting the whole row would let a price
 *    edit from a stale screen write that screen's stock back and un-sell every
 *    order placed in between. `stock` is only touched when `stock` was sent.
 *  - **the rows are locked before anything is written** (`FOR UPDATE`, in id
 *    order), so a concurrent `reserve` waits for the commit and then decrements
 *    the number the operator set, instead of being overwritten by it.
 *  - **`products.stock` is rolled up in the same transaction**, so the list the
 *    operator returns to can never disagree with the SKUs it came from.
 *
 * A card-key SKU refuses a stock change outright: the pool is the stock, and a
 * hand-typed number would be overwritten by the next import (and, worse, sell
 * cards that do not exist in the meantime).
 */
export async function staffUpdateSkus(
  ctx: Ctx,
  input: { id: string },
  body: StaffSkuUpdateBody,
): Promise<{ items: StaffSku[] }> {
  const productId = Number(input.id);
  return ctx.withTx(async (tx) => {
    const product = await repo.findProduct(tx, productId);
    if (!product) throw new DomainError('CATALOG_PRODUCT_NOT_FOUND');

    const locked = await repo.lockSkusOfProduct(tx, productId);
    const byId = new Map(locked.map((sku) => [sku.id, sku]));
    const now = ctx.clock.now();

    for (const patch of body.items) {
      const sku = byId.get(Number(patch.id));
      // A SKU of another product is `CATALOG_SKU_NOT_FOUND`, not a silent skip:
      // 404 is also what a genuinely missing id deserves, and telling a staff
      // member which of the two it was would leak another product's ids.
      if (sku === undefined) throw new DomainError('CATALOG_SKU_NOT_FOUND');

      if (patch.stock !== undefined && product.kind === 'virtual_card') {
        throw new DomainError('CATALOG_CARD_STOCK_NOT_EDITABLE');
      }
      if (patch.skuCode !== undefined && patch.skuCode !== sku.skuCode) {
        const taken = await repo.findSkuByCode(tx, patch.skuCode);
        if (taken !== null) throw new DomainError('CATALOG_NAME_TAKEN');
      }

      await repo.updateSku(tx, sku.id, {
        ...(patch.price === undefined ? {} : { price: patch.price }),
        ...(patch.cost === undefined ? {} : { cost: patch.cost }),
        ...(patch.originalPrice === undefined ? {} : { originalPrice: patch.originalPrice }),
        ...(patch.stock === undefined ? {} : { stock: patch.stock }),
        ...(patch.skuCode === undefined ? {} : { skuCode: patch.skuCode }),
        ...(patch.weight === undefined ? {} : { weight: patch.weight }),
        ...(patch.volume === undefined ? {} : { volume: patch.volume }),
        updatedAt: now,
      });
    }

    await repo.rollupProduct(tx, productId);
    const rows = await repo.listSkus(tx, productId);
    return { items: rows.map(toStaffSku) };
  });
}

// ---------------------------------------------------------------------------
// 添加商品
// ---------------------------------------------------------------------------

/**
 * The phone's 添加商品, expanded into the console's own form.
 *
 * Everything the console validates — the category ids exist, the freight source
 * matches the mode, the SPU is free, the single implicit SKU — is validated
 * here, because this *is* the console's create. The only decisions this function
 * makes are the ones the phone's form does not offer: 实物商品, single spec, no
 * 限购, no 参数, sort order 0.
 */
export async function staffProductCreate(
  ctx: Ctx,
  body: StaffProductForm,
): Promise<StaffProductListItem> {
  const form: AdminProductForm = {
    name: body.name,
    kind: 'physical',
    status: body.visible ? 'on_shelf' : 'off_shelf',
    imageUrl: body.imageUrl,
    sliderImages: body.sliderImages,
    unitName: body.unitName,
    displaySalesBoost: 0,
    specMode: false,
    specs: [],
    skus: [
      {
        specValues: {},
        price: body.sku.price,
        stock: body.sku.stock,
        ...(body.sku.cost === undefined ? {} : { cost: body.sku.cost }),
        ...(body.sku.originalPrice === undefined ? {} : { originalPrice: body.sku.originalPrice }),
        ...(body.sku.skuCode === undefined ? {} : { skuCode: body.sku.skuCode }),
        ...(body.sku.barCode === undefined ? {} : { barCode: body.sku.barCode }),
        ...(body.sku.weight === undefined ? {} : { weight: body.sku.weight }),
        ...(body.sku.volume === undefined ? {} : { volume: body.sku.volume }),
        isDefault: true,
        isVisible: true,
        sortOrder: 0,
      },
    ],
    // 划线价 lives on the SKU on this form; the product-level one is the
    // console's and is left for it to set.
    freightMode: body.freightMode,
    ...(body.fixedFreight === undefined ? {} : { fixedFreight: body.fixedFreight }),
    ...(body.shippingTemplateId === undefined
      ? {}
      : { shippingTemplateId: body.shippingTemplateId }),
    purchaseLimitMode: 'none',
    minPurchaseQuantity: 1,
    isHot: false,
    isNew: false,
    isBest: false,
    isBenefit: false,
    isRecommended: false,
    sortOrder: 0,
    descriptionHtml: body.descriptionHtml,
    categoryIds: body.categoryIds,
    labelIds: [],
    protectionIds: [],
    params: [],
    recommendedProductIds: [],
    giftCouponIds: [],
  };

  const created = await adminProductCreate(ctx, form);
  return staffProductRow(ctx, Number(created.id));
}

// ---------------------------------------------------------------------------
// row -> DTO
// ---------------------------------------------------------------------------

function toStaffSku(row: repo.SkuRow): StaffSku {
  return {
    id: String(row.id),
    skuCode: row.skuCode,
    specText: row.specText,
    imageUrl: row.imageUrl,
    price: row.price,
    originalPrice: row.originalPrice,
    cost: row.cost,
    stock: row.stock,
    sales: row.sales,
    weight: row.weight,
    volume: row.volume,
    isVisible: row.isVisible,
  };
}

async function decorate(
  db: Ctx['db'],
  rows: readonly repo.ProductRow[],
): Promise<StaffProductListItem[]> {
  const ids = rows.map((row) => row.id);
  const [categoryIds, labels] = await Promise.all([
    repo.categoryIdsFor(db, ids),
    repo.labelsFor(db, ids),
  ]);

  return rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    imageUrl: row.imageUrl,
    price: row.price,
    stock: row.stock,
    sales: row.sales,
    visible: row.status === 'on_shelf',
    specMode: row.specMode,
    kind: row.kind,
    unitName: row.unitName,
    categoryIds: (categoryIds.get(row.id) ?? []).map(String),
    labelIds: (labels.get(row.id) ?? []).map((label) => String(label.id)),
  }));
}

/** One row in the list's own shape, for the two routes that answer with one. */
async function staffProductRow(ctx: Ctx, productId: number): Promise<StaffProductListItem> {
  const row = await repo.findProduct(ctx.db, productId);
  if (!row) throw new DomainError('CATALOG_PRODUCT_NOT_FOUND');
  const [item] = await decorate(ctx.db, [row]);
  return item!;
}
