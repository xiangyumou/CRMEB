import type { DiyStorefrontTheme, DiyTheme } from '@shop/contracts/diy/schemas';

import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { versionOf } from './content';
import type { ReadCtx } from './diy-page.service';
import * as repo from './theme.repo';

/**
 * 主题 — the colour tokens the renderer applies globally, plus the factory copy
 * of each decorated surface.
 *
 * Deliberately small: the theme marketplace, download, export and preview-image
 * pipeline are out of scope. What is here is what 一键换色 needs — read the
 * tokens, edit the tokens, switch which theme is active.
 */

function tokensOf(row: repo.ThemeRow): Record<string, unknown> {
  return (row.data?.tokens ?? {}) as Record<string, unknown>;
}

function toWire(row: repo.ThemeRow): DiyTheme {
  return {
    id: String(row.id),
    name: row.name,
    intro: row.intro,
    kind: row.kind,
    isActive: row.isActive,
    tokens: tokensOf(row),
    previewImages: row.previewImages ?? null,
    version: versionOf({ updatedAt: row.updatedAt, content: null }),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listThemes(ctx: Ctx): Promise<{ items: DiyTheme[] }> {
  const rows = await repo.listThemes(ctx.db);
  return { items: rows.map(toWire) };
}

export async function updateTheme(
  ctx: Ctx,
  input: {
    id: string;
    name?: string | undefined;
    intro?: string | null | undefined;
    tokens?: Record<string, unknown> | undefined;
  },
): Promise<DiyTheme> {
  const row = await repo.findTheme(ctx.db, Number(input.id));
  if (!row) throw new DomainError('DIY_THEME_NOT_FOUND');
  // A built-in theme is the thing a broken custom theme is restored *from*.
  if (row.kind === 'built_in') throw new DomainError('DIY_THEME_BUILT_IN_READONLY');

  const patch: repo.ThemePatch = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.intro !== undefined) patch.intro = input.intro ?? null;
  if (input.tokens !== undefined) patch.data = { ...(row.data ?? {}), tokens: input.tokens };

  const next = await repo.updateTheme(ctx.db, row.id, patch, ctx.clock.now());
  if (!next) throw new DomainError('DIY_THEME_NOT_FOUND');
  return toWire(next);
}

export async function activateTheme(ctx: Ctx, input: { id: string }): Promise<DiyTheme> {
  const row = await repo.findTheme(ctx.db, Number(input.id));
  if (!row) throw new DomainError('DIY_THEME_NOT_FOUND');
  const now = ctx.clock.now();
  await ctx.withTx((tx) => repo.activateTheme(tx, row.id, now));
  const next = await repo.findTheme(ctx.db, row.id);
  if (!next) throw new DomainError('DIY_THEME_NOT_FOUND');
  return toWire(next);
}

export async function getActiveTheme(ctx: ReadCtx): Promise<DiyStorefrontTheme> {
  const row = await repo.findActiveTheme(ctx.db);
  if (!row) throw new DomainError('DIY_THEME_NOT_FOUND');
  const payload: DiyStorefrontTheme = {
    id: String(row.id),
    name: row.name,
    tokens: tokensOf(row),
    version: versionOf({ updatedAt: row.updatedAt, content: null }),
  };
  ctx.setHeader?.('ETag', `W/"${payload.version}"`);
  return payload;
}
