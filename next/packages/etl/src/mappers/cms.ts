/**
 * 文章 — `eb_article`, `eb_article_category` and `eb_article_content` → the CMS
 * schema.
 *
 * | Legacy                | New                  |
 * | --------------------- | -------------------- |
 * | `eb_article_category` | `article_categories` |
 * | `eb_article`          | `articles`           |
 * | `eb_article_content`  | `article_contents`   |
 *
 * A pure function: rows in, rows and a report out. Nothing here opens a
 * connection or reads a clock.
 *
 * Four legacy shapes do not survive, and each is a defect rather than a
 * feature:
 *
 * **`status` + `hide` become one enum.** The legacy pair could say "displayed
 * and hidden" at the same time, and the storefront read neither — every article
 * was public. `hide = 1` wins and becomes `hidden`; `status = 1` with no hide is
 * `published`; anything else is `draft`.
 *
 * **`visit` was a `varchar` counter.** It is parsed, floored at zero, and
 * non-numeric junk is counted in the report rather than silently zeroed.
 *
 * **`cid` was a string holding one *or more* category ids.** The new column is
 * one nullable foreign key: the first id wins and the rest are reported. A
 * "filed under three categories" article was already rendered under the first
 * one by the legacy list.
 *
 * **The body is not migrated verbatim.** The legacy pair stored what the editor
 * sent and served it raw. Pass `sanitize` (that is `sanitizeHtml` from
 * `@shop/core/cms`) and the runner writes markup that is already safe; leave it
 * out and the mapper reports every body as unsanitised rather than pretending.
 *
 * Two columns are dropped outright: `admin_id` (the new table has no author
 * foreign key — `author` is free text, as the legacy UI also treated it) and
 * `mer_id` (single merchant).
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_article_category`. `add_time` is unix seconds in a varchar. */
export interface LegacyArticleCategory {
  id: number;
  pid: number;
  title: string;
  intr: string;
  image: string;
  /** 1 显示, 0 不显示. */
  status: number;
  sort: number;
  is_del: number;
  add_time: string;
  hidden: number;
}

/** `eb_article`. */
export interface LegacyArticle {
  id: number;
  /** One id, or several joined by a comma. `'0'` for none. */
  cid: string;
  title: string;
  author: string;
  image_input: string;
  synopsis: string;
  share_title: string;
  share_synopsis: string;
  /** Hit counter, stored as text. */
  visit: string;
  sort: number;
  url: string;
  status: number;
  add_time: string;
  hide: number;
  admin_id: number;
  mer_id: number;
  product_id: number;
  is_hot: number;
  is_banner: number;
}

/** `eb_article_content`. `nid` is the article id. */
export interface LegacyArticleContent {
  nid: number;
  content: string | null;
}

// ---------------------------------------------------------------------------
// new row shapes
// ---------------------------------------------------------------------------

export type ArticleCategoryStatus = 'visible' | 'hidden';
export type ArticleStatus = 'draft' | 'published' | 'hidden';

