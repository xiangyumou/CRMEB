import { z } from 'zod';

/** Primary keys are bigint identity columns, carried on the wire as decimal strings. */
export const id = z.string().regex(/^[1-9]\d*$/, 'id 格式不正确');

/**
 * A list of ids in a query string: a comma list or the key repeated. At most
 * 100, one full page.
 *
 * `?ids=12,7,31`, `?ids=12&ids=7` and the two mixed all parse to one array,
 * in the order given.
 */
export const idList = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : [value])
      .flatMap((part) => part.split(','))
      .map((part) => part.trim())
      .filter((part) => part !== ''),
  )
  .pipe(z.array(id).min(1).max(100));

/**
 * Money is a decimal string with exactly two fraction digits ("12.00"), never a JS number.
 * Stored as numeric(12,2); the domain works in integer fen through `Money` in core/kernel.
 */
export const money = z.string().regex(/^(0|[1-9]\d{0,9})\.\d{2}$/, '金额格式不正确');

/** Instants are ISO-8601 with offset. Stored as timestamptz. */
export const instant = z.iso.datetime({ offset: true });

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof pageQuery>;

export function paged<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });
}

/**
 * Sortable lists take `sortBy` + `sortOrder`; merge into the list query with `.extend(...)`.
 * The admin `CrudTable` sends exactly these two keys.
 */
export function sortQuery<const K extends readonly [string, ...string[]]>(keys: K) {
  return z.object({
    sortBy: z.enum(keys).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  });
}

/** Which storefront client is calling; sent as the `X-Client-Platform` header. */
export const clientPlatform = z.enum(['h5', 'wechat-oa', 'wechat-mini']);
export type ClientPlatform = z.infer<typeof clientPlatform>;

/** A stored file as clients see it. `url` is absolute or site-relative and directly renderable. */
export const asset = z.object({
  id,
  url: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number().int().min(0),
});
