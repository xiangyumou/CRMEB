import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { decorBlocks } from '@shop/contracts/decor/all-blocks';
import { blockProps } from '@shop/contracts/decor/base';
import { USER_CENTER_DEFAULT_VERSION } from '@shop/contracts/decor/defaults';
import { createBlockRegistry, defineBlock } from '@shop/contracts/decor/registry';
import { articleSource, couponSource, need } from '@shop/contracts/decor/sources';
import {
  productCategories,
  productCategoriesMap,
  productLabelCategories,
  productLabels,
  productLabelsMap,
  products,
} from '@shop/db/schema/catalog';
import { articles } from '@shop/db/schema/cms';
import { couponTemplates } from '@shop/db/schema/coupon';
import { decorDocuments, decorRevisions } from '@shop/db/schema/decor';
import { users } from '@shop/db/schema/user';
import { createTestCtx, forkTestCtx, type TestCtx } from '@shop/testing';
import * as coupon from '../coupon';
import { anonymousActor, type Actor, type Ctx } from '../kernel/context';
import * as decor from './index';

/**
 * 页面装修 v2, against real PostgreSQL and Redis: the admin side (documents,
 * drafts, revisions, designations, preview tokens) and the storefront
 * resolver (visibility of data, cache, per-request filtering, per-shopper
 * state). The races are in `decor.concurrency.int.test.ts`.
 */

let harness: TestCtx;
let ctx: Ctx;

const NOW = '2026-06-01T00:00:00.000Z';
const admin: Actor = { kind: 'admin', id: 1, permissions: [], isSuper: true };
const shopper = (id: number): Actor => ({ kind: 'user', id, permissions: [], isSuper: false });

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW, actor: admin });
  ctx = harness.ctx;
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  await harness.redis.flushdb();
  harness.clock.set(NOW);
});

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const anonymous = () => harness.as(anonymousActor);
const NO_CLIENT = { clientVersion: null } as const;

function doc(blocks: unknown[], title = '测试页') {
  return {
    schemaVersion: 2 as const,
    root: { props: { title, background: '#f5f5f5', shareEnabled: true, shareTitle: '' } },
    blocks: blocks as { id: string; type: string; v: number; props: Record<string, unknown> }[],
  };
}

const grid = (id: string, source: unknown, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'productGrid',
  v: 1,
  props: { source, ...extra },
});

const carousel = (id: string, slides: unknown[]) => ({
  id,
  type: 'carousel',
  v: 1,
  props: { slides },
});

const slide = { image: 'https://cdn.example.com/banner.jpg' };

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
  throw new Error('expected a DomainError, got success');
}

let sequence = 0;

async function product(
  values: Partial<typeof products.$inferInsert> = {},
  links: { categoryId?: number; labelId?: number } = {},
): Promise<string> {
  sequence += 1;
  const [row] = await ctx.db
    .insert(products)
    .values({
      name: `商品${sequence}`,
      status: 'on_shelf',
      imageUrl: 'https://cdn.example.com/p.jpg',
      price: '60.00',
      stock: 50,
      freightMode: 'free',
      unitName: '件',
      ...values,
    })
    .returning({ id: products.id });
  if (links.categoryId !== undefined) {
    await ctx.db
      .insert(productCategoriesMap)
      .values({ productId: row!.id, categoryId: links.categoryId });
  }
  if (links.labelId !== undefined) {
    await ctx.db.insert(productLabelsMap).values({ productId: row!.id, labelId: links.labelId });
  }
  return String(row!.id);
}

async function productCategory(name: string): Promise<number> {
  const [row] = await ctx.db
    .insert(productCategories)
    .values({ name, path: '/', level: 0 })
    .returning({ id: productCategories.id });
  return row!.id;
}

async function productLabel(name: string): Promise<number> {
  const [group] = await ctx.db
    .insert(productLabelCategories)
    .values({ name: `${name}组` })
    .returning({ id: productLabelCategories.id });
  const [row] = await ctx.db
    .insert(productLabels)
    .values({ categoryId: group!.id, name, isEnabled: true })
    .returning({ id: productLabels.id });
  return row!.id;
}

async function template(
  values: Partial<typeof couponTemplates.$inferInsert> = {},
): Promise<string> {
  sequence += 1;
  const [row] = await ctx.db
    .insert(couponTemplates)
    .values({
      name: `券${sequence}`,
      scope: 'all_products',
      claimMode: 'manual',
      status: 'active',
      discountAmount: '10.00',
      minSpend: '100.00',
      validityMode: 'days_after_claim',
      validDays: 30,
      isUnlimitedSupply: false,
      totalCount: 100,
      remainingCount: 100,
      perUserLimit: 1,
      ...values,
    })
    .returning({ id: couponTemplates.id });
  return String(row!.id);
}

async function article(values: Partial<typeof articles.$inferInsert> = {}): Promise<string> {
  sequence += 1;
  const [row] = await ctx.db
    .insert(articles)
    .values({
      title: `文章${sequence}`,
      status: 'published',
      publishedAt: new Date('2026-05-01T00:00:00.000Z'),
      ...values,
    })
    .returning({ id: articles.id });
  return String(row!.id);
}

