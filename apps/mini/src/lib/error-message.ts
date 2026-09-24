import { isApiError } from '@shop/api-client';

/**
 * What to tell the shopper about a failed call: the server's own words (an `ApiError` is already
 * Chinese), an `Error`'s message, or `fallback` when there is nothing to say.
 */
export function errorMessage(error: unknown, fallback = '操作失败，请稍后再试'): string {
  if (isApiError(error)) return error.message || fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}
