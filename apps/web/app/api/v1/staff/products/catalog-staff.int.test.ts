import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLogs } from '@shop/db/schema/auth';
import {
  productCategories,
  productCategoriesMap,
  productLabelCategories,
  productLabels,
  productSkus,
  products,
} from '@shop/db/schema/catalog';
import { shippingTemplates } from '@shop/db/schema/shipping';
import { users } from '@shop/db/schema/user';
import {
  AdminAuthService,
  registerUserLookup,
  resetUserLookup,
  UserSessionService,
} from '@shop/core/auth';
import { orderStaffConfig } from '@shop/core/order';
import { createTestCtx, fakeUserLookup, type TestCtx } from '@shop/testing';
import { setContainer, type Container } from '../../../../../src/server/container';
import type { Env } from '../../../../../src/server/env';

/**
 * 移动端商家管理 — 商品管理 as HTTP.
 *
 * The behaviour of every one of these ten calls is pinned in
 * `packages/core/src/catalog/catalog.staff.int.test.ts`. What is proved here is
 * only what a route file can get wrong: the contract bound to the wrong method
 * or path, and — the reason there is one test per route — `auth: 'staff'`
 * failing *open*. Every route gets the same pair: a signed-in shopper
 * who is not on the `orderStaff` list is a 403, the same shopper added to the
 * list is served.
 *
 * "Not on the list" is a 403 and not an empty list, exactly as
 * `/api/v1/staff/orders` behaves; there is no per-route permission because
 * staff is a config list, not a role.
 */

let harness: TestCtx;

const ORIGIN = 'https://shop.example';
const NOW = '2026-06-01T00:00:00.000Z';

const env: Env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'unused',
  REDIS_URL: 'unused',
  UPLOADS_DIR: '/tmp/uploads',
  UPLOADS_PUBLIC_PREFIX: '/uploads',
  APP_ORIGIN: ORIGIN,
  EXTRA_ALLOWED_ORIGINS: [],
  LOG_LEVEL: 'silent',
  LOG_PRETTY: false,
  VALIDATE_RESPONSES: true,
  DB_POOL_MAX: 5,
  QUEUE_NAME: 'shop',
  APP_VERSION: 'test',
};

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW, platform: 'h5' });
  const container: Container = {
    env,
    dbHandle: harness.db.handle,
    db: harness.ctx.db,
    redis: harness.redis,
    clock: harness.clock,
    logger: harness.ctx.logger,
    queue: harness.ctx.queue,
    storage: harness.ctx.storage,
    config: harness.ctx.config,
    adminAuth: new AdminAuthService(harness.ctx, { bcryptCost: 4 }),
    userSessions: new UserSessionService(),
    close: async () => {},
  };
  setContainer(container);
}, 180_000);

afterAll(async () => {
  setContainer(undefined);
  resetUserLookup();
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
  harness.clock.set(NOW);
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const json = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...headers },
  });

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { headers });

const route = (id: string) => ({ params: Promise.resolve({ id }) });

let sequence = 0;

/** A signed-in storefront shopper. Not staff until `promote` says so. */
async function shopper(): Promise<{ userId: number; headers: Record<string, string> }> {
  sequence += 1;
  const [user] = await harness.ctx.db
    .insert(users)
    .values({ account: `shopper-${sequence}` })
    .returning({ id: users.id });
  registerUserLookup(fakeUserLookup([{ id: user!.id }]));
  const issued = await new UserSessionService().issue(harness.ctx, {
    userId: user!.id,
    passwordVersion: 1,
    platform: 'h5',
  });
  return {
    userId: user!.id,
    headers: { authorization: `Bearer ${issued.token}`, 'x-client-platform': 'h5' },
  };
}

async function promote(userId: number): Promise<void> {
  await harness.ctx.config.set(orderStaffConfig, { staffUserIds: [userId] });
}

/** A shopper who is on the staff list. */
async function staff(): Promise<Record<string, string>> {
  const { userId, headers } = await shopper();
  await promote(userId);
  return headers;
}

interface Seeded {
  productId: number;
  skuId: number;
  categoryId: number;
  labelId: number;
}

