import type {
  DiyPageContentBody,
  DiyPageCreateBody,
  DiyPageDetail,
  DiyPageSummary,
  DiyPageUpdateBody,
  DiyStorefrontPage,
} from '@shop/contracts/diy/schemas';
import type { DiyPageValue } from '@shop/contracts/diy/schema/page';

import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { cleanDiyData } from './compatibility';
import { invalidateDiyStorefrontCache } from './diy.cache';
import {
  assertProductLimits,
  contentVersionOf,
  countComponents,
  dehydrateDiyContent,
  nextContentVersion,
  validateDiyContent,
  versionOf,
} from './content';
import * as repo from './diy.repo';
import * as themeRepo from './theme.repo';

/**
 * 页面装修 — pages.
 *
 * Two things are load-bearing and everything else follows from them:
 *
 * 1. **The saved envelope is never rewritten.** It is validated, the preview
 *    lists are stripped, and the same object is stored. No normalising, no
 *    key reordering, no defaults — the uni-app renderer is not being rewritten
 *    and reads these bytes as they are.
 * 2. **Retired components and dead links are filtered on read, not on write.**
 *    Exactly what `DiyCompatibilityServices::clean` did, and for the same
 *    reason: the row stays intact, so turning a feature back on is a code
 *    change rather than a data recovery job.
 */

// ---------------------------------------------------------------------------
// envelope
// ---------------------------------------------------------------------------

/**
 * `diy_pages.content` holds the envelope `{ value, version?, orderStatus? }`
 * described by `diyPageContent` in the contracts, not the bare component map:
 * the legacy row had `version` and `order_status` beside the components and an
 * ETL'd page must keep them. Everything outside `value` is carried through
 * untouched, which also makes room for whatever a newer editor adds.
 *
 * A row whose content has no `value` key is read as being the component map
 * itself. That is the shape a hand-seeded or half-migrated row has, and
 * refusing to read it would lock an operator out of their own page.
 */
function valueOf(content: Record<string, unknown> | null): DiyPageValue {
  if (!content) return {};
  const value = content.value;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as DiyPageValue;
  }
  return 'value' in content ? {} : (content as DiyPageValue);
}

