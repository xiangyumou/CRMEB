import { cartItems } from '@shop/db/schema/cart';
import { productSkus, products } from '@shop/db/schema/catalog';
import { users } from '@shop/db/schema/user';
import { createTestCtx, forkTestCtx, runConcurrently, type TestCtx } from '@shop/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Actor, Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { registerCatalogDomain } from '../catalog';
import * as cart from './index';

/**
 * CR-2-h §1 and §2: 修改规格 and 减少数量-by-variant, against a real database.
 *
 * Both replace a storefront workaround that could lose the shopper's row. The
 * old 修改规格 was `DELETE` then `POST` from the page, so a failure between the
 * two left no row at all; the old minus button listed the whole cart to find a
 * row id before it could decrement it. What is tested here is that each is now
 * *one transaction* and that its conditional statements decide the winner.
 */

let harness: TestCtx;
const NOW = '2026-06-01T00:00:00.000Z';

beforeAll(async () => {
  // The cart resolves SKUs through the order domain's CatalogPort, which
  // only the catalog domain registers.
  registerCatalogDomain();
  harness = await createTestCtx({ now: NOW, platform: 'h5' });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  harness.clock.set(NOW);
  harness.queue.reset();
});

let sequence = 0;

const userActor = (id: number): Actor => ({ kind: 'user', id, permissions: [], isSuper: false });
const as = (userId: number): Ctx => harness.as(userActor(userId));
const racer = (userId: number): Ctx => forkTestCtx(harness, { actor: userActor(userId) });

async function makeUser(): Promise<number> {
  sequence += 1;
  const [row] = await harness.ctx.db
    .insert(users)
    .values({ account: `cart-gaps-${sequence}` })
    .returning({ id: users.id });
  return row!.id;
}

interface ProductOptions {
  stock?: number;
  purchaseLimit?: number;
  skus?: number;
}

/** One product with `skus` variants — 修改规格 moves between two of them. */
async function makeProduct(
  options: ProductOptions = {},
): Promise<{ productId: number; skuIds: number[] }> {
  sequence += 1;
  const [product] = await harness.ctx.db
    .insert(products)
    .values({
      name: `商品${sequence}`,
      kind: 'physical',
      status: 'on_shelf',
      imageUrl: 'https://cdn.example.com/p.jpg',
      unitName: '件',
      price: '60.00',
      stock: options.stock ?? 10,
      freightMode: 'free',
      purchaseLimitMode: options.purchaseLimit ? 'per_order' : 'none',
      purchaseLimitQuantity: options.purchaseLimit ?? null,
    })
    .returning({ id: products.id });

  const skuIds: number[] = [];
  for (let i = 0; i < (options.skus ?? 2); i += 1) {
    sequence += 1;
    const [sku] = await harness.ctx.db
      .insert(productSkus)
      .values({
        productId: product!.id,
        skuCode: `SKU-${sequence}`,
        specText: `规格${i + 1}`,
        price: '60.00',
        originalPrice: '88.00',
        stock: options.stock ?? 10,
        isDefault: i === 0,
      })
      .returning({ id: productSkus.id });
    skuIds.push(sku!.id);
  }
  return { productId: product!.id, skuIds };
}

async function expectDomainError(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, `expected ${code}, got success`).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

// ---------------------------------------------------------------------------
// CR-2-h §1 — 修改规格
// ---------------------------------------------------------------------------