async function seedProduct(overrides: { name?: string; stock?: number } = {}): Promise<Seeded> {
  sequence += 1;
  const [category] = await harness.ctx.db
    .insert(productCategories)
    .values({ name: `分类${sequence}`, path: '/', level: 0 })
    .returning({ id: productCategories.id });
  const [labelCategory] = await harness.ctx.db
    .insert(productLabelCategories)
    .values({ name: `标签组${sequence}` })
    .returning({ id: productLabelCategories.id });
  const [label] = await harness.ctx.db
    .insert(productLabels)
    .values({ categoryId: labelCategory!.id, name: `标签${sequence}`, isEnabled: true })
    .returning({ id: productLabels.id });

  const stock = overrides.stock ?? 50;
  const [product] = await harness.ctx.db
    .insert(products)
    .values({
      name: overrides.name ?? `商品${sequence}`,
      status: 'on_shelf',
      imageUrl: 'https://cdn.example.com/p.jpg',
      price: '60.00',
      stock,
      freightMode: 'free',
      unitName: '件',
    })
    .returning({ id: products.id });
  await harness.ctx.db
    .insert(productCategoriesMap)
    .values({ productId: product!.id, categoryId: category!.id });
  const [sku] = await harness.ctx.db
    .insert(productSkus)
    .values({
      productId: product!.id,
      skuCode: `SKU-${sequence}`,
      specText: '默认',
      price: '60.00',
      stock,
      isDefault: true,
    })
    .returning({ id: productSkus.id });

  return {
    productId: product!.id,
    skuId: sku!.id,
    categoryId: category!.id,
    labelId: label!.id,
  };
}

const codeOf = async (response: Response) => (await response.json()).code;

// ---------------------------------------------------------------------------
// GET /api/v1/staff/products
// ---------------------------------------------------------------------------

