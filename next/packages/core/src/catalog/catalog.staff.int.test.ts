import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestCtx, type TestCtx } from '@shop/testing';

import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { catalogConfig } from './catalog.config';
import * as repo from './catalog.repo';
import * as service from './catalog.service';
import * as staff from './catalog.staff.service';
import * as storefront from './catalog.storefront.service';
import * as taxonomy from './catalog.taxonomy.service';
import {
  adminActor,
  firstSkuId,
  makeAdmin,
  makeCategory,
  makeProduct,
  productForm,
} from './catalog.fixtures.repo';
import '../order';

/**
 * 移动端商家管理 — 商品管理, against a real PostgreSQL.
 *
 * The `auth: 'staff'` guard itself is HTTP and is pinned in
 * `apps/web/app/api/v1/staff/products/catalog-staff.int.test.ts`. What is proved
 * here is what the phone's four tabs actually select, that a patch really is a
 * patch, and that a product created from a phone is a product the storefront
 * can sell.
 */

let harness: TestCtx;
let adminId: number;

const NOW = '2026-06-01T00:00:00.000Z';

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.ctx.config.invalidate(catalogConfig.group);
  harness.clock.set(NOW);
  adminId = await makeAdmin(harness);
});

const asAdmin = (): Ctx => harness.as(adminActor(adminId));

const namesOf = (items: readonly { name: string }[]) => items.map((item) => item.name).sort();

// ---------------------------------------------------------------------------
// the list and its four tabs
// ---------------------------------------------------------------------------

