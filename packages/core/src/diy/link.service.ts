import type { DiyLink, DiyLinkBody, DiyLinkCategory } from '@shop/contracts/diy/schemas';
import { isRemovedStorefrontPage } from '@shop/contracts/diy/removed';

import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import * as repo from './link.repo';

/**
 * The link registry: the storefront routes an operator may point a decorated
 * component at. It is admin data rather than a constant because the uni-app
 * route table changes on its own schedule.
 *
 * Reads hide the retired pages. A link row pointing at
 * `pages/points_mall/index` may still exist, but offering it in the picker
 * would let an operator create the exact dead link that `cleanDiyData` then
 * strips on the way out.
 */

function toWire(row: repo.PageLinkRow): DiyLink {
  return {
    id: String(row.id),
    categoryId: row.categoryId === null ? null : String(row.categoryId),
    name: row.name,
    url: row.url,
    paramName: row.paramName,
    example: row.example,
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder,
  };
}

function toCategoryWire(row: repo.PageLinkCategoryRow): DiyLinkCategory {
  return {
    id: String(row.id),
    parentId: row.parentId === null ? null : String(row.parentId),
    name: row.name,
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder,
  };
}

export async function listLinkCategories(ctx: Ctx): Promise<{ items: DiyLinkCategory[] }> {
  const rows = await repo.listCategories(ctx.db);
  return { items: rows.filter((row) => row.isEnabled).map(toCategoryWire) };
}

export async function listLinks(
  ctx: Ctx,
  input: {
    categoryId?: string | undefined;
    keyword?: string | undefined;
    includeDisabled?: boolean | undefined;
  },
): Promise<{ items: DiyLink[] }> {
  const rows = await repo.listLinks(ctx.db, {
    categoryId: input.categoryId === undefined ? undefined : Number(input.categoryId),
    keyword: input.keyword,
    includeDisabled: input.includeDisabled,
  });
  return { items: rows.filter((row) => !isRemovedStorefrontPage(row.url)).map(toWire) };
}

async function assertCategory(ctx: Ctx, categoryId: string | null | undefined): Promise<void> {
  if (categoryId === undefined || categoryId === null) return;
  const category = await repo.findCategory(ctx.db, Number(categoryId));
  if (!category) throw new DomainError('DIY_LINK_CATEGORY_NOT_FOUND');
}

export async function createLink(ctx: Ctx, input: DiyLinkBody): Promise<DiyLink> {
  await assertCategory(ctx, input.categoryId);
  // `page_links_url_uq` would raise a 500 on its own; the operator gets told
  // which constraint they tripped instead.
  if (await repo.findLinkByUrl(ctx.db, input.url)) throw new DomainError('DIY_LINK_URL_EXISTS');
  const now = ctx.clock.now();
  const row = await repo.insertLink(ctx.db, {
    categoryId:
      input.categoryId === undefined || input.categoryId === null ? null : Number(input.categoryId),
    name: input.name,
    url: input.url,
    paramName: input.paramName ?? null,
    example: input.example ?? null,
    isEnabled: input.isEnabled ?? true,
    sortOrder: input.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
  });
  return toWire(row);
}

/**
 * Every field optional *and* explicitly `| undefined`: under
 * `exactOptionalPropertyTypes`, `Partial<DiyLinkBody>` would refuse the object
 * `handle()` builds, whose absent keys are present-and-undefined.
 */
export interface DiyLinkUpdateInput {
  id: string;
  categoryId?: string | null | undefined;
  name?: string | undefined;
  url?: string | undefined;
  paramName?: string | null | undefined;
  example?: string | null | undefined;
  isEnabled?: boolean | undefined;
  sortOrder?: number | undefined;
}

export async function updateLink(ctx: Ctx, input: DiyLinkUpdateInput): Promise<DiyLink> {
  const existing = await repo.findLink(ctx.db, Number(input.id));
  if (!existing) throw new DomainError('DIY_LINK_NOT_FOUND');
  await assertCategory(ctx, input.categoryId);
  if (input.url !== undefined && input.url !== existing.url) {
    const clash = await repo.findLinkByUrl(ctx.db, input.url);
    if (clash) throw new DomainError('DIY_LINK_URL_EXISTS');
  }

  const patch: Parameters<typeof repo.updateLink>[2] = {};
  if (input.categoryId !== undefined) {
    patch.categoryId = input.categoryId === null ? null : Number(input.categoryId);
  }
  if (input.name !== undefined) patch.name = input.name;
  if (input.url !== undefined) patch.url = input.url;
  if (input.paramName !== undefined) patch.paramName = input.paramName ?? null;
  if (input.example !== undefined) patch.example = input.example ?? null;
  if (input.isEnabled !== undefined) patch.isEnabled = input.isEnabled;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

  const next = await repo.updateLink(ctx.db, existing.id, patch, ctx.clock.now());
  if (!next) throw new DomainError('DIY_LINK_NOT_FOUND');
  return toWire(next);
}

export async function deleteLink(ctx: Ctx, input: { id: string }): Promise<{ ok: true }> {
  const ok = await repo.deleteLink(ctx.db, Number(input.id));
  if (!ok) throw new DomainError('DIY_LINK_NOT_FOUND');
  return { ok: true };
}