describe('GET /api/v1/staff/products', () => {
  it('401s with no session at all', async () => {
    const { GET } = await import('./route');
    const response = await GET(get('/api/v1/staff/products?page=1&pageSize=20'));
    expect(response.status).toBe(401);
    expect(await codeOf(response)).toBe('UNAUTHENTICATED');
  });

  it('403s a shopper who is not on the staff list', async () => {
    const { headers } = await shopper();
    const { GET } = await import('./route');
    const response = await GET(get('/api/v1/staff/products?page=1&pageSize=20', headers));
    expect(response.status).toBe(403);
    expect(await codeOf(response)).toBe('FORBIDDEN');
  });

  it('serves a staff member the list, filtered by state', async () => {
    const headers = await staff();
    await seedProduct({ name: '在售商品' });

    const { GET } = await import('./route');
    const response = await GET(
      get('/api/v1/staff/products?page=1&pageSize=20&state=on-sale', headers),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({ name: '在售商品', visible: true, specMode: false });
  });

  it('refuses a query the schema does not accept', async () => {
    const headers = await staff();
    const { GET } = await import('./route');
    const response = await GET(
      get('/api/v1/staff/products?page=1&pageSize=20&state=偷懒', headers),
    );
    expect(response.status).toBe(422);
    expect(await codeOf(response)).toBe('VALIDATION_FAILED');
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/staff/products
// ---------------------------------------------------------------------------

describe('POST /api/v1/staff/products', () => {
  const form = (categoryId: number) => ({
    name: '手冲挂耳咖啡',
    imageUrl: 'https://cdn.example.com/p/44.png',
    sliderImages: ['https://cdn.example.com/p/44.png'],
    categoryIds: [String(categoryId)],
    unitName: '盒',
    descriptionHtml: '<p>好喝</p>',
    visible: true,
    freightMode: 'free' as const,
    sku: { price: '49.00', cost: '18.00', originalPrice: '69.00', stock: 200 },
  });

  it('403s a shopper who is not on the staff list, and writes nothing', async () => {
    const { headers } = await shopper();
    const seeded = await seedProduct();
    const { POST } = await import('./route');
    const response = await POST(
      json('POST', '/api/v1/staff/products', form(seeded.categoryId), headers),
    );
    expect(response.status).toBe(403);
    expect(await harness.ctx.db.select().from(auditLogs)).toHaveLength(0);
  });

  it('creates with 201, and the storefront can sell what it created', async () => {
    const seeded = await seedProduct();
    const headers = await staff();

    const { POST } = await import('./route');
    const response = await POST(
      json('POST', '/api/v1/staff/products', form(seeded.categoryId), headers),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      name: '手冲挂耳咖啡',
      price: '49.00',
      stock: 200,
      visible: true,
      specMode: false,
      unitName: '盒',
    });

    const { GET } = await import('../../catalog/products/[id]/route');
    const detail = await GET(get(`/api/v1/catalog/products/${body.id}`), {
      params: Promise.resolve({ id: String(body.id) }),
    });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ name: '手冲挂耳咖啡' });

    // A staff write is an audit row (`actor_kind = 'staff'`, the 店员's user
    // id).
    const audit = await harness.ctx.db.select().from(auditLogs);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorKind: 'staff',
      adminId: null,
      routeId: 'catalog.staffProductCreate',
      target: `product:${body.id}`,
      status: 201,
    });
    expect(audit[0]!.userId).not.toBeNull();
  });

  it('refuses a malformed body before it writes anything', async () => {
    const seeded = await seedProduct();
    const headers = await staff();
    const { POST } = await import('./route');
    const response = await POST(
      json(
        'POST',
        '/api/v1/staff/products',
        { ...form(seeded.categoryId), sku: { price: '49.00' } },
        headers,
      ),
    );
    expect(response.status).toBe(422);
    expect(await codeOf(response)).toBe('VALIDATION_FAILED');
    expect(await harness.ctx.db.select().from(auditLogs)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/staff/products/:id/visibility
// ---------------------------------------------------------------------------

describe('POST /api/v1/staff/products/:id/visibility', () => {
  it('403s a shopper who is not on the staff list, and leaves the product up', async () => {
    const { headers } = await shopper();
    const seeded = await seedProduct();
    const { POST } = await import('./[id]/visibility/route');
    const response = await POST(
      json(
        'POST',
        `/api/v1/staff/products/${seeded.productId}/visibility`,
        { visible: false },
        headers,
      ),
      route(String(seeded.productId)),
    );
    expect(response.status).toBe(403);

    const { GET } = await import('../../catalog/products/[id]/route');
    const detail = await GET(get(`/api/v1/catalog/products/${seeded.productId}`), {
      params: Promise.resolve({ id: String(seeded.productId) }),
    });
    expect(detail.status).toBe(200);
  });

  it('takes the product off the shelf, and the storefront stops serving it', async () => {
    const seeded = await seedProduct();
    const headers = await staff();

    const { POST } = await import('./[id]/visibility/route');
    const response = await POST(
      json(
        'POST',
        `/api/v1/staff/products/${seeded.productId}/visibility`,
        { visible: false },
        headers,
      ),
      route(String(seeded.productId)),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ visible: false });

    const { GET } = await import('../../catalog/products/[id]/route');
    const detail = await GET(get(`/api/v1/catalog/products/${seeded.productId}`), {
      params: Promise.resolve({ id: String(seeded.productId) }),
    });
    expect(detail.status).toBe(404);
  });

  it('answers a missing product with the status the contract declares', async () => {
    const headers = await staff();
    const { POST } = await import('./[id]/visibility/route');
    const response = await POST(
      json('POST', '/api/v1/staff/products/999/visibility', { visible: false }, headers),
      route('999'),
    );
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe('CATALOG_PRODUCT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// the two drawers
// ---------------------------------------------------------------------------

describe('GET /api/v1/staff/product-labels', () => {
  it('403s a shopper who is not on the staff list', async () => {
    const { headers } = await shopper();
    const { GET } = await import('../product-labels/route');
    expect((await GET(get('/api/v1/staff/product-labels', headers))).status).toBe(403);
  });

  it('serves the enabled labels grouped by category', async () => {
    const seeded = await seedProduct();
    const headers = await staff();
    const { GET } = await import('../product-labels/route');
    const response = await GET(get('/api/v1/staff/product-labels', headers));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.items.flatMap((group: { labels: { id: string }[] }) => group.labels),
    ).toContainEqual(expect.objectContaining({ id: String(seeded.labelId) }));
  });
});

describe('GET /api/v1/staff/product-categories', () => {
  it('403s a shopper who is not on the staff list', async () => {
    const { headers } = await shopper();
    const { GET } = await import('../product-categories/route');
    expect((await GET(get('/api/v1/staff/product-categories', headers))).status).toBe(403);
  });

  it('serves the category tree', async () => {
    const seeded = await seedProduct();
    const headers = await staff();
    const { GET } = await import('../product-categories/route');
    const response = await GET(get('/api/v1/staff/product-categories', headers));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toContainEqual(expect.objectContaining({ id: String(seeded.categoryId) }));
  });
});

describe('POST /api/v1/staff/products/label-assignments', () => {
  it('403s a shopper who is not on the staff list', async () => {
    const { headers } = await shopper();
    const seeded = await seedProduct();
    const { POST } = await import('./label-assignments/route');
    const response = await POST(
      json(
        'POST',
        '/api/v1/staff/products/label-assignments',
        { productIds: [String(seeded.productId)], labelIds: [String(seeded.labelId)] },
        headers,
      ),
    );
    expect(response.status).toBe(403);
    expect(await harness.ctx.db.select().from(auditLogs)).toHaveLength(0);
  });

  it('applies the set to every selected product', async () => {
    const one = await seedProduct();
    const two = await seedProduct();
    const headers = await staff();

    const { POST } = await import('./label-assignments/route');
    const response = await POST(
      json(
        'POST',
        '/api/v1/staff/products/label-assignments',
        {
          productIds: [String(one.productId), String(two.productId)],
          labelIds: [String(one.labelId)],
        },
        headers,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 2 });

    const { GET } = await import('./route');
    const listed = await GET(get('/api/v1/staff/products?page=1&pageSize=20', headers));
    const items: { id: string; labelIds: string[] }[] = (await listed.json()).items;
    for (const item of items) expect(item.labelIds).toEqual([String(one.labelId)]);
  });

  it('answers a missing product with 404 and changes nothing', async () => {
    const seeded = await seedProduct();
    const headers = await staff();
    const { POST } = await import('./label-assignments/route');
    const response = await POST(
      json(
        'POST',
        '/api/v1/staff/products/label-assignments',
        { productIds: [String(seeded.productId), '999'], labelIds: [String(seeded.labelId)] },
        headers,
      ),
    );
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe('CATALOG_PRODUCT_NOT_FOUND');
  });
});

describe('POST /api/v1/staff/products/category-assignments', () => {
  it('403s a shopper who is not on the staff list', async () => {
    const { headers } = await shopper();
    const seeded = await seedProduct();
    const { POST } = await import('./category-assignments/route');
    const response = await POST(
      json(
        'POST',
        '/api/v1/staff/products/category-assignments',
        { productIds: [String(seeded.productId)], categoryIds: [String(seeded.categoryId)] },
        headers,
      ),
    );
    expect(response.status).toBe(403);
  });

  it('re-files every selected product', async () => {
    const one = await seedProduct();
    const two = await seedProduct();
    const headers = await staff();

    const { POST } = await import('./category-assignments/route');
    const response = await POST(
      json(
        'POST',
        '/api/v1/staff/products/category-assignments',
        {
          productIds: [String(one.productId), String(two.productId)],
          categoryIds: [String(one.categoryId)],
        },
        headers,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updated: 2 });

    const { GET } = await import('./route');
    const listed = await GET(get('/api/v1/staff/products?page=1&pageSize=20', headers));
    const items: { categoryIds: string[] }[] = (await listed.json()).items;
    for (const item of items) expect(item.categoryIds).toEqual([String(one.categoryId)]);
  });
});

// ---------------------------------------------------------------------------
// 规格 / 修改价格库存
// ---------------------------------------------------------------------------

describe('/api/v1/staff/products/:id/skus', () => {
  it('403s a shopper who is not on the staff list, on both methods', async () => {
    const { headers } = await shopper();
    const seeded = await seedProduct();
    const { GET, PUT } = await import('./[id]/skus/route');

    expect(
      (
        await GET(
          get(`/api/v1/staff/products/${seeded.productId}/skus`, headers),
          route(String(seeded.productId)),
        )
      ).status,
    ).toBe(403);

    const refused = await PUT(
      json(
        'PUT',
        `/api/v1/staff/products/${seeded.productId}/skus`,
        { items: [{ id: String(seeded.skuId), price: '1.00' }] },
        headers,
      ),
      route(String(seeded.productId)),
    );
    expect(refused.status).toBe(403);

    const [sku] = await harness.ctx.db.select().from(productSkus);
    expect(sku!.price).toBe('60.00');
  });

  it('lists the SKUs and patches one of them without touching its stock', async () => {
    const seeded = await seedProduct({ stock: 50 });
    const headers = await staff();

    const { GET, PUT } = await import('./[id]/skus/route');
    const listed = await GET(
      get(`/api/v1/staff/products/${seeded.productId}/skus`, headers),
      route(String(seeded.productId)),
    );
    expect(listed.status).toBe(200);
    expect((await listed.json()).items).toHaveLength(1);

    const updated = await PUT(
      json(
        'PUT',
        `/api/v1/staff/products/${seeded.productId}/skus`,
        { items: [{ id: String(seeded.skuId), price: '79.00' }] },
        headers,
      ),
      route(String(seeded.productId)),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).items[0]).toMatchObject({ price: '79.00', stock: 50 });

    const [row] = await harness.ctx.db.select().from(productSkus);
    expect(row!.stock).toBe(50);
  });

  it('records the reprice in the operation log, naming the 店员 and the product', async () => {
    const seeded = await seedProduct();
    const { userId, headers } = await shopper();
    await promote(userId);

    const { PUT } = await import('./[id]/skus/route');
    const updated = await PUT(
      json(
        'PUT',
        `/api/v1/staff/products/${seeded.productId}/skus`,
        { items: [{ id: String(seeded.skuId), price: '0.01' }] },
        headers,
      ),
      route(String(seeded.productId)),
    );
    expect(updated.status).toBe(200);

    const audit = await harness.ctx.db.select().from(auditLogs);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorKind: 'staff',
      adminId: null,
      userId,
      adminAccount: `staff:${userId}`,
      method: 'PUT',
      path: `/api/v1/staff/products/${seeded.productId}/skus`,
      target: `product:${seeded.productId}`,
      status: 200,
    });
    expect(JSON.parse(audit[0]!.payload!)).toEqual({
      items: [{ id: String(seeded.skuId), price: '0.01' }],
    });
  });

  it('refuses an empty patch before it opens a transaction', async () => {
    const seeded = await seedProduct();
    const headers = await staff();
    const { PUT } = await import('./[id]/skus/route');
    const response = await PUT(
      json(
        'PUT',
        `/api/v1/staff/products/${seeded.productId}/skus`,
        { items: [{ id: String(seeded.skuId) }] },
        headers,
      ),
      route(String(seeded.productId)),
    );
    expect(response.status).toBe(422);
    expect(await codeOf(response)).toBe('VALIDATION_FAILED');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/staff/shipping-templates
// ---------------------------------------------------------------------------

describe('GET /api/v1/staff/shipping-templates', () => {
  it('403s a shopper who is not on the staff list', async () => {
    const { headers } = await shopper();
    const { GET } = await import('../shipping-templates/route');
    expect((await GET(get('/api/v1/staff/shipping-templates', headers))).status).toBe(403);
  });

  it('serves the shipping domain’s own options list', async () => {
    const headers = await staff();
    await harness.ctx.db
      .insert(shippingTemplates)
      .values({ name: '全国包邮', chargeMode: 'quantity' });

    const { GET } = await import('../shipping-templates/route');
    const response = await GET(get('/api/v1/staff/shipping-templates', headers));
    expect(response.status).toBe(200);
    expect((await response.json()).items).toContainEqual(
      expect.objectContaining({ name: '全国包邮', chargeMode: 'quantity' }),
    );
  });
});