async function user(account: string): Promise<number> {
  const [row] = await ctx.db.insert(users).values({ account }).returning({ id: users.id });
  return row!.id;
}

/** Creates a document, saves `blocks` as its draft and returns it (unpublished). */
async function drafted(
  kind: 'home' | 'user_center' | 'custom',
  blocks: unknown[],
  name = '页面',
): Promise<{ id: string; version: string }> {
  const created = await decor.createDocument(ctx, { kind, name });
  const saved = await decor.saveDraft(ctx, {
    id: created.id,
    document: doc(blocks),
    version: created.draftVersion,
  });
  return { id: created.id, version: saved.version };
}

/** A published document; designated when `designation` is given. */
async function live(
  kind: 'home' | 'user_center' | 'custom',
  blocks: unknown[],
  designation?: 'home' | 'user_center',
): Promise<string> {
  const { id } = await drafted(kind, blocks);
  await decor.publish(ctx, { id, note: '' });
  if (designation) await decor.designate(ctx, { designation, documentId: id });
  return id;
}

async function revisionCount(documentId: string): Promise<number> {
  const rows = await ctx.db
    .select({ id: decorRevisions.id })
    .from(decorRevisions)
    .where(eq(decorRevisions.documentId, Number(documentId)));
  return rows.length;
}

// ---------------------------------------------------------------------------
// documents and drafts
// ---------------------------------------------------------------------------

describe('decor documents — DECOR-003', () => {
  it('DECOR-003: a new page starts empty and titled after its name; a new 个人中心 starts from the built-in one', async () => {
    const page = await decor.createDocument(ctx, { kind: 'custom', name: '618 活动页' });
    expect(page.draft.blocks).toEqual([]);
    expect(page.draft.root.props.title).toBe('618 活动页');
    expect(page.draftVersion).toBe('1');
    expect(page.published).toBeNull();
    expect(page.hasUnpublishedChanges).toBe(true);

    const center = await decor.createDocument(ctx, { kind: 'user_center', name: '个人中心' });
    expect(center.draft.blocks.map((block) => block.type)).toEqual([
      'userCard',
      'orderEntry',
      'serviceGrid',
    ]);
    expect(center.issues).toEqual([]);
  });

  it('DECOR-003: a draft with content issues is saved and the issues reported; a broken envelope is refused', async () => {
    const created = await decor.createDocument(ctx, { kind: 'home', name: '首页' });
    const saved = await decor.saveDraft(ctx, {
      id: created.id,
      document: doc([carousel('banner', [])]),
      version: created.draftVersion,
    });
    expect(saved.version).toBe('2');
    expect(saved.issues.map((issue) => issue.path)).toContain('blocks.0.props.slides');

    const reread = await decor.getDocument(ctx, { id: created.id });
    expect(reread.draft.blocks).toHaveLength(1);
    expect(reread.issues).toEqual(saved.issues);

    expect(
      await codeOf(
        decor.saveDraft(ctx, {
          id: created.id,
          document: { schemaVersion: 1, root: { props: {} }, blocks: [] },
          version: saved.version,
        }),
      ),
    ).toBe('DECOR_DOCUMENT_INVALID');
    // The refused save changed nothing.
    expect((await decor.getDocument(ctx, { id: created.id })).draftVersion).toBe('2');
  });

  it('DECOR-003: an unknown block type is kept as it came, with a warning', async () => {
    const future = { id: 'f1', type: 'liveStream', v: 3, props: { roomId: 'abc' } };
    const created = await decor.createDocument(ctx, { kind: 'custom', name: '页' });
    const saved = await decor.saveDraft(ctx, {
      id: created.id,
      document: doc([future]),
      version: created.draftVersion,
    });
    expect(saved.warnings.map((warning) => warning.path)).toContain('blocks.0.type');
    expect(saved.issues.map((issue) => issue.path)).toContain('blocks.0.type');
    const reread = await decor.getDocument(ctx, { id: created.id });
    expect(reread.draft.blocks[0]).toEqual(future);
  });

  it('DECOR-003: a known block is stored migrated, with its defaults filled in', async () => {
    const { id } = await drafted('custom', [grid('g', { mode: 'manual', ids: [] })]);
    const reread = await decor.getDocument(ctx, { id });
    expect(reread.draft.blocks[0]!.props).toMatchObject({
      titleLines: 2,
      style: { marginY: 'none' },
      visibility: { audience: 'all', platforms: [] },
    });
  });

  it('DECOR-003: lists, renames, duplicates and soft-deletes documents', async () => {
    const a = await decor.createDocument(ctx, { kind: 'custom', name: '甲页' });
    await decor.createDocument(ctx, { kind: 'home', name: '乙首页' });

    const customs = await decor.listDocuments(ctx, { page: 1, pageSize: 20, kind: 'custom' });
    expect(customs.items.map((item) => item.name)).toEqual(['甲页']);
    const byKeyword = await decor.listDocuments(ctx, { page: 1, pageSize: 20, keyword: '首' });
    expect(byKeyword.total).toBe(1);

    const renamed = await decor.renameDocument(ctx, { id: a.id, name: '甲页改' });
    expect(renamed.name).toBe('甲页改');

    const copy = await decor.duplicateDocument(ctx, { id: a.id });
    expect(copy.name).toBe('甲页改 副本');
    expect(copy.kind).toBe('custom');
    expect(copy.published).toBeNull();
    expect(copy.draft).toEqual(a.draft);

    await decor.deleteDocument(ctx, { id: a.id });
    expect(await codeOf(decor.getDocument(ctx, { id: a.id }))).toBe('DECOR_DOCUMENT_NOT_FOUND');
    expect(await codeOf(decor.deleteDocument(ctx, { id: a.id }))).toBe('DECOR_DOCUMENT_NOT_FOUND');
    expect((await decor.listDocuments(ctx, { page: 1, pageSize: 20 })).total).toBe(2);
  });
});

