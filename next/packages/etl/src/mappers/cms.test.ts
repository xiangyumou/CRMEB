import { describe, expect, it } from 'vitest';
import {
  categoryIdsOf,
  instantOf,
  mapCms,
  type LegacyArticle,
  type LegacyArticleCategory,
} from './cms';

/** Shaped like `eb_article` in `crmeb/public/install/crmeb.sql`. */
function article(overrides: Partial<LegacyArticle> = {}): LegacyArticle {
  return {
    id: 101,
    cid: '3',
    title: '双十一活动说明',
    author: '运营部',
    image_input: '/uploads/2026/10/cover.png',
    synopsis: '活动时间与优惠券发放。',
    share_title: '双十一来了',
    share_synopsis: '满 199 减 20',
    visit: '3421',
    sort: 50,
    url: '',
    status: 1,
    add_time: '1761100000',
    hide: 0,
    admin_id: 1,
    mer_id: 0,
    product_id: 77,
    is_hot: 1,
    is_banner: 0,
    ...overrides,
  };
}

function category(overrides: Partial<LegacyArticleCategory> = {}): LegacyArticleCategory {
  return {
    id: 3,
    pid: 0,
    title: '新闻资讯',
    intr: '商城公告',
    image: '',
    status: 1,
    sort: 10,
    is_del: 0,
    add_time: '1700000000',
    hidden: 0,
    ...overrides,
  };
}

describe('categories', () => {
  it('maps a two-level tree and the status pair', () => {
    const out = mapCms({
      categories: [category(), category({ id: 4, pid: 3, title: '商城公告', intr: '', hidden: 1 })],
    });
    expect(out.categories).toMatchObject([
      { id: 3, parentId: null, title: '新闻资讯', intro: '商城公告', status: 'visible' },
      { id: 4, parentId: 3, title: '商城公告', intro: null, status: 'hidden' },
    ]);
  });

  it('flattens a third level onto its top-level ancestor', () => {
    const out = mapCms({
      categories: [category(), category({ id: 4, pid: 3 }), category({ id: 5, pid: 4 })],
    });
    expect(out.categories[2]).toMatchObject({ id: 5, parentId: 3 });
    expect(out.report.categoriesFlattened).toBe(1);
  });

  it('treats an orphan as a root rather than losing the category', () => {
    const out = mapCms({ categories: [category({ id: 9, pid: 404 })] });
    expect(out.categories[0]).toMatchObject({ id: 9, parentId: null });
    expect(out.report.categoriesOrphaned).toBe(1);
  });

  it('carries the deleted flag over as a soft delete', () => {
    const out = mapCms({ categories: [category({ is_del: 1 })] });
    expect(out.categories[0]?.deletedAt).toEqual(new Date(1700000000 * 1000));
    expect(out.report.categoriesDeleted).toBe(1);
  });
});

describe('articles', () => {
  it('maps the columns that survive', () => {
    const out = mapCms({ categories: [category()], articles: [article()] });
    expect(out.articles[0]).toEqual({
      id: 101,
      categoryId: 3,
      title: '双十一活动说明',
      slug: null,
      author: '运营部',
      coverImageUrl: '/uploads/2026/10/cover.png',
      summary: '活动时间与优惠券发放。',
      shareTitle: '双十一来了',
      shareSummary: '满 199 减 20',
      sourceUrl: null,
      productId: 77,
      status: 'published',
      isHot: true,
      isBanner: false,
      views: 3421,
      sortOrder: 50,
      publishedAt: new Date(1761100000 * 1000),
      createdAt: new Date(1761100000 * 1000),
      updatedAt: new Date(1761100000 * 1000),
      deletedAt: null,
    });
  });

  it.each([
    [{ status: 1, hide: 0 }, 'published'],
    [{ status: 0, hide: 0 }, 'draft'],
    [{ status: 1, hide: 1 }, 'hidden'],
    [{ status: 0, hide: 1 }, 'hidden'],
  ])('collapses %o into one status', (flags, expected) => {
    const out = mapCms({ categories: [category()], articles: [article(flags)] });
    expect(out.articles[0]?.status).toBe(expected);
    // Only a published article may carry a timestamp — the check constraint.
    expect(out.articles[0]?.publishedAt === null).toBe(expected !== 'published');
  });

  it('counts the row that claimed to be displayed and hidden at once', () => {
    const out = mapCms({ articles: [article({ status: 1, hide: 1, cid: '0' })] });
    expect(out.report.articlesStatusConflict).toBe(1);
  });

  it('keeps the first of several categories and reports the rest', () => {
    const out = mapCms({ categories: [category()], articles: [article({ cid: '3,4,5' })] });
    expect(out.articles[0]?.categoryId).toBe(3);
    expect(out.report.articlesMultiCategory).toBe(1);
  });

  it('files an article under no category when its cid names a missing one', () => {
    const out = mapCms({ articles: [article({ cid: '404' })] });
    expect(out.articles[0]?.categoryId).toBeNull();
    expect(out.report.articlesCategoryMissing).toBe(1);
  });

  it('parses the varchar hit counter and floors junk at zero', () => {
    const out = mapCms({
      articles: [article({ visit: '' }), article({ id: 102, visit: '-5' })],
    });
    expect(out.articles.map((row) => row.views)).toEqual([0, 0]);
    expect(out.report.articlesViewsUnparseable).toBe(1);
  });
});

describe('bodies', () => {
  it('runs the injected sanitiser and counts what it changed', () => {
    const out = mapCms({
      articles: [article()],
      contents: [
        { nid: 101, content: '<p>好</p><script>alert(1)</script>' },
        { nid: 404, content: '<p>孤儿</p>' },
      ],
      sanitize: (html) => html.replace(/<script>.*?<\/script>/g, ''),
    });
    expect(out.contents).toEqual([{ articleId: 101, contentHtml: '<p>好</p>' }]);
    expect(out.report).toMatchObject({ contentsOrphaned: 1, contentsSanitised: 1 });
  });

  it('says so rather than pretending when no sanitiser is passed', () => {
    const out = mapCms({
      articles: [article()],
      contents: [{ nid: 101, content: '<script>alert(1)</script>' }],
    });
    expect(out.report.contentsUnsanitised).toBe(1);
    expect(out.report.contentsSanitised).toBe(0);
  });

  it('turns a NULL body into an empty string, which the column requires', () => {
    const out = mapCms({ articles: [article()], contents: [{ nid: 101, content: null }] });
    expect(out.contents[0]?.contentHtml).toBe('');
  });
});

describe('helpers', () => {
  it('parses unix seconds out of the varchar timestamps', () => {
    expect(instantOf('1700000000')).toEqual(new Date(1700000000 * 1000));
    expect(instantOf('')).toEqual(new Date(0));
    expect(instantOf(0)).toEqual(new Date(0));
  });

  it('splits the comma-joined category column', () => {
    expect(categoryIdsOf('3,4')).toEqual([3, 4]);
    expect(categoryIdsOf('0')).toEqual([]);
    expect(categoryIdsOf('')).toEqual([]);
  });
});