function envelopeWith(
  content: Record<string, unknown> | null,
  value: DiyPageValue,
  version?: string,
): Record<string, unknown> {
  // Replacing in place keeps `orderStatus` and any unknown sibling of `value`.
  const base = content && 'value' in content ? { ...content, value } : { value };
  return version === undefined ? base : { ...base, version };
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

function toSummary(row: repo.DiyPageRow): DiyPageSummary {
  return {
    id: String(row.id),
    name: row.name,
    kind: row.kind,
    title: row.title,
    status: row.status,
    isHome: row.isHome,
    componentCount: countComponents(valueOf(row.content)),
    version: versionOf(row),
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: repo.DiyPageRow): DiyPageDetail {
  return {
    ...toSummary(row),
    content: valueOf(row.content),
    schemaVersion: row.schemaVersion,
    background: row.background ?? null,
  };
}

/**
 * The storefront view: cleaned, and without anything only an operator cares
 * about. Exported for `diy-storefront.service.ts`, which answers 个人中心 and
 * 底部导航 off the same rows and must produce the identical envelope.
 */
export function toStorefront(row: repo.DiyPageRow): DiyStorefrontPage {
  return {
    id: String(row.id),
    name: row.name,
    kind: row.kind,
    title: row.title,
    content: cleanDiyData(valueOf(row.content)),
    schemaVersion: row.schemaVersion,
    background: row.background ?? null,
    version: versionOf(row),
  };
}

async function loadPage(ctx: Ctx, id: string): Promise<repo.DiyPageRow> {
  const row = await repo.findPage(ctx.db, Number(id));
  if (!row) throw new DomainError('DIY_PAGE_NOT_FOUND');
  return row;
}

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

export interface DiyPageListInput {
  page: number;
  pageSize: number;
  kind?: DiyPageSummary['kind'] | undefined;
  status?: DiyPageSummary['status'] | undefined;
  keyword?: string | undefined;
  sortBy?: 'updatedAt' | 'createdAt' | 'name' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export async function listPages(
  ctx: Ctx,
  input: DiyPageListInput,
): Promise<{ items: DiyPageSummary[]; total: number; page: number; pageSize: number }> {
  const { items, total } = await repo.listPages(ctx.db, input);
  return { items: items.map(toSummary), total, page: input.page, pageSize: input.pageSize };
}

export async function getPage(ctx: Ctx, input: { id: string }): Promise<DiyPageDetail> {
  return toDetail(await loadPage(ctx, input.id));
}

export async function createPage(ctx: Ctx, input: DiyPageCreateBody): Promise<DiyPageDetail> {
  const row = await repo.insertPage(ctx.db, {
    name: input.name,
    kind: input.kind,
    title: input.title ?? null,
    content: { value: {} },
    now: ctx.clock.now(),
  });
  return toDetail(row);
}

export async function updatePage(
  ctx: Ctx,
  input: { id: string } & DiyPageUpdateBody,
): Promise<DiyPageDetail> {
  const row = await loadPage(ctx, input.id);
  const patch: repo.DiyPagePatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.title !== undefined) patch.title = input.title ?? null;
  if (input.background !== undefined) {
    patch.background = (input.background ?? null) as repo.DiyPageBackground | null;
  }
  const next = await repo.updatePage(ctx.db, row.id, patch, ctx.clock.now());
  if (!next) throw new DomainError('DIY_PAGE_NOT_FOUND');
  await invalidateDiyStorefrontCache(ctx);
  return toDetail(next);
}

/**
 * The editor's save.
 *
 * Order matters: validate first (so a broken payload never reaches the row),
 * then the product-count guard (the legacy message the operator knows), then
 * strip the hydrated preview lists, and only then write — guarded on the
 * version the editor loaded.
 */
export async function savePageContent(
  ctx: Ctx,
  input: { id: string } & DiyPageContentBody,
): Promise<DiyPageDetail> {
  const row = await loadPage(ctx, input.id);
  if (input.version !== undefined && input.version !== versionOf(row)) {
    throw new DomainError('DIY_VERSION_CONFLICT', {
      details: { current: versionOf(row), submitted: input.version },
    });
  }

  const value = validateDiyContent(input.content);
  assertProductLimits(value);
  const stored = dehydrateDiyContent(value);

  const now = ctx.clock.now();
  const patch: repo.DiyPagePatch = {
    content: envelopeWith(row.content, stored, nextContentVersion(now)),
  };
  if (input.publish) {
    patch.status = 'published';
    patch.publishedAt = now;
  }
  const next = await repo.updatePage(ctx.db, row.id, patch, now, {
    updatedAt: row.updatedAt,
    contentVersion: contentVersionOf(row.content),
  });
  if (!next) {
    // The guard failed, so somebody else saved between the read and the write.
    throw new DomainError('DIY_VERSION_CONFLICT', { details: { current: null } });
  }
  // 底部导航 and 个人中心 are cached reads off these rows (CR-3-h2); an operator
  // who saves must see the change in the app now, not within the minute.
  await invalidateDiyStorefrontCache(ctx);
  return toDetail(next);
}

export async function publishPage(ctx: Ctx, input: { id: string }): Promise<DiyPageDetail> {
  const row = await loadPage(ctx, input.id);
  // Publishing an unparseable page would put a broken storefront live; the
  // editor cannot produce one, an import can.
  validateDiyContent(valueOf(row.content));
  const now = ctx.clock.now();
  const next = await repo.updatePage(
    ctx.db,
    row.id,
    { status: 'published', publishedAt: now },
    now,
  );
  if (!next) throw new DomainError('DIY_PAGE_NOT_FOUND');
  await invalidateDiyStorefrontCache(ctx);
  return toDetail(next);
}

/** Legacy `set_status`: 使用该模板. */
export async function setHomePage(ctx: Ctx, input: { id: string }): Promise<DiyPageDetail> {
  const row = await loadPage(ctx, input.id);
  if (row.kind !== 'home') throw new DomainError('DIY_HOME_KIND_MISMATCH');
  const now = ctx.clock.now();
  await ctx.withTx(async (tx) => {
    await repo.setHomePage(tx, row.id, now);
    // A page nobody can see is not "in use"; the legacy admin published and
    // switched in one click, so do the same.
    if (row.status !== 'published') {
      await repo.updatePage(tx, row.id, { status: 'published', publishedAt: now }, now);
    }
  });
  await invalidateDiyStorefrontCache(ctx);
  return toDetail(await loadPage(ctx, input.id));
}

export async function deletePage(ctx: Ctx, input: { id: string }): Promise<{ ok: true }> {
  const row = await loadPage(ctx, input.id);
  // `DiyServices::del` refused id 1 — the 首页模板 — and any row with
  // `status = 1`. The new schema says the same thing in its own vocabulary.
  if (row.isHome) throw new DomainError('DIY_PAGE_UNDELETABLE');
  const ok = await repo.softDeletePage(ctx.db, row.id, ctx.clock.now());
  if (!ok) throw new DomainError('DIY_PAGE_NOT_FOUND');
  await invalidateDiyStorefrontCache(ctx);
  return { ok: true };
}

export async function copyPage(
  ctx: Ctx,
  input: { id: string; name?: string | undefined },
): Promise<DiyPageDetail> {
  const row = await loadPage(ctx, input.id);
  const copy = await repo.insertPage(ctx.db, {
    name: input.name ?? `${row.name} 副本`,
    kind: row.kind,
    title: row.title,
    // The envelope is copied verbatim, including any key this build does not
    // know about. A copy that quietly dropped something would be a trap.
    content: row.content ?? { value: {} },
    background: row.background,
    now: ctx.clock.now(),
  });
  return toDetail(copy);
}

// ---------------------------------------------------------------------------
// factory defaults
// ---------------------------------------------------------------------------

function surfaceOf(kind: repo.DiyPageKindValue): themeRepo.ThemeSurface | null {
  return themeRepo.THEME_SURFACE_BY_KIND[kind];
}

/**
 * Legacy `recovery`: put the page back to its factory content.
 *
 * `eb_diy.default_value` held a per-row snapshot. The new schema keeps the
 * factory copy on the active theme instead (`themes.default_data`, one blob per
 * surface), so a restore reads from there. 微页面 has no surface of its own and
 * therefore no factory copy — which is correct, since every 微页面 is bespoke.
 */
export async function restorePageDefault(ctx: Ctx, input: { id: string }): Promise<DiyPageDetail> {
  const row = await loadPage(ctx, input.id);
  const surface = surfaceOf(row.kind);
  if (!surface) throw new DomainError('DIY_NO_DEFAULT_CONTENT');

  const theme = await themeRepo.findActiveTheme(ctx.db);
  const fallback = theme?.defaultData?.[surface] ?? theme?.data?.[surface];
  if (!fallback) throw new DomainError('DIY_NO_DEFAULT_CONTENT');

  const value = validateDiyContent(valueOf(fallback as Record<string, unknown>));
  const now = ctx.clock.now();
  const next = await repo.updatePage(
    ctx.db,
    row.id,
    { content: envelopeWith(row.content, value, nextContentVersion(now)) },
    now,
  );
  if (!next) throw new DomainError('DIY_PAGE_NOT_FOUND');
  await invalidateDiyStorefrontCache(ctx);
  return toDetail(next);
}

/** Legacy `set_recovery`: 把当前内容存成默认数据. */
export async function savePageAsDefault(ctx: Ctx, input: { id: string }): Promise<{ ok: true }> {
  const row = await loadPage(ctx, input.id);
  const surface = surfaceOf(row.kind);
  if (!surface) throw new DomainError('DIY_NO_DEFAULT_CONTENT');

  const theme = await themeRepo.findActiveTheme(ctx.db);
  if (!theme) throw new DomainError('DIY_THEME_NOT_FOUND');

  const defaultData = { ...(theme.defaultData ?? {}), [surface]: { value: valueOf(row.content) } };
  await themeRepo.updateTheme(ctx.db, theme.id, { defaultData }, ctx.clock.now());
  return { ok: true };
}

// ---------------------------------------------------------------------------
// storefront
// ---------------------------------------------------------------------------

/** `setHeader` is present when the call came through `handle()`, absent in jobs and tests. */
export type ReadCtx = Ctx & { setHeader?: (name: string, value: string) => void };

function tagged<T extends { version: string }>(ctx: ReadCtx, payload: T): T {
  // A weak validator: the body is semantically the same page, but the JSON is
  // regenerated per request, so a byte-comparison would be wrong.
  ctx.setHeader?.('ETag', `W/"${payload.version}"`);
  ctx.setHeader?.('Cache-Control', 'no-cache');
  return payload;
}

export async function getHomePage(ctx: ReadCtx): Promise<DiyStorefrontPage> {
  const row = await repo.findHomePage(ctx.db);
  if (!row) throw new DomainError('DIY_HOME_PAGE_MISSING');
  return tagged(ctx, toStorefront(row));
}

export async function getStorefrontPage(
  ctx: ReadCtx,
  input: { id: string },
): Promise<DiyStorefrontPage> {
  const row = await repo.findPage(ctx.db, Number(input.id));
  // A draft is invisible to shoppers; saying "not found" is also the honest
  // answer to a guessed id.
  if (!row || row.status !== 'published') throw new DomainError('DIY_PAGE_NOT_FOUND');
  return tagged(ctx, toStorefront(row));
}

/**
 * The cheap poll the app makes on resume, in place of re-downloading a page
 * that rarely changes. Legacy `get_diy_version`.
 */
export async function getPageVersion(
  ctx: Ctx,
  input: { id?: string | undefined },
): Promise<{ version: string }> {
  if (input.id) {
    const row = await repo.findPage(ctx.db, Number(input.id));
    if (!row || row.status !== 'published') throw new DomainError('DIY_PAGE_NOT_FOUND');
    return { version: versionOf(row) };
  }
  const home = await repo.findHomePage(ctx.db);
  if (!home) throw new DomainError('DIY_HOME_PAGE_MISSING');
  return { version: versionOf(home) };
}