describe('draft saves — DECOR-010', () => {
  it('DECOR-010: a save on a stale version is refused with the current version, and changes nothing', async () => {
    const { id, version } = await drafted('custom', []);
    const stale = String(Number(version) - 1);
    const error = await decor
      .saveDraft(ctx, { id, document: doc([carousel('b', [slide])]), version: stale })
      .catch((caught: unknown) => caught as { code: string; details: unknown });
    expect(error).toMatchObject({ code: 'DECOR_VERSION_CONFLICT', details: { version } });
    const reread = await decor.getDocument(ctx, { id });
    expect(reread.draftVersion).toBe(version);
    expect(reread.draft.blocks).toEqual([]);
  });

  it('DECOR-010: a save on a deleted document is not found, not a conflict', async () => {
    const { id, version } = await drafted('custom', []);
    await decor.deleteDocument(ctx, { id });
    expect(await codeOf(decor.saveDraft(ctx, { id, document: doc([]), version }))).toBe(
      'DECOR_DOCUMENT_NOT_FOUND',
    );
  });
});

describe('references — DECOR-004', () => {
  it('DECOR-004: a record the shopper cannot see is a warning on save, never an error', async () => {
    const onShelf = await product();
    const offShelf = await product({ status: 'off_shelf' });
    const created = await decor.createDocument(ctx, { kind: 'custom', name: '页' });
    const saved = await decor.saveDraft(ctx, {
      id: created.id,
      document: doc([
        grid('g', { mode: 'manual', ids: [onShelf, offShelf] }),
        carousel('c', [{ ...slide, link: { kind: 'page', id: '999' } }]),
      ]),
      version: created.draftVersion,
    });
    expect(saved.issues).toEqual([]);
    expect(saved.warnings.map((warning) => warning.path).sort()).toEqual(
      ['blocks.0.props.source.ids.1', 'blocks.1.props.slides.0.link'].sort(),
    );
    // Warnings do not block publishing.
    const published = await decor.publish(ctx, { id: created.id, note: '' });
    expect(published.revision.number).toBe(1);
    expect(published.warnings).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// publishing, revisions, rollback
// ---------------------------------------------------------------------------

describe('publishing — DECOR-007', () => {
  it('DECOR-007: publish writes revision 1 and moves the live pointer; the same draft again is nothing to publish', async () => {
    const { id, version } = await drafted('custom', [carousel('b', [slide])]);
    const published = await decor.publish(ctx, { id, version, note: '首发' });
    expect(published.revision).toMatchObject({ number: 1, note: '首发', authorAdminId: '1' });
    expect(published.document.published?.number).toBe(1);
    expect(published.document.hasUnpublishedChanges).toBe(false);

    expect(await codeOf(decor.publish(ctx, { id, note: '' }))).toBe('DECOR_NOTHING_TO_PUBLISH');
    expect(await revisionCount(id)).toBe(1);

    const saved = await decor.saveDraft(ctx, {
      id,
      document: doc([carousel('b', [slide, slide])]),
      version,
    });
    expect((await decor.getDocument(ctx, { id })).hasUnpublishedChanges).toBe(true);
    const second = await decor.publish(ctx, { id, version: saved.version, note: '' });
    expect(second.revision.number).toBe(2);
    const revisions = await decor.listRevisions(ctx, { id });
    expect(revisions.items.map((item) => item.number)).toEqual([2, 1]);
  });

  it('DECOR-007: a draft with issues is not published, and nothing is written', async () => {
    const { id } = await drafted('custom', [carousel('b', [])]);
    const error = (await decor.publish(ctx, { id, note: '' }).then(
      () => null,
      (caught: unknown) => caught,
    )) as { code: string; details: { issues: unknown[] } };
    expect(error.code).toBe('DECOR_DOCUMENT_INVALID');
    expect(error.details.issues.length).toBeGreaterThan(0);
    expect(await revisionCount(id)).toBe(0);
    expect((await decor.getDocument(ctx, { id })).published).toBeNull();
  });

  it('DECOR-007: a block not allowed on the page kind blocks publishing', async () => {
    const { id } = await drafted('home', [{ id: 'u', type: 'userCard', v: 1, props: {} }]);
    expect(await codeOf(decor.publish(ctx, { id, note: '' }))).toBe('DECOR_DOCUMENT_INVALID');
  });

  it('DECOR-007: publishing a version other than the draft is a conflict', async () => {
    const { id, version } = await drafted('custom', []);
    expect(
      await codeOf(decor.publish(ctx, { id, version: String(Number(version) + 1), note: '' })),
    ).toBe('DECOR_VERSION_CONFLICT');
    expect(await revisionCount(id)).toBe(0);
  });
});

describe('revisions — DECOR-006', () => {
  it('DECOR-006: the database refuses to update or delete a revision', async () => {
    const id = await live('custom', []);
    const pool = harness.db.handle.pool;
    await expect(pool.query(`update decor_revisions set note = 'x'`)).rejects.toMatchObject({
      code: '23001',
    });
    await expect(pool.query(`delete from decor_revisions`)).rejects.toMatchObject({
      code: '23001',
    });
    expect(await revisionCount(id)).toBe(1);
  });

  it('DECOR-006: a revision is read back exactly as published', async () => {
    const id = await live('custom', [carousel('b', [slide])]);
    const revision = await decor.getRevision(ctx, { id, number: 1 });
    expect(revision.content.blocks.map((block) => block.id)).toEqual(['b']);
    expect(await codeOf(decor.getRevision(ctx, { id, number: 2 }))).toBe(
      'DECOR_REVISION_NOT_FOUND',
    );
  });
});

describe('rollback — DECOR-011', () => {
  it('DECOR-011: rollback republishes old content as a new revision and leaves the draft alone', async () => {
    const { id, version } = await drafted('custom', [carousel('one', [slide])]);
    await decor.publish(ctx, { id, note: '' });
    const saved = await decor.saveDraft(ctx, {
      id,
      document: doc([carousel('two', [slide])]),
      version,
    });
    await decor.publish(ctx, { id, note: '' });

    const rolled = await decor.rollback(ctx, { id, number: 1, note: '回滚' });
    expect(rolled.revision).toMatchObject({ number: 3, restoredFrom: 1, note: '回滚' });
    expect(rolled.document.published?.number).toBe(3);
    // The draft still holds revision 2's content, now unpublished.
    expect(rolled.document.hasUnpublishedChanges).toBe(true);
    const detail = await decor.getDocument(ctx, { id });
    expect(detail.draftVersion).toBe(saved.version);
    expect(detail.draft.blocks.map((block) => block.id)).toEqual(['two']);

    const restored = await decor.getRevision(ctx, { id, number: 3 });
    const original = await decor.getRevision(ctx, { id, number: 1 });
    expect(restored.content).toEqual(original.content);
    expect(await revisionCount(id)).toBe(3);

    // The draft is unpublished again, so publishing it is allowed.
    expect((await decor.publish(ctx, { id, note: '' })).revision.number).toBe(4);
  });

  it('DECOR-011: rolling back to a revision that does not exist writes nothing', async () => {
    const id = await live('custom', []);
    expect(await codeOf(decor.rollback(ctx, { id, number: 7, note: '' }))).toBe(
      'DECOR_REVISION_NOT_FOUND',
    );
    expect(await revisionCount(id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// designations and deletion
// ---------------------------------------------------------------------------

describe('designations — DECOR-008', () => {
  it('DECOR-008: only a published document of the matching kind can be designated', async () => {
    const custom = await live('custom', []);
    expect(await codeOf(decor.designate(ctx, { designation: 'home', documentId: custom }))).toBe(
      'DECOR_KIND_MISMATCH',
    );
    const unpublished = await drafted('home', []);
    expect(
      await codeOf(decor.designate(ctx, { designation: 'home', documentId: unpublished.id })),
    ).toBe('DECOR_NOT_PUBLISHED');
    expect(await codeOf(decor.designate(ctx, { designation: 'home', documentId: '999' }))).toBe(
      'DECOR_DOCUMENT_NOT_FOUND',
    );
    expect(await decor.getDesignations(ctx)).toEqual({ home: null, user_center: null });
  });

  it('DECOR-008: designating another document moves the designation; null clears it', async () => {
    const first = await live('home', [], 'home');
    const second = await live('home', []);
    expect((await decor.getDesignations(ctx)).home?.id).toBe(first);

    const moved = await decor.designate(ctx, { designation: 'home', documentId: second });
    expect(moved.home?.id).toBe(second);
    expect(moved.home?.designation).toBe('home');
    expect((await decor.getDocument(ctx, { id: first })).designation).toBeNull();

    // Designating the current one again is a no-op.
    expect((await decor.designate(ctx, { designation: 'home', documentId: second })).home?.id).toBe(
      second,
    );

    const cleared = await decor.designate(ctx, { designation: 'home', documentId: null });
    expect(cleared.home).toBeNull();
    const rows = await ctx.db
      .select({ id: decorDocuments.id })
      .from(decorDocuments)
      .where(eq(decorDocuments.designation, 'home'));
    expect(rows).toEqual([]);
  });

  it('DECOR-008: the database allows one document per designation', async () => {
    await live('home', [], 'home');
    const other = await live('home', []);
    await expect(
      ctx.db
        .update(decorDocuments)
        .set({ designation: 'home' })
        .where(eq(decorDocuments.id, Number(other))),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });
});

describe('deletion — DECOR-009', () => {
  it('DECOR-009: the designated document cannot be deleted; once undesignated it can', async () => {
    const id = await live('home', [], 'home');
    expect(await codeOf(decor.deleteDocument(ctx, { id }))).toBe('DECOR_DOCUMENT_IN_USE');
    expect((await decor.getDocument(ctx, { id })).designation).toBe('home');

    await decor.designate(ctx, { designation: 'home', documentId: null });
    await decor.deleteDocument(ctx, { id });
    expect(await codeOf(decor.getDocument(ctx, { id }))).toBe('DECOR_DOCUMENT_NOT_FOUND');
    // Its revisions stay: they are history.
    expect(await revisionCount(id)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// preview tokens
// ---------------------------------------------------------------------------

describe('preview tokens — DECOR-012', () => {
  it('DECOR-012: a token opens the draft of its own document, uncached and marked preview', async () => {
    const id = await live('custom', [carousel('old', [slide])]);
    const detail = await decor.getDocument(ctx, { id });
    await decor.saveDraft(ctx, {
      id,
      document: doc([carousel('new', [slide])]),
      version: detail.draftVersion,
    });
    const { previewToken, expiresAt } = await decor.createPreviewToken(ctx, { id });
    expect(new Date(expiresAt).getTime() - new Date(NOW).getTime()).toBe(
      decor.PREVIEW_TOKEN_SECONDS * 1000,
    );

    const page = await decor.resolveDocument(anonymous(), { id, previewToken, ...NO_CLIENT });
    expect(page).toMatchObject({ preview: true, revision: null, version: `draft-${id}-3` });
    expect(page.blocks.map((block) => block.id)).toEqual(['new']);

    const published = await decor.resolveDocument(anonymous(), { id, ...NO_CLIENT });
    expect(published.blocks.map((block) => block.id)).toEqual(['old']);
    expect(published.preview).toBe(false);
  });

  it('DECOR-012: a token does not open another document, and a made-up token opens nothing', async () => {
    const mine = await drafted('custom', []);
    const other = await drafted('custom', []);
    const { previewToken } = await decor.createPreviewToken(ctx, { id: mine.id });
    expect(
      await codeOf(
        decor.resolveDocument(anonymous(), { id: other.id, previewToken, ...NO_CLIENT }),
      ),
    ).toBe('DECOR_PREVIEW_TOKEN_INVALID');
    expect(
      await codeOf(
        decor.resolveDocument(anonymous(), {
          id: mine.id,
          previewToken: 'x'.repeat(43),
          ...NO_CLIENT,
        }),
      ),
    ).toBe('DECOR_PREVIEW_TOKEN_INVALID');
    // Without a token, an unpublished document does not exist for the storefront.
    expect(await codeOf(decor.resolveDocument(anonymous(), { id: mine.id, ...NO_CLIENT }))).toBe(
      'DECOR_DOCUMENT_NOT_FOUND',
    );
  });

  it('DECOR-012: the token expires with Redis and is stored only as a hash', async () => {
    const { id } = await drafted('custom', []);
    const { previewToken } = await decor.createPreviewToken(ctx, { id });
    const keys = await harness.redis.keys('decor:preview:*');
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain(previewToken);
    expect(await harness.redis.get(keys[0]!)).toBe(id);
    const ttl = await harness.redis.ttl(keys[0]!);
    expect(ttl).toBeGreaterThan(decor.PREVIEW_TOKEN_SECONDS - 5);
    expect(ttl).toBeLessThanOrEqual(decor.PREVIEW_TOKEN_SECONDS);

    await harness.redis.del(keys[0]!); // what the TTL does
    expect(
      await codeOf(decor.resolveDocument(anonymous(), { id, previewToken, ...NO_CLIENT })),
    ).toBe('DECOR_PREVIEW_TOKEN_INVALID');
  });
});

// ---------------------------------------------------------------------------
// the resolver
// ---------------------------------------------------------------------------

/** Test-only blocks for the data kinds no shipped block uses yet. */
const testCoupons = defineBlock({
  type: 'testCoupons',
  v: 1,
  props: blockProps({ source: couponSource.default({ mode: 'auto', limit: 3 }) }),
  meta: { label: '测试券', pages: ['home', 'custom', 'user_center'] },
  data: (props) => ({ coupons: need.coupons(props.source) }),
});
const testNewUser = defineBlock({
  type: 'testNewUser',
  v: 1,
  props: blockProps({}),
  meta: { label: '测试新人券', pages: ['home', 'custom', 'user_center'] },
  data: () => ({ coupons: need.newUserCoupons(3) }),
});
const testArticles = defineBlock({
  type: 'testArticles',
  v: 1,
  props: blockProps({ source: articleSource.default({ mode: 'manual', ids: [] }) }),
  meta: { label: '测试资讯', pages: ['home', 'custom', 'user_center'] },
  data: (props) => ({ articles: need.articles(props.source) }),
});
const testCampaigns = defineBlock({
  type: 'testCampaigns',
  v: 1,
  props: blockProps({}),
  meta: { label: '测试活动', pages: ['home', 'custom', 'user_center'] },
  data: () => ({
    groupbuys: need.groupbuys({ mode: 'auto', limit: 3 }),
    presales: need.presales({ mode: 'auto', limit: 3 }),
  }),
});
const testFresh = defineBlock({
  type: 'testFresh',
  v: 1,
  props: blockProps({}),
  meta: { label: '新组件', pages: ['home', 'custom', 'user_center'], minClient: '2.0.0' },
});
const testRegistry = createBlockRegistry([
  ...decorBlocks.list(),
  testCoupons,
  testNewUser,
  testArticles,
  testCampaigns,
  testFresh,
]);

/** The draft of a new custom page with `blocks`, resolved through a preview token. */
async function previewOf(
  blocks: unknown[],
  as: Ctx = anonymous(),
  options: decor.ResolveOptions = { registry: testRegistry },
  clientVersion: string | null = null,
) {
  const { id } = await drafted('custom', blocks);
  const { previewToken } = await decor.createPreviewToken(ctx, { id });
  return decor.resolveDocument(as, { id, previewToken, clientVersion }, options);
}

type Summary = { id: string; title?: string; soldOut?: boolean; templateId?: string };
const idsIn = (
  page: { blocks: { data: Record<string, unknown> }[] },
  index: number,
  slot: string,
) =>
  ((page.blocks[index]!.data[slot] ?? []) as Summary[]).map((item) => item.templateId ?? item.id);

describe('resolved data — DECOR-013', () => {
  it('DECOR-013: a manual product list keeps the operator order, skips what is off the shelf and marks what is sold out', async () => {
    const a = await product({ name: '甲' });
    const off = await product({ status: 'off_shelf' });
    const soldOut = await product({ stock: 0 });
    const b = await product({ name: '乙', originalPrice: '80.00' });
    await live('home', [grid('g', { mode: 'manual', ids: [b, off, soldOut, a] })], 'home');

    const page = await decor.resolveHome(anonymous(), NO_CLIENT);
    const items = page.blocks[0]!.data.products as Summary[];
    expect(items.map((item) => item.id)).toEqual([b, soldOut, a]);
    expect(items[0]).toMatchObject({ title: '乙', price: '60.00', marketPrice: '80.00' });
    expect(items[1]).toMatchObject({ soldOut: true });
    expect(items[2]).not.toHaveProperty('soldOut');
  });

  it('DECOR-013: a category or label rule returns on-shelf products with stock only, at most the limit', async () => {
    const category = await productCategory('女装');
    const label = await productLabel('新品');
    const inCategory = [
      await product({ price: '10.00' }, { categoryId: category }),
      await product({ price: '30.00' }, { categoryId: category }),
      await product({ price: '20.00' }, { categoryId: category }),
    ];
    await product({ stock: 0 }, { categoryId: category });
    await product({ status: 'off_shelf' }, { categoryId: category });
    const labelled = await product({}, { labelId: label });
    await product({ stock: 0 }, { labelId: label });

    await live(
      'home',
      [
        grid('byCategory', {
          mode: 'category',
          categoryId: String(category),
          sort: 'priceAsc',
          limit: 2,
        }),
        grid('byLabel', { mode: 'label', labelId: String(label), sort: 'default', limit: 6 }),
      ],
      'home',
    );
    const page = await decor.resolveHome(anonymous(), NO_CLIENT);
    expect(idsIn(page, 0, 'products')).toEqual([inCategory[0], inCategory[2]]);
    expect(idsIn(page, 1, 'products')).toEqual([labelled]);
    expect((page.blocks[1]!.data.products as { tag?: string }[])[0]!.tag).toBe('新品');
  });

  it('DECOR-013: coupons, 新人券 and articles come back only when the shopper could see them', async () => {
    const claimable = await template();
    await template({ status: 'disabled' });
    await template({ claimMode: 'new_user' });
    const newUser = await template({ claimMode: 'new_user', name: '新人券' });
    const published = await article();
    const draft = await article({ status: 'draft', publishedAt: null });

    const page = await previewOf([
      { id: 'c', type: 'testCoupons', v: 1, props: { source: { mode: 'auto', limit: 5 } } },
      { id: 'n', type: 'testNewUser', v: 1, props: {} },
      {
        id: 'a',
        type: 'testArticles',
        v: 1,
        props: { source: { mode: 'manual', ids: [draft, published] } },
      },
      { id: 'k', type: 'testCampaigns', v: 1, props: {} },
    ]);
    expect(idsIn(page, 0, 'coupons')).toEqual([claimable]);
    expect(idsIn(page, 1, 'coupons')).toContain(newUser);
    expect(idsIn(page, 1, 'coupons')).not.toContain(claimable);
    expect(idsIn(page, 2, 'articles')).toEqual([published]);
    expect(page.blocks[3]!.data).toEqual({ groupbuys: [], presales: [] });
    // The per-shopper fields never travel in the public data.
    expect(page.blocks[0]!.data.coupons![0]).not.toHaveProperty('canClaim');
    expect(page.personal).toBeNull();
  });

  it('DECOR-013: a resolver that fails costs its slot, not the page', async () => {
    const a = await product();
    const page = await previewOf(
      [grid('g', { mode: 'manual', ids: [a] }), carousel('c', [slide])],
      anonymous(),
      {
        registry: testRegistry,
        resolvers: {
          products: () => Promise.reject(new Error('catalog down')),
        },
      },
    );
    expect(page.blocks.map((block) => block.id)).toEqual(['g', 'c']);
    expect(page.blocks[0]!.data).toEqual({ products: null });
  });
});

describe('page cache — DECOR-014', () => {
  it('DECOR-014: the public page is cached per revision, and a publish serves the new revision at once', async () => {
    const a = await product({ name: '原名' });
    const id = await live('home', [grid('g', { mode: 'manual', ids: [a] })], 'home');
    const first = await decor.resolveHome(anonymous(), NO_CLIENT);
    const revisionId = Number(first.version.replace('rev-', ''));
    expect(await harness.redis.ttl(decor.revisionCacheKey(revisionId))).toBeGreaterThan(0);

    // Data changes without a publish show once the short TTL runs out, not before.
    await ctx.db
      .update(products)
      .set({ name: '新名' })
      .where(eq(products.id, Number(a)));
    const cached = await decor.resolveHome(anonymous(), NO_CLIENT);
    expect((cached.blocks[0]!.data.products as Summary[])[0]!.title).toBe('原名');
    expect(cached.resolvedAt).toBe(first.resolvedAt);

    const detail = await decor.getDocument(ctx, { id });
    await decor.saveDraft(ctx, {
      id,
      document: doc([grid('g', { mode: 'manual', ids: [a] }), carousel('c', [slide])]),
      version: detail.draftVersion,
    });
    await decor.publish(ctx, { id, note: '' });
    expect(await harness.redis.exists(decor.revisionCacheKey(revisionId))).toBe(0);

    const next = await decor.resolveHome(anonymous(), NO_CLIENT);
    expect(next.version).not.toBe(first.version);
    expect(next.revision).toBe(2);
    expect(next.blocks.map((block) => block.id)).toEqual(['g', 'c']);
    expect((next.blocks[0]!.data.products as Summary[])[0]!.title).toBe('新名');
  });

  it('DECOR-014: a rollback also moves the page off the cached revision', async () => {
    const { id, version } = await drafted('home', [carousel('one', [slide])]);
    await decor.publish(ctx, { id, note: '' });
    await decor.designate(ctx, { designation: 'home', documentId: id });
    await decor.saveDraft(ctx, { id, document: doc([carousel('two', [slide])]), version });
    await decor.publish(ctx, { id, note: '' });
    expect((await decor.resolveHome(anonymous(), NO_CLIENT)).blocks[0]!.id).toBe('two');

    await decor.rollback(ctx, { id, number: 1, note: '' });
    const page = await decor.resolveHome(anonymous(), NO_CLIENT);
    expect(page.revision).toBe(3);
    expect(page.blocks[0]!.id).toBe('one');
  });

  it('DECOR-014: no home designated is DECOR_HOME_NOT_SET', async () => {
    await live('home', []);
    expect(await codeOf(decor.resolveHome(anonymous(), NO_CLIENT))).toBe('DECOR_HOME_NOT_SET');
  });
});

describe('per-shopper state — DECOR-015', () => {
  it('DECOR-015: with a session the page carries the coupon state of that shopper; without one, none', async () => {
    const uid = await user('shopper-1');
    const claimable = await template({ perUserLimit: 2 });
    const blocks = [
      {
        id: 'c',
        type: 'testCoupons',
        v: 1,
        props: { source: { mode: 'manual', ids: [claimable] } },
      },
    ];
    const signedIn = harness.as(shopper(uid));
    await coupon.claim(signedIn, { id: claimable });

    const page = await previewOf(blocks, signedIn);
    expect(page.personal).toEqual({
      c: {
        coupons: {
          kind: 'coupons',
          items: [{ templateId: claimable, claimedCount: 1, canClaim: true }],
        },
      },
    });
    expect((await previewOf(blocks, anonymous())).personal).toBeNull();
    // An admin session is not a shopper.
    expect((await previewOf(blocks, ctx)).personal).toBeNull();
  });

  it('DECOR-015: the cached public page holds nothing per shopper', async () => {
    const uid = await user('shopper-2');
    const a = await product();
    await live('home', [grid('g', { mode: 'manual', ids: [a] })], 'home');
    const page = await decor.resolveHome(harness.as(shopper(uid)), NO_CLIENT);
    expect(page.personal).toEqual({});
    const raw = await harness.redis.get(decor.revisionCacheKey(Number(page.version.slice(4))));
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).not.toHaveProperty('personal');
  });
});

describe('per-request filtering — DECOR-016', () => {
  const audience = (id: string, value: string, platforms: string[] = []) => ({
    ...carousel(id, [slide]),
    props: { slides: [slide], visibility: { audience: value, platforms } },
  });

  it('DECOR-016: blocks are filtered by audience and X-Client-Platform, per request, from one cached page', async () => {
    const uid = await user('shopper-3');
    await live(
      'home',
      [
        audience('everyone', 'all'),
        audience('guests', 'guest'),
        audience('members', 'member'),
        audience('miniOnly', 'all', ['wechat-mini']),
      ],
      'home',
    );
    const ids = (page: { blocks: { id: string }[] }) => page.blocks.map((block) => block.id);

    expect(ids(await decor.resolveHome(anonymous(), NO_CLIENT))).toEqual([
      'everyone',
      'guests',
      'miniOnly',
    ]);
    const h5Guest = forkTestCtx(harness, { actor: anonymousActor, platform: 'h5' });
    expect(ids(await decor.resolveHome(h5Guest, NO_CLIENT))).toEqual(['everyone', 'guests']);
    const miniMember = forkTestCtx(harness, { actor: shopper(uid), platform: 'wechat-mini' });
    expect(ids(await decor.resolveHome(miniMember, NO_CLIENT))).toEqual([
      'everyone',
      'members',
      'miniOnly',
    ]);
  });

  it('DECOR-016: a block type newer than the client is left out for that client only', async () => {
    const blocks = [carousel('c', [slide]), { id: 'fresh', type: 'testFresh', v: 1, props: {} }];
    const ids = async (clientVersion: string | null) =>
      (await previewOf(blocks, anonymous(), { registry: testRegistry }, clientVersion)).blocks.map(
        (block) => block.id,
      );
    expect(await ids('1.9.9')).toEqual(['c']);
    expect(await ids('2.0.0')).toEqual(['c', 'fresh']);
    expect(await ids('10.0.0')).toEqual(['c', 'fresh']);
    expect(await ids(null)).toEqual(['c', 'fresh']);
  });

  it('DECOR-016: unknown, newer-than-this-build and unparseable blocks are skipped, never served broken', async () => {
    const page = await previewOf([
      { id: 'unknown', type: 'liveStream', v: 1, props: {} },
      { id: 'newer', type: 'carousel', v: 9, props: { slides: [slide] } },
      carousel('broken', []),
      carousel('ok', [slide]),
    ]);
    expect(page.blocks.map((block) => block.id)).toEqual(['ok']);
    expect(page.blocks[0]!.props).toMatchObject({ height: 340, visibility: { audience: 'all' } });
  });

  it('DECOR-016: blockVisibleTo ignores a client version it cannot read', () => {
    const block = { type: 'testFresh', props: { visibility: { audience: 'all', platforms: [] } } };
    const caller = { signedIn: false, platform: null, clientVersion: 'beta' };
    expect(decor.blockVisibleTo(block, caller, testRegistry)).toBe(true);
    expect(decor.blockVisibleTo(block, { ...caller, clientVersion: '1.0.0' }, testRegistry)).toBe(
      false,
    );
  });
});

describe('the built-in 个人中心 — DECOR-005', () => {
  it('DECOR-005: with nothing designated the storefront gets the built-in 个人中心; once designated, that one', async () => {
    const builtin = await decor.resolveUserCenter(anonymous(), NO_CLIENT);
    expect(builtin).toMatchObject({
      id: null,
      kind: 'user_center',
      revision: null,
      version: USER_CENTER_DEFAULT_VERSION,
    });
    expect(builtin.blocks.map((block) => block.type)).toEqual([
      'userCard',
      'orderEntry',
      'serviceGrid',
    ]);

    const created = await decor.createDocument(ctx, { kind: 'user_center', name: '我的' });
    const detail = await decor.getDocument(ctx, { id: created.id });
    await decor.saveDraft(ctx, {
      id: created.id,
      document: { ...detail.draft, blocks: detail.draft.blocks.slice(0, 2) },
      version: detail.draftVersion,
    });
    await decor.publish(ctx, { id: created.id, note: '' });
    await decor.designate(ctx, { designation: 'user_center', documentId: created.id });

    const designated = await decor.resolveUserCenter(anonymous(), NO_CLIENT);
    expect(designated).toMatchObject({ id: created.id, revision: 1 });
    expect(designated.blocks.map((block) => block.type)).toEqual(['userCard', 'orderEntry']);

    await decor.designate(ctx, { designation: 'user_center', documentId: null });
    expect((await decor.resolveUserCenter(anonymous(), NO_CLIENT)).version).toBe(
      USER_CENTER_DEFAULT_VERSION,
    );
  });
});
