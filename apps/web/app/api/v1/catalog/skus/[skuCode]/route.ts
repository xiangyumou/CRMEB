import { catalogSkuPrice } from '@shop/contracts/catalog/catalog.storefront.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../../src/server';

/**
 * `/api/v1/catalog/skus/:skuCode` — the price and stock of one variant.
 *
 * Keyed by the opaque `skuCode` rather than the numeric id, because that is
 * what travels on cart rows and order items.
 */

export const GET = handle(catalogSkuPrice, (ctx, { params }) => catalog.skuPrice(ctx, params));

export const dynamic = 'force-dynamic';