export interface ArticleCategoryRow {
  id: number;
  parentId: number | null;
  title: string;
  intro: string | null;
  imageUrl: string | null;
  status: ArticleCategoryStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ArticleRow {
  id: number;
  categoryId: number | null;
  title: string;
  /** The legacy table has no slug column; the numeric id keeps working. */
  slug: null;
  author: string | null;
  coverImageUrl: string | null;
  summary: string | null;
  shareTitle: string | null;
  shareSummary: string | null;
  sourceUrl: string | null;
  productId: number | null;
  status: ArticleStatus;
  isHot: boolean;
  isBanner: boolean;
  views: number;
  sortOrder: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: null;
}

export interface ArticleContentRow {
  articleId: number;
  contentHtml: string;
}

export interface CmsMigrationReport {
  categories: number;
  /** Categories deeper than two levels, re-parented to their top-level ancestor. */
  categoriesFlattened: number;
  /** Categories whose `pid` names a row that does not exist; filed as top level. */
  categoriesOrphaned: number;
  categoriesDeleted: number;
  articles: number;
  /** Articles whose `cid` named more than one category; the first won. */
  articlesMultiCategory: number;
  /** Articles whose `cid` named a category that does not exist. */
  articlesCategoryMissing: number;
  /**
   * Articles whose `product_id` names a product the catalog migration does not
   * have. The article keeps its text and loses the link: `articles.product_id`
   * is a real foreign key, and one stale id would otherwise roll back every
   * article with it.
   */
  articlesProductCleared: number;
  /**
   * Text longer than the new column: a category title (legacy 255 → 100) or an
   * author (255 → 64), cut to fit. The legacy admin never enforced a length;
   * one long title would otherwise fail the whole group on `value too long`.
   */
  fieldsTruncated: number;
  /** Articles whose `visit` was not a number. Migrated as 0. */
  articlesViewsUnparseable: number;
  /** Articles that were `status = 1` and `hide = 1` at once. Migrated as hidden. */
  articlesStatusConflict: number;
  /** Bodies with no article row. Dropped: `article_contents.article_id` is a foreign key. */
  contentsOrphaned: number;
  /** Bodies the sanitiser changed. */
  contentsSanitised: number;
  /** Bodies migrated with no sanitiser passed in. Zero in a real run. */
  contentsUnsanitised: number;
  byStatus: Record<ArticleStatus, number>;
}

export interface CmsMigrationInput {
  categories?: readonly LegacyArticleCategory[];
  articles?: readonly LegacyArticle[];
  contents?: readonly LegacyArticleContent[];
  /**
   * `sanitizeHtml` from `@shop/core/cms`. Injected rather than imported so this
   * package keeps its single dependency-free shape; the runner has both.
   */
  sanitize?: ((html: string) => string) | undefined;
  /** Product ids that survived the catalog migration. Omitted, every id is taken on trust. */
  keptProductIds?: ReadonlySet<number>;
}

export interface CmsMigrationOutput {
  categories: ArticleCategoryRow[];
  articles: ArticleRow[];
  contents: ArticleContentRow[];
  report: CmsMigrationReport;
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

/** Unix seconds in a string, as every legacy timestamp column stores them. */
export function instantOf(raw: string | number): Date {
  const seconds = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date(0);
}

/** `'3,4'` → `[3, 4]`; `'0'`, `''` and junk → `[]`. */
export function categoryIdsOf(raw: string): number[] {
  return raw
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function mapCms(input: CmsMigrationInput): CmsMigrationOutput {
  const categories: ArticleCategoryRow[] = [];
  const articles: ArticleRow[] = [];
  const contents: ArticleContentRow[] = [];

  let categoriesFlattened = 0;
  let categoriesOrphaned = 0;
  let categoriesDeleted = 0;
  let articlesMultiCategory = 0;
  let articlesCategoryMissing = 0;
  let articlesProductCleared = 0;
  let fieldsTruncated = 0;
  /** `value` cut to `max` characters, counted when it had to be. */
  const fit = <T extends string | null>(value: T, max: number): T => {
    if (value === null || value.length <= max) return value;
    fieldsTruncated += 1;
    return value.slice(0, max) as T;
  };
  let articlesViewsUnparseable = 0;
  let articlesStatusConflict = 0;
  let contentsOrphaned = 0;
  let contentsSanitised = 0;
  let contentsUnsanitised = 0;
  const byStatus: Record<ArticleStatus, number> = { draft: 0, published: 0, hidden: 0 };

  // --- categories ------------------------------------------------------------
  const legacyCategories = input.categories ?? [];
  const byId = new Map(legacyCategories.map((row) => [row.id, row]));

  /** The top-level ancestor, or `null` for a root. The tree is capped at two. */
  const parentOf = (row: LegacyArticleCategory): { parentId: number | null; depth: number } => {
    if (row.pid === 0) return { parentId: null, depth: 0 };
    let current = byId.get(row.pid);
    if (current === undefined) {
      categoriesOrphaned += 1;
      return { parentId: null, depth: 0 };
    }
    let depth = 1;
    const seen = new Set<number>([row.id]);
    // Walk up to the top-level ancestor; a cycle stops at the first repeat.
    while (current.pid !== 0 && !seen.has(current.id)) {
      seen.add(current.id);
      const next = byId.get(current.pid);
      if (next === undefined) break;
      current = next;
      depth += 1;
    }
    if (depth > 1) categoriesFlattened += 1;
    return { parentId: current.id === row.id ? null : current.id, depth };
  };

  for (const row of legacyCategories) {
    const { parentId } = parentOf(row);
    const createdAt = instantOf(row.add_time);
    if (row.is_del === 1) categoriesDeleted += 1;
    categories.push({
      id: row.id,
      parentId,
      title: fit(row.title, 100),
      intro: textOrNull(row.intr),
      imageUrl: textOrNull(row.image),
      status: row.status === 1 && row.hidden === 0 ? 'visible' : 'hidden',
      sortOrder: row.sort,
      createdAt,
      updatedAt: createdAt,
      deletedAt: row.is_del === 1 ? createdAt : null,
    });
  }
  // Roots first. `article_categories.parent_id` is a real foreign key, and the
  // runner inserts in batches: a child that happened to precede its parent in
  // the dump would otherwise be checked before the parent existed.
  categories.sort((a, b) => Number(a.parentId !== null) - Number(b.parentId !== null));
  const liveCategoryIds = new Set(
    categories.filter((row) => row.deletedAt === null).map((row) => row.id),
  );

  // --- articles --------------------------------------------------------------
  for (const row of input.articles ?? []) {
    const ids = categoryIdsOf(row.cid);
    if (ids.length > 1) articlesMultiCategory += 1;
    const first = ids[0];
    let categoryId: number | null = null;
    if (first !== undefined) {
      if (liveCategoryIds.has(first)) categoryId = first;
      else articlesCategoryMissing += 1;
    }

    const views = Number.parseInt(row.visit, 10);
    if (!Number.isFinite(views)) articlesViewsUnparseable += 1;

    if (row.hide === 1 && row.status === 1) articlesStatusConflict += 1;
    const status: ArticleStatus =
      row.hide === 1 ? 'hidden' : row.status === 1 ? 'published' : 'draft';
    byStatus[status] += 1;

    let productId: number | null = row.product_id > 0 ? row.product_id : null;
    if (productId !== null && input.keptProductIds && !input.keptProductIds.has(productId)) {
      articlesProductCleared += 1;
      productId = null;
    }

    const createdAt = instantOf(row.add_time);
    articles.push({
      id: row.id,
      categoryId,
      title: row.title,
      slug: null,
      author: fit(textOrNull(row.author), 64),
      coverImageUrl: textOrNull(row.image_input),
      summary: textOrNull(row.synopsis),
      shareTitle: textOrNull(row.share_title),
      shareSummary: textOrNull(row.share_synopsis),
      sourceUrl: textOrNull(row.url),
      productId,
      status,
      isHot: row.is_hot === 1,
      isBanner: row.is_banner === 1,
      views: Number.isFinite(views) ? Math.max(0, views) : 0,
      sortOrder: row.sort,
      // `articles_published_shape` requires a timestamp on a published row, and
      // the only date the legacy table has is when it was added.
      publishedAt: status === 'published' ? createdAt : null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
  }
  const articleIds = new Set(articles.map((row) => row.id));

  // --- bodies ----------------------------------------------------------------
  for (const row of input.contents ?? []) {
    if (!articleIds.has(row.nid)) {
      contentsOrphaned += 1;
      continue;
    }
    const raw = row.content ?? '';
    if (input.sanitize === undefined) {
      contentsUnsanitised += 1;
      contents.push({ articleId: row.nid, contentHtml: raw });
      continue;
    }
    const clean = input.sanitize(raw);
    if (clean !== raw) contentsSanitised += 1;
    contents.push({ articleId: row.nid, contentHtml: clean });
  }

  return {
    categories,
    articles,
    contents,
    report: {
      categories: categories.length,
      categoriesFlattened,
      categoriesOrphaned,
      categoriesDeleted,
      articles: articles.length,
      articlesMultiCategory,
      articlesCategoryMissing,
      articlesProductCleared,
      fieldsTruncated,
      articlesViewsUnparseable,
      articlesStatusConflict,
      contentsOrphaned,
      contentsSanitised,
      contentsUnsanitised,
      byStatus,
    },
  };
}
