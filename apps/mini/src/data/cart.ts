import { queryOptions } from '@tanstack/react-query';
import type { CartCount } from '@shop/contracts/cart/schemas';

/**
 * Placeholder for `GET /api/v1/cart/count` until `packages/api-client` exists (spike S2).
 * The response type comes from the contract, imported as a type only: nothing from
 * `@shop/contracts/cart/schemas` (which is zod) reaches the bundle.
 */
export async function fetchCartCount(): Promise<CartCount> {
  return { items: 3, quantity: 5, availableCount: 3, unavailableCount: 0 };
}

export const cartCountQuery = queryOptions({
  queryKey: ['cart', 'count'] as const,
  queryFn: fetchCartCount,
});
