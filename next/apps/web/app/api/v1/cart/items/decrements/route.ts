import { cartDecrementItem } from '@shop/contracts/cart/cart.storefront.contract';
import * as cart from '@shop/core/cart';
import { handle } from '../../../../../../src/server';

/** `/api/v1/cart/items/decrements` — 减少数量, by variant rather than by row. */
export const POST = handle(cartDecrementItem, (ctx, { body }) => cart.decrementItem(ctx, body));

export const dynamic = 'force-dynamic';