describe('changing a row’s SKU', () => {
  it('moves the units onto the new variant and leaves exactly one row', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct();
    const added = await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 2 });

    const result = await cart.updateItem(
      as(userId),
      { id: added.item!.id },
      {
        skuId: String(skuIds[1]!),
      },
    );

    expect(result.item).toMatchObject({ skuId: String(skuIds[1]), quantity: 2 });
    expect(result.cart).toMatchObject({ items: 1, quantity: 2 });
    const rows = await harness.ctx.db.select().from(cartItems);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.skuId).toBe(skuIds[1]);
  });

  it('folds into a row that already holds the new variant, and answers with the survivor', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct();
    const moving = await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 2 });
    const target = await cart.addItem(as(userId), { skuId: String(skuIds[1]!), quantity: 1 });

    const result = await cart.updateItem(
      as(userId),
      { id: moving.item!.id },
      {
        skuId: String(skuIds[1]!),
      },
    );

    // 2 + 1, one row, and the id that comes back is the target's, not the one
    // that was PATCHed.
    expect(result.item).toMatchObject({ id: target.item!.id, quantity: 3 });
    expect(result.cart).toMatchObject({ items: 1, quantity: 3 });
    expect(await harness.ctx.db.select().from(cartItems)).toHaveLength(1);
  });

  it('re-checks the purchase limit against the merged total, not the moved units', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct({ purchaseLimit: 3 });
    const moving = await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 2 });
    await cart.addItem(as(userId), { skuId: String(skuIds[1]!), quantity: 2 });

    // 2 moved onto 2 already there is 4, past the limit of 3 — even though
    // neither row on its own breaks it.
    await expectDomainError(
      cart.updateItem(as(userId), { id: moving.item!.id }, { skuId: String(skuIds[1]!) }),
      'CART_PURCHASE_LIMIT_REACHED',
    );
    const rows = await harness.ctx.db.select().from(cartItems);
    expect(rows).toHaveLength(2);
  });

  it('re-checks stock on the new variant', async () => {
    const userId = await makeUser();
    const { productId, skuIds } = await makeProduct({ stock: 5 });
    const added = await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 4 });
    await harness.ctx.db
      .update(productSkus)
      .set({ stock: 1 })
      .where(eq(productSkus.id, skuIds[1]!));
    await harness.ctx.db.update(products).set({ stock: 6 }).where(eq(products.id, productId));

    await expectDomainError(
      cart.updateItem(as(userId), { id: added.item!.id }, { skuId: String(skuIds[1]!) }),
      'CART_OUT_OF_STOCK',
    );
    // The old row is still there: nothing was lost on the way.
    const rows = await harness.ctx.db.select().from(cartItems);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.skuId).toBe(skuIds[0]);
  });

  it('refuses a variant that is not for sale, without touching the row', async () => {
    const userId = await makeUser();
    const live = await makeProduct();
    const dead = await makeProduct({ skus: 1 });
    const added = await cart.addItem(as(userId), { skuId: String(live.skuIds[0]!), quantity: 1 });
    await harness.ctx.db
      .update(products)
      .set({ status: 'off_shelf' })
      .where(eq(products.id, dead.productId));

    await expectDomainError(
      cart.updateItem(as(userId), { id: added.item!.id }, { skuId: String(dead.skuIds[0]!) }),
      'CART_SKU_NOT_AVAILABLE',
    );
    expect(await harness.ctx.db.select().from(cartItems)).toHaveLength(1);
  });

  it('takes a new quantity in the same call', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct();
    const added = await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 2 });

    const result = await cart.updateItem(
      as(userId),
      { id: added.item!.id },
      {
        skuId: String(skuIds[1]!),
        quantity: 5,
      },
    );
    expect(result.item).toMatchObject({ skuId: String(skuIds[1]), quantity: 5 });
  });

  it('is a no-op change when the SKU is the one the row already holds', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct();
    const added = await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 2 });

    const result = await cart.updateItem(
      as(userId),
      { id: added.item!.id },
      {
        skuId: String(skuIds[0]!),
        quantity: 3,
      },
    );
    // Same id, so the row kept its place in the list.
    expect(result.item).toMatchObject({ id: added.item!.id, quantity: 3 });
  });

  it('two devices re-speccing the same row: one moves it, the other is told it is gone', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct({ skus: 3, stock: 50 });
    const added = await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 2 });

    const report = await runConcurrently(
      4,
      async (index) => {
        try {
          await cart.updateItem(
            racer(userId),
            { id: added.item!.id },
            {
              skuId: String(skuIds[1 + (index % 2)]!),
            },
          );
          return { won: true };
        } catch (error) {
          if (DomainError.is(error)) return { won: false, code: error.code };
          throw error;
        }
      },
      { isWinner: (outcome) => outcome.won },
    );

    expect(report.winners).toBe(1);
    expect(report.losers).toBe(3);
    // The units were moved once, not four times.
    const rows = await harness.ctx.db.select().from(cartItems);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.quantity).toBe(2);
    expect(rows[0]!.skuId).not.toBe(skuIds[0]);
  });
});

// ---------------------------------------------------------------------------
// CR-2-h §2 — 减少数量 by variant
// ---------------------------------------------------------------------------

describe('decrementing by SKU', () => {
  it('takes units off the row that holds the variant', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct();
    await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 3 });

    const result = await cart.decrementItem(as(userId), { skuId: String(skuIds[0]!), quantity: 1 });
    expect(result.item).toMatchObject({ quantity: 2 });
    expect(result.cart).toMatchObject({ items: 1, quantity: 2 });
  });

  it('removes the row at zero and answers with a null item', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct();
    await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 1 });

    const result = await cart.decrementItem(as(userId), { skuId: String(skuIds[0]!), quantity: 1 });
    expect(result.item).toBeNull();
    expect(result.cart).toEqual({ items: 0, quantity: 0, availableCount: 0, unavailableCount: 0 });
    expect(await harness.ctx.db.select().from(cartItems)).toHaveLength(0);
  });

  it('removes the row when asked for more units than it holds', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct();
    await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 2 });

    const result = await cart.decrementItem(as(userId), { skuId: String(skuIds[0]!), quantity: 9 });
    expect(result.item).toBeNull();
    expect(await harness.ctx.db.select().from(cartItems)).toHaveLength(0);
  });

  it('a variant the cart does not hold is the same 404 as an unknown row id', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct();
    await expectDomainError(
      cart.decrementItem(as(userId), { skuId: String(skuIds[0]!), quantity: 1 }),
      'CART_ITEM_NOT_FOUND',
    );
  });

  it('never touches somebody else’s row', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const { skuIds } = await makeProduct();
    await cart.addItem(as(owner), { skuId: String(skuIds[0]!), quantity: 2 });

    await expectDomainError(
      cart.decrementItem(as(stranger), { skuId: String(skuIds[0]!), quantity: 1 }),
      'CART_ITEM_NOT_FOUND',
    );
    const rows = await harness.ctx.db.select().from(cartItems);
    expect(rows[0]!.quantity).toBe(2);
  });

  it('three taps on a row of three take one unit each and remove it exactly once', async () => {
    const userId = await makeUser();
    const { skuIds } = await makeProduct();
    await cart.addItem(as(userId), { skuId: String(skuIds[0]!), quantity: 3 });

    const report = await runConcurrently(
      5,
      async () => {
        try {
          await cart.decrementItem(racer(userId), { skuId: String(skuIds[0]!), quantity: 1 });
          return { won: true };
        } catch (error) {
          if (DomainError.is(error)) return { won: false, code: error.code };
          throw error;
        }
      },
      { isWinner: (outcome) => outcome.won },
    );

    // Three units, five taps: three callers take one each (the third removes
    // the row) and two are told there is nothing left.
    expect(report.winners).toBe(3);
    expect(report.losers).toBe(2);
    expect(await harness.ctx.db.select().from(cartItems)).toHaveLength(0);
  });
});