describe('the staff product list', () => {
  /** One product per tab, so each filter has something it must and must not return. */
  async function seedTabs(): Promise<void> {
    await harness.ctx.config.set(catalogConfig, { stockWarningThreshold: 5 });
    const ctx = asAdmin();
    const categoryIds = [await makeCategory(ctx, '男装')];

    await makeProduct(ctx, { name: '在售商品', status: 'on_shelf', categoryIds });
    await makeProduct(ctx, { name: '仓库商品', status: 'off_shelf', categoryIds });
    await makeProduct(ctx, { name: '草稿商品', status: 'draft', categoryIds });
    await makeProduct(ctx, {
      name: '售罄商品',
      status: 'on_shelf',
      categoryIds,
      skus: [
        { specValues: {}, price: '9.00', stock: 0, isDefault: true, isVisible: true, sortOrder: 0 },
      ],
    });
    await makeProduct(ctx, {
      name: '告警商品',
      status: 'on_shelf',
      categoryIds,
      skus: [
        { specValues: {}, price: '9.00', stock: 3, isDefault: true, isVisible: true, sortOrder: 0 },
      ],
    });
  }

  it('出售中 is everything on the shelf, sold out or not', async () => {
    await seedTabs();
    const page = await staff.staffProductList(asAdmin(), {
      page: 1,
      pageSize: 20,
      state: 'on-sale',
    });
    expect(namesOf(page.items)).toEqual(['告警商品', '在售商品', '售罄商品'].sort());
  });

  /**
   * 仓库中 covers `draft` as well as `off_shelf`.
   *
   * The status splits "never published" from "taken down". A draft that only
   * showed in 全部 would be a product the phone could see and never act on.
   */
  it('仓库中 is everything live that is not on the shelf, drafts included', async () => {
    await seedTabs();
    const page = await staff.staffProductList(asAdmin(), {
      page: 1,
      pageSize: 20,
      state: 'in-stock',
    });
    expect(namesOf(page.items)).toEqual(['仓库商品', '草稿商品'].sort());
  });

  it('已售罄 is stock zero', async () => {
    await seedTabs();
    const page = await staff.staffProductList(asAdmin(), {
      page: 1,
      pageSize: 20,
      state: 'sold-out',
    });
    expect(namesOf(page.items)).toEqual(['售罄商品']);
  });

  /** The threshold is `catalog.stockWarningThreshold`, the one 库存预警 uses. */
  it('库存警告 compares against the configured threshold, not a hard-coded one', async () => {
    await seedTabs();
    expect(
      namesOf(
        (await staff.staffProductList(asAdmin(), { page: 1, pageSize: 20, state: 'low-stock' }))
          .items,
      ),
    ).toEqual(['告警商品']);

    await harness.ctx.config.set(catalogConfig, { stockWarningThreshold: 0 });
    expect(
      (await staff.staffProductList(asAdmin(), { page: 1, pageSize: 20, state: 'low-stock' }))
        .items,
    ).toEqual([]);
  });

  it('搜索 matches the product name and carries the row the phone renders', async () => {
    const ctx = asAdmin();
    const categoryId = await makeCategory(ctx, '男装');
    const label = await taxonomy.adminLabelCreate(ctx, {
      name: '新品',
      categoryId: null,
      style: 'text',
      sortOrder: 0,
      isVisible: true,
      isEnabled: true,
    });
    const created = await makeProduct(ctx, {
      name: '经典白T恤',
      status: 'on_shelf',
      unitName: '件',
      categoryIds: [categoryId],
      labelIds: [label.id],
    });

    const page = await staff.staffProductList(ctx, { page: 1, pageSize: 20, keyword: '白T' });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      id: created.id,
      name: '经典白T恤',
      visible: true,
      specMode: false,
      kind: 'physical',
      unitName: '件',
      categoryIds: [categoryId],
      labelIds: [label.id],
    });
    expect(page.items[0]!.stock).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 上架 / 下架
// ---------------------------------------------------------------------------

describe('上架 / 下架 from the phone', () => {
  it('hides the product from the storefront the moment it commits', async () => {
    const ctx = asAdmin();
    const product = await makeProduct(ctx, { status: 'on_shelf' });

    const hidden = await staff.staffSetVisibility(ctx, { id: product.id }, { visible: false });
    expect(hidden.visible).toBe(false);
    await expect(storefront.productDetail(ctx, { id: product.id })).rejects.toThrow(DomainError);

    const shown = await staff.staffSetVisibility(ctx, { id: product.id }, { visible: true });
    expect(shown.visible).toBe(true);
    expect((await storefront.productDetail(ctx, { id: product.id })).id).toBe(product.id);
  });

  it('publishes a draft rather than refusing it', async () => {
    const ctx = asAdmin();
    const product = await makeProduct(ctx, { status: 'draft' });
    expect(
      (await staff.staffSetVisibility(ctx, { id: product.id }, { visible: true })).visible,
    ).toBe(true);
  });

  it('404s an unknown product', async () => {
    await expect(
      staff.staffSetVisibility(asAdmin(), { id: '999999' }, { visible: true }),
    ).rejects.toMatchObject({ code: 'CATALOG_PRODUCT_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// the two pickers
// ---------------------------------------------------------------------------

describe('the label picker', () => {
  it('groups enabled labels by 标签分类 and leaves the ungrouped ones last', async () => {
    const ctx = asAdmin();
    const category = await taxonomy.adminLabelCategoryCreate(ctx, { name: '促销', sortOrder: 0 });
    await taxonomy.adminLabelCreate(ctx, {
      name: '满减',
      categoryId: category.id,
      style: 'text',
      sortOrder: 0,
      isVisible: true,
      isEnabled: true,
    });
    await taxonomy.adminLabelCreate(ctx, {
      name: '清仓',
      categoryId: null,
      style: 'text',
      sortOrder: 1,
      isVisible: true,
      isEnabled: true,
    });
    await taxonomy.adminLabelCreate(ctx, {
      name: '停用的',
      categoryId: null,
      style: 'text',
      sortOrder: 2,
      isVisible: true,
      isEnabled: false,
    });

    const { items } = await staff.staffProductLabels(ctx);
    expect(items.map((group) => group.categoryName)).toEqual(['促销', '未分类']);
    expect(items[0]!.labels.map((label) => label.name)).toEqual(['满减']);
    expect(items[1]!.labels.map((label) => label.name)).toEqual(['清仓']);
  });
});

describe('the category picker', () => {
  it('nests two levels under each root and includes hidden categories', async () => {
    const ctx = asAdmin();
    const root = await service.adminCategoryCreate(ctx, {
      parentId: null,
      name: '男装',
      sortOrder: 0,
      isVisible: true,
    });
    const branch = await service.adminCategoryCreate(ctx, {
      parentId: root.id,
      name: '上衣',
      sortOrder: 0,
      isVisible: false,
    });
    await service.adminCategoryCreate(ctx, {
      parentId: branch.id,
      name: 'T恤',
      sortOrder: 0,
      isVisible: true,
    });

    const { items } = await staff.staffProductCategories(ctx);
    expect(items).toEqual([
      {
        id: root.id,
        name: '男装',
        children: [
          { id: branch.id, name: '上衣', children: [{ id: expect.any(String), name: 'T恤' }] },
        ],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// the two batch writes
// ---------------------------------------------------------------------------

describe('批量打标签', () => {
  it('replaces the labels on every selected product in one transaction', async () => {
    const ctx = asAdmin();
    const label = await taxonomy.adminLabelCreate(ctx, {
      name: '新品',
      categoryId: null,
      style: 'text',
      sortOrder: 0,
      isVisible: true,
      isEnabled: true,
    });
    const a = await makeProduct(ctx);
    const b = await makeProduct(ctx);

    expect(
      await staff.staffAssignLabels(ctx, { productIds: [a.id, b.id], labelIds: [label.id] }),
    ).toEqual({ updated: 2 });
    const page = await staff.staffProductList(ctx, { page: 1, pageSize: 20 });
    expect(page.items.every((item) => item.labelIds.includes(label.id))).toBe(true);

    // An empty list clears, on purpose: the drawer sends what is ticked.
    await staff.staffAssignLabels(ctx, { productIds: [a.id], labelIds: [] });
    const after = await staff.staffProductList(ctx, { page: 1, pageSize: 20 });
    expect(after.items.find((item) => item.id === a.id)!.labelIds).toEqual([]);
  });

  it('refuses the whole batch when one product is gone', async () => {
    const ctx = asAdmin();
    const product = await makeProduct(ctx);
    await expect(
      staff.staffAssignLabels(ctx, { productIds: [product.id, '999999'], labelIds: [] }),
    ).rejects.toMatchObject({ code: 'CATALOG_PRODUCT_NOT_FOUND' });
  });

  it('refuses a label that does not exist', async () => {
    const ctx = asAdmin();
    const product = await makeProduct(ctx);
    await expect(
      staff.staffAssignLabels(ctx, { productIds: [product.id], labelIds: ['999999'] }),
    ).rejects.toMatchObject({ code: 'CATALOG_LABEL_NOT_FOUND' });
  });
});

describe('批量改分类', () => {
  it('replaces the categories on every selected product', async () => {
    const ctx = asAdmin();
    const from = await makeCategory(ctx, '旧分类');
    const to = await makeCategory(ctx, '新分类');
    const a = await makeProduct(ctx, { categoryIds: [from] });
    const b = await makeProduct(ctx, { categoryIds: [from] });

    expect(
      await staff.staffAssignCategories(ctx, { productIds: [a.id, b.id], categoryIds: [to] }),
    ).toEqual({ updated: 2 });
    const page = await staff.staffProductList(ctx, { page: 1, pageSize: 20 });
    expect(page.items.map((item) => item.categoryIds)).toEqual([[to], [to]]);
  });

  it('refuses a category that does not exist', async () => {
    const ctx = asAdmin();
    const product = await makeProduct(ctx);
    await expect(
      staff.staffAssignCategories(ctx, { productIds: [product.id], categoryIds: ['999999'] }),
    ).rejects.toMatchObject({ code: 'CATALOG_CATEGORY_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// 规格 / 修改价格库存
// ---------------------------------------------------------------------------

describe('the staff SKU editor', () => {
  it('lists every SKU with the fields 修改价格/库存 edits', async () => {
    const ctx = asAdmin();
    const product = await makeProduct(ctx, {
      specMode: true,
      specs: [{ name: '颜色', values: [{ value: '白' }, { value: '黑' }] }],
      skus: [
        {
          specValues: { 颜色: '白' },
          price: '59.00',
          cost: '22.00',
          originalPrice: '89.00',
          stock: 6,
          isDefault: true,
          isVisible: true,
          sortOrder: 0,
        },
        {
          specValues: { 颜色: '黑' },
          price: '69.00',
          stock: 4,
          isDefault: false,
          isVisible: true,
          sortOrder: 1,
        },
      ],
    });

    const { items } = await staff.staffProductSkus(ctx, { id: product.id });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      specText: '白',
      price: '59.00',
      cost: '22.00',
      originalPrice: '89.00',
      stock: 6,
      sales: 0,
      isVisible: true,
    });
  });

  /** The defect this route exists to not have. */
  it('leaves a field the patch did not carry alone', async () => {
    const ctx = asAdmin();
    const product = await makeProduct(ctx);
    const skuId = await firstSkuId(harness, product.id);

    const { items } = await staff.staffUpdateSkus(
      ctx,
      { id: product.id },
      { items: [{ id: String(skuId), price: '55.00' }] },
    );
    expect(items[0]).toMatchObject({ price: '55.00', stock: 10 });
  });

  it('rolls the product up so the list cannot disagree with the SKUs', async () => {
    const ctx = asAdmin();
    const product = await makeProduct(ctx);
    const skuId = await firstSkuId(harness, product.id);

    await staff.staffUpdateSkus(
      ctx,
      { id: product.id },
      { items: [{ id: String(skuId), price: '41.00', stock: 77 }] },
    );
    const row = await repo.findProduct(harness.ctx.db, Number(product.id));
    expect(row).toMatchObject({ price: '41.00', stock: 77 });
  });

  it('refuses a SKU that belongs to another product', async () => {
    const ctx = asAdmin();
    const mine = await makeProduct(ctx);
    const theirs = await makeProduct(ctx);
    const otherSku = await firstSkuId(harness, theirs.id);

    await expect(
      staff.staffUpdateSkus(ctx, { id: mine.id }, { items: [{ id: String(otherSku), stock: 1 }] }),
    ).rejects.toMatchObject({ code: 'CATALOG_SKU_NOT_FOUND' });
  });

  it('refuses a hand-typed stock on a card-key product: the pool is the stock', async () => {
    const ctx = asAdmin();
    const product = await service.adminProductCreate(
      ctx,
      productForm({
        kind: 'virtual_card',
        freightMode: 'free',
        categoryIds: [await makeCategory(ctx)],
        skus: [
          {
            specValues: {},
            price: '30.00',
            stock: 0,
            isDefault: true,
            isVisible: true,
            sortOrder: 0,
          },
        ],
      }),
    );
    const skuId = await firstSkuId(harness, product.id);

    await expect(
      staff.staffUpdateSkus(ctx, { id: product.id }, { items: [{ id: String(skuId), stock: 5 }] }),
    ).rejects.toMatchObject({ code: 'CATALOG_CARD_STOCK_NOT_EDITABLE' });
    // …but a price edit on the same SKU is fine.
    const { items } = await staff.staffUpdateSkus(
      ctx,
      { id: product.id },
      { items: [{ id: String(skuId), price: '35.00' }] },
    );
    expect(items[0]!.price).toBe('35.00');
  });

  it('refuses a 规格编码 another SKU already holds', async () => {
    const ctx = asAdmin();
    const a = await makeProduct(ctx);
    const b = await makeProduct(ctx);
    const [taken] = await repo.listSkus(harness.ctx.db, Number(b.id));
    const skuId = await firstSkuId(harness, a.id);

    await expect(
      staff.staffUpdateSkus(
        ctx,
        { id: a.id },
        { items: [{ id: String(skuId), skuCode: taken!.skuCode }] },
      ),
    ).rejects.toMatchObject({ code: 'CATALOG_NAME_TAKEN' });
  });
});

// ---------------------------------------------------------------------------
// 添加商品
// ---------------------------------------------------------------------------

describe('添加商品 from the phone', () => {
  it('creates a single-spec product the storefront can sell immediately', async () => {
    const ctx = asAdmin();
    const categoryId = await makeCategory(ctx, '咖啡');

    const created = await staff.staffProductCreate(ctx, {
      name: '手冲挂耳咖啡',
      imageUrl: 'https://cdn.example.com/p/44.png',
      sliderImages: ['https://cdn.example.com/p/44.png'],
      categoryIds: [categoryId],
      unitName: '盒',
      descriptionHtml: '<p>好喝</p>',
      visible: true,
      freightMode: 'free',
      sku: { price: '49.00', cost: '18.00', originalPrice: '69.00', stock: 200 },
    });

    expect(created).toMatchObject({
      name: '手冲挂耳咖啡',
      price: '49.00',
      stock: 200,
      sales: 0,
      visible: true,
      specMode: false,
      kind: 'physical',
      unitName: '盒',
      categoryIds: [categoryId],
      labelIds: [],
    });

    // The storefront read, not a re-read of the admin row: "the storefront sees
    // the product the moment it is created" is the actual requirement.
    const shopper = await storefront.productDetail(ctx, { id: created.id });
    expect(shopper).toMatchObject({ name: '手冲挂耳咖啡', price: '49.00' });
    expect(shopper.skus).toHaveLength(1);
    expect(shopper.descriptionHtml).toBe('<p>好喝</p>');
  });

  it('files an unpublished product in 仓库中, where the phone can find it', async () => {
    const ctx = asAdmin();
    const created = await staff.staffProductCreate(ctx, {
      name: '未上架商品',
      imageUrl: 'https://cdn.example.com/p/45.png',
      sliderImages: [],
      categoryIds: [await makeCategory(ctx)],
      unitName: '件',
      descriptionHtml: '',
      visible: false,
      freightMode: 'free',
      sku: { price: '10.00', stock: 1 },
    });
    expect(created.visible).toBe(false);

    const warehouse = await staff.staffProductList(ctx, {
      page: 1,
      pageSize: 20,
      state: 'in-stock',
    });
    expect(warehouse.items.map((item) => item.id)).toContain(created.id);
  });

  it('refuses a category that does not exist rather than half-creating', async () => {
    await expect(
      staff.staffProductCreate(asAdmin(), {
        name: '坏分类',
        imageUrl: 'https://cdn.example.com/p/46.png',
        sliderImages: [],
        categoryIds: ['999999'],
        unitName: '件',
        descriptionHtml: '',
        visible: true,
        freightMode: 'free',
        sku: { price: '10.00', stock: 1 },
      }),
    ).rejects.toMatchObject({ code: 'CATALOG_CATEGORY_NOT_FOUND' });

    expect((await staff.staffProductList(asAdmin(), { page: 1, pageSize: 20 })).total).toBe(0);
  });

  it('carries the 运费模板 through to the product the console reads', async () => {
    const ctx = asAdmin();
    const created = await staff.staffProductCreate(ctx, {
      name: '按模板计费',
      imageUrl: 'https://cdn.example.com/p/47.png',
      sliderImages: [],
      categoryIds: [await makeCategory(ctx)],
      unitName: '件',
      descriptionHtml: '',
      visible: true,
      freightMode: 'fixed',
      fixedFreight: '8.00',
      sku: { price: '10.00', stock: 1 },
    });
    const detail = await service.adminProductDetail(ctx, { id: created.id });
    expect(detail).toMatchObject({ freightMode: 'fixed', fixedFreight: '8.00' });
  });
});
